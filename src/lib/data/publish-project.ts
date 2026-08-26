import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentState, PublishProjectResponse } from "@/lib/contracts";
import { ApiError } from "@/lib/errors/respond";
import { assertCanPublish } from "./entitlements";
import {
  advanceDeployment,
  getDeployment,
  openDeployment,
  recordDeployment,
} from "./deployments";
import { projectPublishInputs } from "@/lib/deploy/publishable";
import { publish } from "@/lib/deploy/publish";
import { PublishError } from "@/lib/deploy/errors";
import { deployProvider } from "@/lib/deploy/adapters";
import { assertDeployReady } from "@/lib/deploy/credentials";
import { failureMessage, reasonForError } from "@/lib/deploy/failure";
import { track } from "@/lib/observability/analytics";
import { captureError } from "@/lib/observability/capture";
import type { DeployProvider } from "@/lib/deploy/provider";

export type PublishProjectResult = PublishProjectResponse & {
  /** @deprecated Host work now finishes in-request; kept for the route await seam. */
  background?: Promise<void>;
};

// Publishing a project (R3 D15 · FR-080–FR-091, C-05).
//
// Fast path: the request awaits Direct Upload + DNS, then answers with the final
// deployment status so the client does not burn another round of polling.
/** Where the site lives on the host, kept so a republish updates rather than duplicating. */
async function siteIdFor(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("repo_full_name")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new ApiError("internal", "Could not read the project.", error.message);
  // RLS: someone else's project is not there, and must not be distinguishable from one that
  // never existed (SEC-14).
  if (!data) throw new ApiError("not_found", "That project does not exist.");

  return (data.repo_full_name as string | null) ?? null;
}

/** FR-087: ten republishes produce one site, not ten. */
async function rememberSite(
  supabase: SupabaseClient,
  projectId: string,
  siteId: string,
): Promise<void> {
  await supabase.from("projects").update({ repo_full_name: siteId }).eq("id", projectId);
}

export async function publishProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  idempotencyKey: string,
  // Injectable for the same reason publish() takes one: the edge cases this function exists
  // to survive — a claim that outlives a failed attempt, a site that is not answering yet —
  // can only be reproduced by a provider that behaves that way on purpose.
  provider?: DeployProvider,
): Promise<PublishProjectResult> {
  const activeProvider = provider ?? deployProvider;

  // Before anything is recorded or provisioned. A publish nobody paid for should cost us
  // nothing and leave no trace, and the caller should hear payment_required rather than
  // watch a deployment fail for reasons it cannot act on.
  await assertCanPublish(supabase, userId, projectId);

  // Hosting misconfiguration is ours, not the owner's. Refuse before a deployment row is
  // opened so Go Live does not look like their site broke. Skipped when a test injects a
  // fake provider, and under Vitest (unit tests mock publish() and omit the provider arg).
  if (provider === undefined && process.env.VITEST == null) {
    try {
      assertDeployReady();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[publish] hosting is not configured", detail);
      throw new ApiError(
        "service_unavailable",
        "Publishing is not available right now. Try again in a little while.",
        detail,
      );
    }
  }

  const siteId = await siteIdFor(supabase, projectId);
  const { projectName, files } = await projectPublishInputs(supabase, projectId);

  if (files.length === 0) {
    // The same words the failure map gives this reason, so a person hears one thing whether
    // they hit it here or read it off the dashboard later.
    const { what, next } = failureMessage("nothing_to_publish");
    throw new ApiError("validation_failed", `${what} ${next}`, projectId);
  }

  // A publish already under way is handed back rather than joined by a second one.
  // runOnce() in the deploy layer only dedupes an identical idempotency key; two different
  // keys for one project would otherwise race each other onto the same subdomain. Moved
  // here from the route at D18, with the rest of what a publish has to decide.
  //
  // Important: this only returns the id — it does not resume host work. A frozen Vercel
  // isolate left rows in pushing/pending with nobody running; rejoining them made Go Live
  // spin for minutes. openDeployment ignores rows older than its TTL so a retry can start.
  const running = await openDeployment(supabase, projectId);
  if (running) return { deploymentId: running.id, status: "pending" };

  const attempt = await recordDeployment(supabase, projectId);

  // EV-06. Fired once the attempt is real — past the entitlement gate, past the empty-files
  // check, with a row to point at — so the funnel counts publishes that were actually tried
  // rather than requests that bounced off a precondition.
  track("EV-06", userId, { republish: siteId !== null });

  // Await the host work in this request. Returning 202 with a detached upload used to
  // freeze mid-push on Vercel; answering only after finish also lets the client skip polling.
  try {
    const result = await publish(
      { projectId, projectName, files, siteId, idempotencyKey },
      attempt.onState,
      activeProvider,
    );

    if (!siteId) await rememberSite(supabase, projectId, result.siteId);

    await attempt.finish({
      state: result.state,
      liveUrl: result.liveUrl,
      commitSha: result.commitSha,
      failureReason: result.reason,
    });

    track("EV-07", userId, {
      state: result.state,
      republish: siteId !== null,
      reason: result.reason,
    });

    const status: PublishProjectResponse["status"] =
      result.state === "live" ? "live" : result.state === "failed" ? "failed" : "pending";

    return {
      deploymentId: attempt.deploymentId,
      status,
      liveUrl: result.liveUrl,
    };
  } catch (error: unknown) {
    if (!siteId && error instanceof PublishError && error.siteId) {
      await rememberSite(supabase, projectId, error.siteId).catch(() => undefined);
    }

    const detail =
      error instanceof PublishError
        ? error.code === "validation_failed"
          ? error.message
          : (error.detail ?? error.message)
        : error instanceof Error
          ? error.message
          : String(error);

    const reason = reasonForError(error);

    captureError(error, {
      tags: { boundary: "publish", reason },
      extra: { projectId, deploymentId: attempt.deploymentId },
    });
    track("EV-08", userId, { reason, republish: siteId !== null });

    console.error("[publish]", projectId, error);

    await attempt
      .finish({ state: "failed", error: detail, failureReason: reason })
      .catch(() => undefined);

    return {
      deploymentId: attempt.deploymentId,
      status: "failed",
      liveUrl: null,
      error:
        error instanceof PublishError && error.code === "validation_failed"
          ? error.message
          : failureMessage(reason).what + " " + failureMessage(reason).next,
    };
  }
}

/**
 * Finish a publish that was only waiting for DNS (R3 D17).
 *
 * A propagation delay is not a failure. The site is provisioned, the files are pushed and
 * hosting is on; the one thing left is the host answering on the new address, and that can
 * take longer than any request should wait. Such an attempt now rests in `verifying`, and
 * this is what picks it back up: re-check the one URL, and promote it if the site is there.
 *
 * Nothing is re-provisioned and nothing is re-pushed, so calling this repeatedly is free and
 * safe — which matters, because the client is already polling and this runs on that poll.
 *
 * The address is derived from the stored site id rather than kept in a column. Two reasons:
 * `live_url` is the column somebody would reach for, and parking an unverified address there
 * means anything that reads it without checking the state hands out a link to a site that is
 * not up yet (C-05) — the poll route did exactly that until D17. And the adapter can always
 * recover the address from the id, so a second copy could only ever disagree with the first.
 *
 * Returns the state the attempt is now in.
 */
export async function resumeVerification(
  supabase: SupabaseClient,
  deploymentId: string,
  provider: DeployProvider = deployProvider,
): Promise<DeploymentState> {
  const deployment = await getDeployment(supabase, deploymentId);
  // RLS has already decided this: another account's attempt reads as no row at all.
  if (!deployment) throw new ApiError("not_found", "No such deployment.");
  if (deployment.state !== "verifying") return deployment.state;

  const siteId = await siteIdFor(supabase, deployment.projectId);
  // Provisioned but never recorded, on an attempt old enough to predate that fix. There is
  // nothing to re-check, and inventing an address would be worse than leaving it alone.
  if (!siteId) return deployment.state;

  const { url } = provider.addressFor(siteId);

  let live = false;
  try {
    live = await provider.verifyLive(url);
  } catch {
    // The host being unreachable is not evidence the site is missing. Leave the attempt
    // where it is and let the next poll ask again — turning a flaky check into a permanent
    // `failed` is exactly the mistake this whole state exists to avoid.
    return deployment.state;
  }

  if (!live) return deployment.state;

  await advanceDeployment(supabase, deploymentId, "live", { liveUrl: url, error: null });
  return "live";
}
