import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContentSchema,
  DeploymentState,
  ProjectStatus,
  CreateProjectRequest,
  CreateProjectResponse,
  FileMap,
  PatchProjectRequest,
  ProjectDetail,
  ProjectFailure,
  ProjectSummary,
  SiteMeta,
  TemplateTier,
} from "@/lib/contracts";
import { ApiError } from "@/lib/errors/respond";
import { clientFault } from "./pg-errors";
import { putProjectFiles } from "./project-files";
import { createCommit } from "./commits";
import { contentFromFiles } from "@/lib/content/from-files";
import { personaliseContent, personaliseFiles } from "@/lib/content/personalise";
import { expandTemplateSite } from "@/lib/content/expand-template";
import { asContentSchema } from "@/lib/content/schema";
import { PROJECTS_PER_USER } from "@/lib/limits/config";
import { failureMessage, toFailureReason } from "@/lib/deploy/failure";
// Shared with the publish gate (R3 D9), so fork and publish agree about what a live
// entitlement is — including that a lapsed one is not.
import { hasPro } from "./entitlements";
import { TEMPLATES } from "@/lib/templates";
import { writeLibraryRows } from "@/lib/templates/row";
import { templateUuid } from "@/lib/templates/template-id";
import { supabaseAdminOrNull } from "./supabase-admin";

const PROJECT_COLUMNS =
  "id, name, source_template_id, content_json, content_schema, site_meta, form_endpoint, updated_at";
const DETAIL_COLUMNS = `${PROJECT_COLUMNS}, deployments(status, live_url, created_at)`;
const SUMMARY_COLUMNS = "id, name, updated_at, deployments(status, live_url, created_at)";
const SUMMARY_COLUMNS_PLAIN = "id, name, updated_at";

interface DeploymentRow {
  status: DeploymentState;
  live_url: string | null;
  failure_reason: string | null;
  created_at: string;
}

// Newest attempt wins. One row per publish attempt, success and failure alike (V-7),
// so the dashboard shows a failed publish without the user opening the project.
function latestDeployment(rows: DeploymentRow[] | null | undefined): DeploymentRow | null {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}

function statusOf(rows: DeploymentRow[] | null | undefined): ProjectStatus {
  return latestDeployment(rows)?.status ?? "draft";
}

// C-05: never surface a URL that has not been confirmed to respond. The database
// CHECK guarantees live_url is non-null when status is 'live'; anything else shows nothing.
function liveUrlOf(rows: DeploymentRow[] | null | undefined): string | null {
  const d = latestDeployment(rows);
  return d && d.status === "live" ? d.live_url : null;
}

/**
 * Why the latest publish did not go live, in words (R3 D18, V-7).
 *
 * Null once a site is live, and null for a project that has never been published — neither
 * of those is a failure and inventing an explanation for them would be noise on every row.
 * `verifying` is included deliberately: it is not a failure either, but a person who pressed
 * publish two minutes ago and sees nothing needs to be told the site is on its way, and the
 * words for that reason say exactly that.
 */
function failureOf(rows: DeploymentRow[] | null | undefined): ProjectFailure | null {
  const d = latestDeployment(rows);
  if (!d) return null;
  if (d.status === "live") return null;
  if (!d.failure_reason && d.status !== "failed") return null;

  const reason = toFailureReason(d.failure_reason);
  const { what, next, retryable } = failureMessage(reason);
  return { reason, what, next, retryable };
}

interface ProjectRow {
  id: string;
  name: string;
  source_template_id: string | null;
  content_json: Record<string, unknown>;
  content_schema: ContentSchema | null;
  site_meta: SiteMeta;
  form_endpoint: string | null;
  updated_at: string;
  deployments?: DeploymentRow[] | null;
}

function rowToDetail(row: ProjectRow): ProjectDetail {
  return {
    id: row.id,
    name: row.name,
    status: statusOf(row.deployments),
    liveUrl: liveUrlOf(row.deployments),
    failure: failureOf(row.deployments),
    thumbnailUrl: null,
    updatedAt: row.updated_at,
    sourceTemplateId: row.source_template_id,
    contentJson: row.content_json ?? {},
    contentSchema: asContentSchema(row.content_schema),
    siteMeta: row.site_meta ?? {},
    formEndpoint: row.form_endpoint,
  };
}

// Owner-scoped by RLS; the explicit user_id filter is defence in depth.
export async function listProjects(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProjectSummary[]> {
  const first = await supabase
    .from("projects")
    .select(SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const { data, error } = first.error
    ? await supabase
        .from("projects")
        .select(SUMMARY_COLUMNS_PLAIN)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
    : first;

  if (error) {
    throw new ApiError("internal", "Could not list your sites.", error.message);
  }

  return (data ?? []).map((row) => {
    const r = row as unknown as ProjectRow;
    return {
      id: r.id,
      name: r.name,
      status: statusOf(r.deployments),
      liveUrl: liveUrlOf(r.deployments),
      failure: failureOf(r.deployments),
      thumbnailUrl: null,
      updatedAt: r.updated_at,
    };
  });
}

// A leaked id belonging to another user returns not_found, never the row (SEC-14, RLS).
export async function getProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectDetail> {
  const first = await supabase
    .from("projects")
    .select(DETAIL_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();

  // The deployments embed is optional status. If PostgREST cannot resolve the
  // relationship (schema cache, missing grant), still open the editor from the row.
  const { data, error } = first.error
    ? await supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
        .eq("id", projectId)
        .maybeSingle()
    : first;

  if (error) {
    // A malformed id in the URL is the caller's mistake, not ours. Reported as `internal`
    // it becomes a 500 and tells the user to wait for a fix that is never coming (R4 D14).
    throw (
      clientFault(error, "That project address is not valid.") ??
      new ApiError("internal", "Could not read the project.", error.message)
    );
  }
  if (!data) throw new ApiError("not_found", "That project does not exist.");

  const row = data as unknown as ProjectRow;
  return rowToDetail(row);
}

/** How many sites this account already holds. Pro accounts are not capped. */
async function assertUnderQuota(
  supabase: SupabaseClient,
  userId: string,
  pro: boolean,
): Promise<void> {
  if (pro) return;

  // The ids rather than an exact count header: the cap is small by construction, so this is
  // a handful of uuids either way, and it does not depend on PostgREST's counting options
  // being modelled anywhere a test might run.
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId);

  if (error) throw new ApiError("internal", "Could not check your sites.", error.message);

  const count = (data ?? []).length;

  if (count >= PROJECTS_PER_USER) {
    // payment_required rather than rate_limited: waiting changes nothing, and the two ways
    // out — delete a site, or upgrade — are both things the person can act on now.
    throw new ApiError(
      "payment_required",
      `You have reached ${PROJECTS_PER_USER} sites. Delete one, or upgrade, to make another.`,
      `projects=${count}`,
    );
  }
}

/**
 * The gallery is the in-memory library; fork is a foreign key into `templates`.
 * If the library has the design and the table does not, write the row first so
 * "Use this design" does not fail with a broken FK (and `internal`).
 *
 * Writes go through the service role when it is available — authenticated users
 * can only read the catalogue. Tests without env fall back to the caller client.
 */
async function ensureLibraryTemplate(
  supabase: SupabaseClient,
  sourceTemplateId: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("templates")
    .select("id")
    .eq("id", sourceTemplateId)
    .maybeSingle();
  if (existing) return true;

  const design = TEMPLATES.find((template) => templateUuid(template.id) === sourceTemplateId);
  if (!design) return false;

  const writer = supabaseAdminOrNull() ?? supabase;
  const { error } = await writeLibraryRows(writer, [design]);
  if (error) {
    throw new ApiError("internal", "Could not load that design.", error.message);
  }
  return true;
}

// Fork a template (R3 D8).
//
// A person picks a design and expects to land in the editor looking at it. That means the
// template's files are copied into the project's own working tree — a copy, never a
// reference, so editing a project can never change the template or another project made
// from it — and the state they arrived at is recorded as version #1. Without that first
// commit their history starts empty and there is nothing to restore back to.
//
// Without a sourceTemplateId this is still just an empty project row. The generate
// route fills it in once the job finishes (files, schema, first commit).
export async function createProject(
  supabase: SupabaseClient,
  userId: string,
  req: CreateProjectRequest,
): Promise<CreateProjectResponse> {
  // Both gates are checked here rather than in the route, because they are facts about the
  // database and the route only has the caller's word for anything (R3 D8).
  const pro = await hasPro(supabase, userId);
  await assertUnderQuota(supabase, userId, pro);

  if (req.sourceTemplateId) {
    const inLibrary = await ensureLibraryTemplate(supabase, req.sourceTemplateId);
    if (!inLibrary) {
      throw new ApiError("not_found", "That design does not exist.");
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: req.name,
      source_template_id: req.sourceTemplateId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // A sourceTemplateId that no longer exists is a bad request, not our failure: saying
    // `internal` would tell the caller to retry something that can never succeed.
    throw (
      clientFault(error, "That design is not available any more.") ??
      new ApiError("internal", "Could not create the project.", error.message)
    );
  }

  const projectId = data.id as string;
  if (!req.sourceTemplateId) return { id: projectId };

  try {
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("name, description, files, content_schema, tier")
      .eq("id", req.sourceTemplateId)
      .maybeSingle();

    if (templateError) {
      throw new ApiError("internal", "Could not read the template.", templateError.message);
    }
    if (!template) throw new ApiError("not_found", "That design does not exist.");

    let contentSchema = (template.content_schema ?? { sections: [] }) as ContentSchema;
    let files = (template.files ?? {}) as FileMap;
    let content = contentFromFiles(files, contentSchema);

    // The brief screen after "Use this design" writes the business onto this layout
    // and adds About, Contact and Settings in the same chrome — not a generated look.
    if (req.brief) {
      const next = personaliseContent(contentSchema, content, req.brief);
      files = personaliseFiles(files, contentSchema, next, req.brief);
      const expanded = expandTemplateSite(files, contentSchema, req.brief);
      files = expanded.files;
      contentSchema = expanded.schema;
      content = contentFromFiles(files, contentSchema);
    }
    await putProjectFiles(supabase, projectId, files);

    // The schema is copied for the same reason the files are (R3 D7). Read live through
    // source_template_id it was a reference, and a reference to a row that can be deleted
    // (`on delete set null`) or re-normalised under the project's feet — either of which
    // leaves someone holding a site they cannot edit.
    //
    // content_json is seeded from the markup at the same time, so the panel opens showing
    // the words that are on the page instead of a column of blanks. See content/from-files.
    const { error: seedError } = await supabase
      .from("projects")
      .update({
        content_schema: contentSchema,
        content_json: content,
        // Enough for publish to emit a real <title> and description on day one (S-2). Both
        // are the owner's to change from the settings panel; what they must not be is
        // absent, because a site that publishes with no title is one nobody finds and the
        // person has no reason to suspect it. The name is what they typed a moment ago;
        // the description is the design's own, which at least describes the page they are
        // looking at.
        site_meta: {
          title: req.brief?.name ?? req.name,
          ...(req.brief
            ? { description: `${req.brief.offer} in ${req.brief.place}` }
            : template.description
              ? { description: template.description as string }
              : {}),
        },
      })
      .eq("id", projectId);

    if (seedError) {
      throw new ApiError("internal", "Could not set up the project's content.", seedError.message);
    }

    const { sha } = await createCommit(
      supabase,
      projectId,
      `Created from ${template.name}`,
      "system",
      files,
    );

    return { id: projectId, firstCommit: sha };
  } catch (err) {
    // A project with no files is not a draft, it is wreckage: it renders as nothing and the
    // person cannot tell why. Remove it so they see the error and can pick again, rather
    // than finding an empty site in their dashboard tomorrow.
    await supabase.from("projects").delete().eq("id", projectId);
    throw err;
  }
}

export async function patchProject(
  supabase: SupabaseClient,
  projectId: string,
  req: PatchProjectRequest,
): Promise<ProjectDetail> {
  const patch: Record<string, unknown> = {};
  if (req.name !== undefined) patch.name = req.name;
  if (req.siteMeta !== undefined) patch.site_meta = req.siteMeta;
  if (req.formEndpoint !== undefined) patch.form_endpoint = req.formEndpoint;

  if (Object.keys(patch).length === 0) {
    return getProject(supabase, projectId);
  }

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .select(DETAIL_COLUMNS)
    .maybeSingle();

  if (error) {
    throw (
      clientFault(error, "Some of those settings were not allowed.") ??
      new ApiError("internal", "Could not update the project.", error.message)
    );
  }
  if (!data) throw new ApiError("not_found", "That project does not exist.");

  const row = data as unknown as ProjectRow;
  return rowToDetail(row);
}

// Removes our row only (RLS owner-scoped). A live site keeps serving until its hosting
// entitlement ends (C-12) — that is the deploy layer's concern, not this delete.
export async function deleteProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) {
    throw new ApiError("internal", "Could not remove the project.", error.message);
  }
}
