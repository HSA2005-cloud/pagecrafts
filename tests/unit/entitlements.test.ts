import { describe, expect, it } from "vitest";

import { assertCanPublish, checkEntitlement, hasPro, resolvePlan } from "@/lib/data/entitlements";
import { createFakeDb } from "../support/fake-db";

// R3 D9 / E-1 — the check publish makes before a site goes live (A-5, Doc 22 §6).
//
// The rule follows the design's tier: a free design goes live for free on any plan, while a
// paid design needs a plan that covers it or a per-project publish grant. Two properties still
// matter most — the answer comes from the database rather than the request, and asking is free,
// so a retried publish finds the grant the first attempt was made under.

const HOUR = 3600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

// A paid (premium-tier) design, so the publish gate is actually exercised: a Starter account
// does not cover it, which is what makes a per-project grant meaningful.
function paidAccount() {
    const db = createFakeDb({ users: [{ id: "u1" }] });
    db.insert("templates", { id: "tmpl_premium", tier: "premium" });
    const project = db.insert("projects", {
        user_id: "u1",
        name: "Kettle & Co.",
        content_json: {},
        source_template_id: "tmpl_premium",
    });
    return { db, projectId: project.id as string };
}

describe("a free design", () => {
    it("goes live for free on a Starter account, with no entitlement", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        const project = db.insert("projects", { user_id: "u1", name: "Free site", content_json: {} });

        await expect(
            assertCanPublish(db.asUser("u1"), "u1", project.id as string),
        ).resolves.toMatchObject({ granted: true, source: "launch_offer" });
    });
});

describe("a paid design", () => {
    it("is refused for a Starter account with nothing paid, and says why", async () => {
        const { db, projectId } = paidAccount();

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).rejects.toMatchObject({
            code: "payment_required",
        });
    });

    it("goes live with a per-project publish grant", async () => {
        const { db, projectId } = paidAccount();
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "active",
        });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
            source: "paid",
        });
    });

    it("does not let a grant for one project publish a different one", async () => {
        // Paying for one site is paying for one site.
        const { db, projectId } = paidAccount();
        const other = db.insert("projects", {
            user_id: "u1",
            name: "Other",
            content_json: {},
            source_template_id: "tmpl_premium",
        });
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "active",
        });

        await expect(
            assertCanPublish(db.asUser("u1"), "u1", other.id as string),
        ).rejects.toMatchObject({ code: "payment_required" });
    });
});

describe("a lapsed grant is not a grant", () => {
    it("ignores a publish row whose expiry has passed even though it still reads active", async () => {
        const { db, projectId } = paidAccount();
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "active",
            expires_at: iso(-HOUR),
        });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).rejects.toMatchObject({
            code: "payment_required",
        });
    });

    it("accepts one that has not expired yet", async () => {
        const { db, projectId } = paidAccount();
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "active",
            expires_at: iso(HOUR),
        });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
        });
    });

    it("ignores a revoked row", async () => {
        const { db, projectId } = paidAccount();
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "revoked",
        });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).rejects.toMatchObject({
            code: "payment_required",
        });
    });
});

describe("pro", () => {
    it("covers publishing a paid design without a per-project grant", async () => {
        const { db, projectId } = paidAccount();
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
            source: "pro",
        });
    });

    it("is still distinguishable from a one-off purchase", async () => {
        const { db, projectId } = paidAccount();
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });

        const check = await checkEntitlement(db.asUser("u1"), "u1", projectId, "publish");
        expect(check.source).toBe("pro");
    });

    it("lapses like anything else", async () => {
        const { db } = paidAccount();
        db.insert("entitlements", {
            user_id: "u1",
            kind: "pro",
            source: "pro",
            status: "active",
            expires_at: iso(-HOUR),
        });

        expect(await hasPro(db.asUser("u1"), "u1")).toBe(false);
    });
});

describe("resolvePlan", () => {
    it("is starter when there is no subscription", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        expect(await resolvePlan(db.asUser("u1"), "u1")).toBe("starter");
    });

    it("is pro with an active pro row", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });
        expect(await resolvePlan(db.asUser("u1"), "u1")).toBe("pro");
    });

    it("is premium with an active premium row, outranking pro", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });
        db.insert("entitlements", { user_id: "u1", kind: "premium", source: "premium", status: "active" });
        expect(await resolvePlan(db.asUser("u1"), "u1")).toBe("premium");
    });

    it("ignores a lapsed premium row and falls back to pro", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });
        db.insert("entitlements", {
            user_id: "u1",
            kind: "premium",
            source: "premium",
            status: "active",
            expires_at: iso(-HOUR),
        });
        expect(await resolvePlan(db.asUser("u1"), "u1")).toBe("pro");
    });
});

describe("asking twice", () => {
    it("grants twice and changes nothing", async () => {
        const { db, projectId } = paidAccount();
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "active",
        });

        await assertCanPublish(db.asUser("u1"), "u1", projectId);
        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
        });
        expect(db.rows("entitlements")).toHaveLength(1);
    });
});
