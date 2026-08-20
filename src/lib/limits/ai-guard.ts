import "server-only";
import { consumeAll } from "@/lib/limits/rate-limit";
import { acquireSlot, type Slot } from "@/lib/limits/concurrency";
import { clientIp, UNKNOWN_IP } from "@/lib/limits/client-ip";
import { AI_PER_USER_HOUR, AI_PER_IP_HOUR } from "@/lib/limits/config";
import { fail } from "@/lib/errors/respond";
import { codeFor, messageFor, reportUpstream } from "@/lib/errors/upstream";
import { killSwitch } from "@/lib/limits/kill-switch";
import { checkSpend, recordSpend, costInCents, pricing } from "@/lib/limits/spend";
import type { Usage } from "@/lib/contracts";

const THROTTLED = "You have made a lot of requests. Try again in a little while.";
const BUSY = "We are handling a lot of requests right now. Try again in a moment.";
const PAUSED = "Site generation is paused right now. Please try again later.";
const USER_CAP = "You have reached today's generation limit. It resets at midnight UTC.";
const GLOBAL_CAP = "Generation has reached today's limit across PageCrafts. It resets at midnight UTC.";

export type UsageReport = Pick<Usage, "inputTokens" | "outputTokens">;

export type AiGuard =
  | { ok: true; release: () => Promise<void>; recordUsage: (usage: UsageReport) => Promise<void> }
  | { ok: false; response: Response };

function withRetryAfter(response: Response, seconds: number): Response {
  response.headers.set("Retry-After", String(Math.max(1, seconds)));
  return response;
}

export async function guardAiRequest(
  userId: string,
  headers: Headers,
): Promise<AiGuard> {
  const paused = await killSwitch();

  if (paused.engaged) {
    console.error("[ai-guard] kill switch engaged, refusing request", {
      userId,
      reason: paused.reason,
    });

    return { ok: false, response: fail("generation_failed", PAUSED) };
  }

  const spend = await checkSpend(userId);

  if (!spend.allowed) {
    const response = fail(
      "spend_capped",
      spend.scope === "global" ? GLOBAL_CAP : USER_CAP,
    );
    response.headers.set("Retry-After", String(spend.resetsInSeconds));

    return { ok: false, response };
  }

  const ip = clientIp(headers);

  const checks = [
    { bucket: "ai:user", identifier: userId, rule: AI_PER_USER_HOUR },
  ];

  if (ip !== UNKNOWN_IP) {
    checks.push({ bucket: "ai:ip", identifier: ip, rule: AI_PER_IP_HOUR });
  }

  const budget = await consumeAll(checks);

  if (!budget.allowed) {
    if (budget.degraded) {
      reportUpstream("cache", new Error("rate limiter unavailable"), { userId });

      return {
        ok: false,
        response: withRetryAfter(
          fail(codeFor("cache"), messageFor("cache")),
          budget.retryAfterSeconds,
        ),
      };
    }

    return {
      ok: false,
      response: withRetryAfter(fail("rate_limited", THROTTLED), budget.retryAfterSeconds),
    };
  }

  const slot: Slot = await acquireSlot("ai:in-flight");

  if (!slot.acquired) {
    if (slot.degraded) {
      reportUpstream("cache", new Error("concurrency guard unavailable"), { userId });

      return {
        ok: false,
        response: withRetryAfter(fail(codeFor("cache"), messageFor("cache")), 5),
      };
    }

    return {
      ok: false,
      response: withRetryAfter(fail("rate_limited", BUSY), 5),
    };
  }

  return {
    ok: true,
    release: slot.release,
    recordUsage: async (usage: UsageReport) => {
      const { inPerMTokCents, outPerMTokCents } = pricing();
      await recordSpend(userId, costInCents(usage, inPerMTokCents, outPerMTokCents));
    },
  };
}
