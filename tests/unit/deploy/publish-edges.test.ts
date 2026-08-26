import { describe, expect, it, vi } from "vitest";

import { publish } from "@/lib/deploy/publish";
import type { DeployProvider } from "@/lib/deploy/provider";

// The four publish edge cases week 4 owes the hosting track (R3 D17).
//
// Adhyay's week is subdomain collision, propagation timeout, failure after payment, and
// credential rotation. Persistence owes each of them something, and this file is the half
// that lives in publish(): what the address is, and what survives a failure.
//
// The existing publish tests all use a provider whose siteId looks like `org/name`, because
// GitHub Pages was the first adapter written. The configured default is Cloudflare, whose
// siteId is the bare subdomain. Both shapes are exercised here — a test suite that only
// knows one shape cannot notice the code assuming it.

interface Recorder {
    provisions: number;
    names: string[];
}

function provider(
    { shape, live = true, failAt }: {
        shape: "cloudflare" | "github";
        live?: boolean;
        failAt?: "pushing" | "enabling_hosting";
    },
    record: Recorder = { provisions: 0, names: [] },
): DeployProvider & { record: Recorder } {
    return {
        record,
        async provisionSite({ projectName }) {
            record.provisions += 1;
            const subdomain = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            record.names.push(subdomain);
            return {
                siteId: shape === "github" ? `pagecraft-sites/${subdomain}` : subdomain,
                subdomain,
                predictedUrl: `https://${subdomain}.pagecrafts.in`,
            };
        },
        addressFor(siteId: string) {
            // Each adapter's real rule, reproduced: GitHub's id is `org/repo`, Cloudflare's
            // is the subdomain itself.
            const subdomain = shape === "github" ? (siteId.split("/").pop() ?? siteId) : siteId;
            return { subdomain, url: `https://${subdomain}.pagecrafts.in` };
        },
        async pushBuild() {
            if (failAt === "pushing") throw new Error("upstream 502");
            return { commitSha: "commit-1" };
        },
        async enableHosting() {
            if (failAt === "enabling_hosting") throw new Error("hosting refused");
        },
        async verifyLive() {
            return live;
        },
        async removeSite() {},
    } as DeployProvider & { record: Recorder };
}

const input = {
    projectId: "p1",
    projectName: "Spike",
    files: [{ path: "index.html", content: "<h1>hi</h1>", encoding: "utf-8" as const }],
};

let key = 0;
const nextKey = () => `edges-${(key += 1)}`;

describe("the address a site is published to", () => {
    it("uses the address the provider gave, whatever shape its site id is", async () => {
        // publish() used to recompute the subdomain as `siteId.split('/')[1]`, which is the
        // GitHub adapter's shape. On Cloudflare — the configured default — the site id is the
        // bare subdomain, so that index was undefined and every publish verified, reported
        // and stored `https://undefined.pagecrafts.in`. The provider already returns its own
        // subdomain and predicted URL; there was never a reason to guess.
        for (const shape of ["cloudflare", "github"] as const) {
            const result = await publish({ ...input, idempotencyKey: nextKey() }, () => {}, provider({ shape }));

            expect(result.subdomain, shape).toBe("spike");
            expect(result.liveUrl, shape).toBe("https://spike.pagecrafts.in");
        }
    });

    it("does not re-probe origins after push (speed)", async () => {
        for (const shape of ["cloudflare", "github"] as const) {
            const p = provider({ shape });
            const verify = vi.spyOn(p, "verifyLive");

            const result = await publish({ ...input, idempotencyKey: nextKey() }, () => {}, p);

            expect(result.state).toBe("live");
            expect(result.liveUrl).toBe("https://spike.pagecrafts.in");
            expect(verify, shape).not.toHaveBeenCalled();
        }
    });
});

describe("a publish that fails after the site was provisioned", () => {
    it("still reports the site id, so the address is not lost", async () => {
        // The collision case. Provisioning claims a subdomain; if the attempt then dies at
        // pushing, the claim is real but unrecorded — and the retry asks the provider for the
        // same name, is told it is taken (by us), and settles for `spike-2`. The person's
        // address moves because of a transient 502, and the first site is orphaned.
        //
        // So a failure after provisioning has to carry the site id out with it.
        const p = provider({ shape: "cloudflare", failAt: "pushing" });

        await expect(
            publish({ ...input, idempotencyKey: nextKey() }, () => {}, p),
        ).rejects.toMatchObject({ siteId: "spike" });

        expect(p.record.provisions).toBe(1);
    });

    it("does not provision a second site when the caller retries with the id", async () => {
        const p = provider({ shape: "cloudflare", failAt: "pushing" });

        const failure = await publish({ ...input, idempotencyKey: nextKey() }, () => {}, p).catch(
            (e: { siteId?: string }) => e,
        );

        const retry = provider({ shape: "cloudflare" }, p.record);
        const result = await publish(
            { ...input, siteId: failure.siteId, idempotencyKey: nextKey() },
            () => {},
            retry,
        );

        expect(p.record.provisions).toBe(1);
        expect(result.subdomain).toBe("spike");
        expect(result.liveUrl).toBe("https://spike.pagecrafts.in");
    });
});

describe("a publish after push and hosting succeed", () => {
    it("marks live immediately without waiting on DNS probes", async () => {
        // Origin probing after a confirmed Direct Upload was burning 5–8s. DNS can still
        // warm via the dashboard poll; the owner gets the address as soon as files are up.
        const result = await publish(
            { ...input, idempotencyKey: nextKey() },
            () => {},
            provider({ shape: "cloudflare", live: false }),
        );

        expect(result.state).toBe("live");
        expect(result.liveUrl).toBe("https://spike.pagecrafts.in");
        expect(result.pendingUrl).toBeNull();
        expect(result.reason).toBeNull();
    });

    it("carries the site id on the live result", async () => {
        const result = await publish(
            { ...input, idempotencyKey: nextKey() },
            () => {},
            provider({ shape: "cloudflare", live: false }),
        );

        expect(result.siteId).toBe("spike");
        expect(result.liveUrl).toBe("https://spike.pagecrafts.in");
    });

    it("does not provision again on republish", async () => {
        const first = provider({ shape: "cloudflare", live: false });
        const timedOut = await publish({ ...input, idempotencyKey: nextKey() }, () => {}, first);

        const later = provider({ shape: "cloudflare", live: true }, first.record);
        const states: string[] = [];
        const result = await publish(
            { ...input, siteId: timedOut.siteId, idempotencyKey: nextKey() },
            (s) => states.push(s),
            later,
        );

        expect(first.record.provisions).toBe(1);
        expect(result.state).toBe("live");
        expect(states).not.toContain("provisioning");
    });
});
