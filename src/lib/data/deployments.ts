import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deployment, DeploymentState } from "@/lib/contracts";
import { ApiError } from "@/lib/errors/respond";
import { clientFault } from "./pg-errors";
import { failureLine, toFailureReason, type FailureReason } from "@/lib/deploy/failure";

// The deployment row behind the dashboard (R3 D12, V-7, N-4).
//
// Nothing wrote one of these before today. The dashboard has read them since D2 —
// statusOf() and liveUrlOf() in data/projects.ts — so every project has shown "draft"
// however many times it was published, and a failed publish was invisible until somebody
// opened the project and tried again.
//
// One row per attempt, updated as it goes, because that is what the dashboard's own code is
// written around ("Newest attempt wins. One row per publish attempt"). A row per state
// change would make that comment false and turn one publish into six lines of history.

export interface DeploymentRecord {
    id: string;
    state: DeploymentState;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Begin recording an attempt.
 *
 * Written before anything is provisioned, so the dashboard says "publishing" while it
 * happens rather than staying blank until it is over. A publish that dies without ever
 * reporting back therefore leaves a `pending` row — which is honest: something was started
 * and nobody knows how it ended. A missing row would claim nothing was tried at all.
 */
export async function startDeployment(
    supabase: SupabaseClient,
    projectId: string,
    commitSha?: string | null,
): Promise<DeploymentRecord> {
    const { data, error } = await supabase
        .from("deployments")
        .insert({
            project_id: projectId,
            status: "pending" satisfies DeploymentState,
            ...(commitSha ? { commit_sha: commitSha } : {}),
        })
        .select("id")
        .single();

    if (error) {
        throw (
            clientFault(error, "That project cannot be published.") ??
            new ApiError("internal", "Could not start the deployment.", error.message)
        );
    }

    return { id: data.id as string, state: "pending" };
}

// Everything that is not yet an outcome. publish() reports each of these as it goes, so a
// row sitting in one of them means the attempt is still running — or died without saying so.
const IN_FLIGHT: DeploymentState[] = [
    "pending",
    "provisioning",
    "pushing",
    "enabling_hosting",
    "verifying",
];

// How long an in-flight row is believed before it is treated as abandoned.
//
// A publish killed mid-flight leaves its row in whatever state it reached and nothing ever
// moves it. Retries used to rejoin that dead row for fifteen minutes with no work
// scheduled — Go Live spun forever. Keep this just above a slow in-request publish.
const IN_FLIGHT_TTL_MS = 2 * 60 * 1000;

/**
 * The publish attempt already running for this project, if there is one.
 *
 * Owner-scoped by RLS through the caller's client, so this can never report somebody else's
 * publish. Returns null when the newest attempt has finished, or when it stalled long enough
 * ago to be written off.
 */
export async function openDeployment(
    supabase: SupabaseClient,
    projectId: string,
): Promise<DeploymentRecord | null> {
    const { data, error } = await supabase
        .from("deployments")
        .select("id, status, updated_at")
        .eq("project_id", projectId)
        .in("status", IN_FLIGHT)
        .order("updated_at", { ascending: false })
        .limit(1);

    if (error) {
        throw new ApiError("internal", "Could not check the site's publish state.", error.message);
    }

    const row = (data ?? [])[0] as { id: string; status: DeploymentState; updated_at: string } | undefined;
    if (!row) return null;

    const age = Date.now() - Date.parse(row.updated_at);
    if (Number.isFinite(age) && age > IN_FLIGHT_TTL_MS) return null;

    return { id: row.id, state: row.status };
}

export interface DeploymentView {
    id: string;
    projectId: string;
    state: DeploymentState;
    repoUrl: string | null;
    liveUrl: string | null;
    commitSha: string | null;
    /** The redacted provider detail. For logs and support, not for the owner (R3 D18). */
    error: string | null;
    /** Why it stopped. Turn it into words with lib/deploy/failure.ts. */
    failureReason: FailureReason | null;
}

/**
 * One deployment, for the poll route.
 *
 * Owner-scoped by RLS: another account's deployment comes back as no row at all, which the
 * route reports as not_found. Its existence is not ours to leak, so this deliberately cannot
 * tell "never existed" apart from "not yours".
 */
export async function getDeployment(
    supabase: SupabaseClient,
    deploymentId: string,
): Promise<DeploymentView | null> {
    // Checked before the query rather than after it. `id` is a uuid column, so a malformed
    // one is a type error to Postgres, not an empty result — and an id comes straight off
    // the URL, where anybody can put anything. A value that cannot be a uuid cannot name a
    // row, so this is "no such deployment", not a database fault.
    if (!UUID.test(deploymentId)) return null;

    const { data, error } = await supabase
        .from("deployments")
        .select("id, project_id, status, repo_url, live_url, commit_sha, error, failure_reason")
        .eq("id", deploymentId)
        .maybeSingle();

    if (error) {
        throw new ApiError("internal", "Could not read the deployment.", error.message);
    }
    if (!data) return null;

    const row = data as unknown as {
        id: string;
        project_id: string;
        status: DeploymentState;
        repo_url: string | null;
        live_url: string | null;
        commit_sha: string | null;
        error: string | null;
        failure_reason: string | null;
    };

    return {
        id: row.id,
        projectId: row.project_id,
        state: row.status,
        repoUrl: row.repo_url,
        liveUrl: row.live_url,
        commitSha: row.commit_sha,
        error: row.error,
        failureReason: row.failure_reason ? toFailureReason(row.failure_reason) : null,
    };
}

export interface DeploymentPatch {
    liveUrl?: string | null;
    commitSha?: string | null;
    /** The redacted provider detail, for debugging. Never shown to the owner (R3 D18). */
    error?: string | null;
    /** Why it stopped, from the closed set in lib/deploy/failure.ts. */
    failureReason?: FailureReason | null;
}

/**
 * Move an attempt to its next state.
 *
 * `live` is refused without a URL before the write is attempted. The database has the same
 * CHECK, so this changes nothing about what can be stored — it changes what the caller is
 * told. A constraint violation arrives as an opaque Postgres string; this says which rule
 * was broken and about which deployment, at the point the mistake was made.
 */
export async function advanceDeployment(
    supabase: SupabaseClient,
    deploymentId: string,
    state: DeploymentState,
    patch: DeploymentPatch = {},
): Promise<void> {
    if (state === "live" && !patch.liveUrl) {
        throw new ApiError(
            "internal",
            "A deployment cannot be marked live without a verified URL.",
            `deployment=${deploymentId}`,
        );
    }

    const { error } = await supabase
        .from("deployments")
        .update({
            status: state,
            // Written explicitly rather than left to a trigger: there is no trigger on this
            // table, and supabase-js drops undefined at serialisation — so an update that
            // set nothing else would reach PostgREST as an empty statement and fail (the
            // lesson from the R3 D5 sweep).
            updated_at: new Date().toISOString(),
            ...(patch.liveUrl !== undefined ? { live_url: patch.liveUrl } : {}),
            ...(patch.commitSha !== undefined ? { commit_sha: patch.commitSha } : {}),
            ...(patch.error !== undefined ? { error: patch.error } : {}),
            ...(patch.failureReason !== undefined ? { failure_reason: patch.failureReason } : {}),
        })
        .eq("id", deploymentId);

    if (error) {
        throw (
            clientFault(error, "That deployment state was not allowed.") ??
            new ApiError("internal", "Could not update the deployment.", error.message)
        );
    }
}

/**
 * A recorder for one publish attempt.
 *
 * publish() already takes an `onState` callback and reports every step through it; this
 * turns that into rows without the publish flow knowing a database exists. The route wires
 * the two together and needs no knowledge of the states themselves.
 *
 * `onState` deliberately swallows its own failures. Losing the dashboard's progress line is
 * a cosmetic fault; letting it throw would abort a publish that is otherwise going fine —
 * and a site half-deployed because its status row could not be written is a much worse
 * outcome than a stale status row.
 */
export async function recordDeployment(
    supabase: SupabaseClient,
    projectId: string,
): Promise<{
    deploymentId: string;
    onState: (state: DeploymentState) => void;
    finish: (result: {
        state: DeploymentState;
        liveUrl?: string | null;
        commitSha?: string | null;
        /** Redacted provider detail, for support. Never shown to the owner (R3 D18). */
        error?: string | null;
        /** Why it stopped, from the closed set in lib/deploy/failure.ts. */
        failureReason?: FailureReason | null;
    }) => Promise<void>;
}> {
    const started = await startDeployment(supabase, projectId);

    return {
        // Returned immediately so a concurrent Go Live can rejoin this attempt, and so
        // the rare pending fallback poll still has an id to ask about.
        deploymentId: started.id,
        onState: (state) => {
            // Intermediate states only. The final one carries a URL or an error with it and
            // is written by finish(), which the caller awaits.
            if (state === "live" || state === "failed") return;
            void advanceDeployment(supabase, started.id, state).catch(() => undefined);
        },
        finish: (result) =>
            advanceDeployment(supabase, started.id, result.state, {
                liveUrl: result.liveUrl ?? null,
                commitSha: result.commitSha ?? null,
                error: result.error ?? null,
                failureReason: result.failureReason ?? null,
            }),
    };
}

/**
 * Every publish this project has attempted, newest first (R3 D13).
 *
 * Attempts, not successes. A history that hid the failures would be the same dashboard that
 * showed "draft" forever — pleasant and useless. Somebody debugging a site that will not go
 * live needs the failed rows most of all, with the error the provider actually gave.
 *
 * Ordered by created_at with id as the tiebreak, because two attempts inside the same
 * millisecond are not impossible and an unstable order makes "newest" a coin toss.
 */
export async function listDeployments(
    supabase: SupabaseClient,
    projectId: string,
): Promise<Deployment[]> {
    const { data, error } = await supabase
        .from("deployments")
        .select("id, project_id, status, live_url, commit_sha, error, failure_reason, created_at, updated_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

    if (error) throw new ApiError("internal", "Could not read the publish history.", error.message);

    return (data ?? []).map((row) => ({
        id: row.id as string,
        projectId: row.project_id as string,
        state: row.status as DeploymentState,
        // C-05: a URL is only surfaced for a deployment that actually reached live.
        liveUrl: row.status === "live" ? ((row.live_url as string | null) ?? null) : null,
        commitSha: (row.commit_sha as string | null) ?? null,
        // What the owner reads, derived rather than stored: `error` holds the redacted
        // provider detail and is not a sentence anybody should be shown (R3 D18).
        error: row.failure_reason || row.status === "failed"
            ? failureLine(row.failure_reason as string | null)
            : null,
        failureReason: row.failure_reason
            ? toFailureReason(row.failure_reason as string)
            : null,
        createdAt: row.created_at as string,
        updatedAt: (row.updated_at as string | null) ?? (row.created_at as string),
    }));
}
