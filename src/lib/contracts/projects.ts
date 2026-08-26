import type { ContentSchema } from "./content-schema";
import type { DeploymentState } from "./deploy";

// A site the user owns. Both creation paths (template fork, AI generation) converge here.
// "draft" = no deployment yet; otherwise it mirrors the latest deployment's state.
export type ProjectStatus = "draft" | DeploymentState;

// Editable site-wide settings (S-3, S-4). Asset ids point at rows in `assets`; the URLs
// beside them are what actually goes into the published `<head>`, because a static site on
// someone else's hosting has no way to resolve an id at serve time. Both are kept: the id is
// the provenance record, the URL is the reference.
export interface SiteMeta {
  title?: string;
  description?: string;
  faviconAssetId?: string;
  faviconUrl?: string;
  ogImageAssetId?: string;
  ogImageUrl?: string;
  /** Shop owner's UPI VPA — used on generated order-taking sites. */
  upiId?: string;
  /**
   * Pages finished in the walkthrough, as file paths.
   *
   * On Starter, confirming a page is final and it cannot be written again — see
   * src/lib/data/page-locks.ts, which owns that rule. Kept here rather than in a table of
   * its own: it is a short list of file names belonging to one project, and site_meta is
   * already merged on patch.
   */
  confirmedPages?: string[];
}

/**
 * What went wrong with the latest publish, in words the owner can act on (R3 D18).
 *
 * Present only when the newest attempt did not reach `live`. Carried on the dashboard row
 * itself because V-7 asks for a failed publish to be visible *without opening the project* —
 * and "it failed" without a reason or a next step sends the person into the project anyway,
 * which is the thing V-7 is trying to avoid.
 */
export interface ProjectFailure {
  /** A stable key from a closed set, for anything that needs to branch rather than read. */
  reason: string;
  /** What happened. One sentence, no code, no jargon. */
  what: string;
  /** What happens next, or what they can do about it. */
  next: string;
  /** Whether pressing publish again is a sensible thing to offer. */
  retryable: boolean;
}

// Dashboard row (GET /projects). Carries the latest deployment status so a failed
// publish is visible without opening the project (V-7).
export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  liveUrl: string | null;
  thumbnailUrl: string | null;
  updatedAt: string;
  /** Set when the latest attempt did not reach live; null when it did, or never ran. */
  failure: ProjectFailure | null;
}

// Full project (GET /projects/{id}).
export interface ProjectDetail extends ProjectSummary {
  sourceTemplateId: string | null; // null for generated projects
  contentJson: Record<string, unknown>;
  // The project's own copy, taken at fork (R3 D7). The content panel is generated from
  // this and nothing else (C-07), so it has to travel with the project rather than being
  // fetched from the template — which for a retired design no longer exists. A generated
  // project with no schema yet gets an empty one ({ sections: [] }), never null — see
  // rowToDetail in data/projects.ts.
  contentSchema: ContentSchema;
  siteMeta: SiteMeta;
  formEndpoint: string | null; // null renders contact forms disabled (S-2)
}

// POST /projects — fork a template (synchronous) or start a generation (async).
/** Facts for a template fork — written onto the design instead of generating a new site. */
export interface ProjectBrief {
  name: string;
  offer: string;
  place: string;
  phone?: string;
  hours?: string;
  extra?: string;
}

export interface CreateProjectRequest {
  name: string;
  sourceTemplateId?: string; // fork path
  mode?: "generate"; // generation path
  prompt?: string; // generation path
  brief?: ProjectBrief; // fork path: replace placeholder copy
}

export interface CreateProjectResponse {
  id: string;
  firstCommit?: string; // fork returns the initial commit sha
  jobId?: string; // generate returns a job to poll
}

// PATCH /projects/{id} — rename + site settings (S-2, S-3, S-4).
export interface PatchProjectRequest {
  name?: string;
  siteMeta?: SiteMeta;
  formEndpoint?: string | null;
}

// DELETE /projects/{id} — same email + password shape as sign-in (C-11).
export interface DeleteProjectRequest {
  email: string;
  password: string;
}
