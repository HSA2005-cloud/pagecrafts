import { describe, expect, it } from "vitest";

import { assertCanPublish, assertCanUsePaidDesign, checkEntitlement, hasPro } from "@/lib/data/entitlements";
import { createFakeDb } from "../support/fake-db";

// R3 D9 — the check publish makes before a site goes live (A-5, Doc 22 §6).
//
// The table has existed since D5 and nothing read it until D8. What matters here is not the
// query but the two properties around it: the answer comes from the database rather than
// the request, and asking is free, so a retried publish finds the grant the first attempt
// was made under instead of reaching for a payment already taken.

const HOUR = 3600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function account() {
    const db = createFakeDb({ users: [{ id: "u1" }] });
    const project = db.insert("projects", { user_id: "u1", name: "Kettle & Co.", content_json: {} });
    return { db, projectId: project.id as string };
}

describe("a grant for one project", () => {
    it("lets that project publish", async () => {
        const { db, projectId } = account();
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

    it("grants each project its own free publish", async () => {
        const { db, projectId } = account();
        const other = db.insert("projects", { user_id: "u1", name: "Other", content_json: {} });
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "active",
        });

        await expect(
            assertCanPublish(db.asUser("u1"), "u1", other.id as string),
        ).resolves.toMatchObject({ granted: true, source: "launch_offer" });
    });

    it("grants a free publish when nothing has been paid yet", async () => {
        const { db, projectId } = account();

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
            source: "launch_offer",
        });
    });
});

describe("a lapsed grant is not a grant", () => {
    it("issues a fresh free grant when the old one lapsed", async () => {
        const { db, projectId } = account();
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "active",
            expires_at: iso(-HOUR),
        });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
            source: "launch_offer",
        });
    });

    it("accepts one that has not expired yet", async () => {
        const { db, projectId } = account();
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

    it("issues a fresh free grant when the old one was revoked", async () => {
        const { db, projectId } = account();
        db.insert("entitlements", {
            user_id: "u1",
            project_id: projectId,
            kind: "publish",
            source: "paid",
            status: "revoked",
        });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
            source: "launch_offer",
        });
    });
});

describe("pro", () => {
    it("covers publishing without a per-project grant", async () => {
        const { db, projectId } = account();
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
            source: "pro",
        });
    });

    it("is still distinguishable from a one-off purchase", async () => {
        // The caller can tell a subscription from a payment, which matters for anything that
        // reports on revenue or decides what to say when it ends.
        const { db, projectId } = account();
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });

        const check = await checkEntitlement(db.asUser("u1"), "u1", projectId, "publish");
        expect(check.source).toBe("pro");
    });

    it("lapses like anything else", async () => {
        const { db } = account();
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

describe("premium", () => {
    it("covers publishing without a per-project grant, and is not the same as a pro row", async () => {
        const { db, projectId } = account();
        db.insert("entitlements", { user_id: "u1", kind: "premium", source: "paid", status: "active" });

        await expect(assertCanPublish(db.asUser("u1"), "u1", projectId)).resolves.toMatchObject({
            granted: true,
            source: "pro",
        });
        expect(await hasPro(db.asUser("u1"), "u1")).toBe(true);
        expect(db.rows("entitlements").some((row) => row.kind === "pro")).toBe(false);
    });
});

describe("asking twice", () => {
    it("grants twice and changes nothing", async () => {
        // What makes a retried publish safe: the check is a read. If it charged, or consumed
        // the grant, the second attempt after a network blip would cost the person again.
        const { db, projectId } = account();
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

describe("opening a paid design", () => {
    it("lets a Pro account through a Pro template", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "paid", status: "active" });

        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-1", "premium")).resolves.toBeUndefined();
    });

    it("lets a Premium account through a Premium design", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        db.insert("entitlements", { user_id: "u1", kind: "premium", source: "paid", status: "active" });

        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-1", "signature")).resolves.toBeUndefined();
        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-1", "premium")).resolves.toBeUndefined();
    });

    it("does not let Pro cover a Premium design", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "paid", status: "active" });

        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-1", "premium")).resolves.toBeUndefined();
        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-1", "signature")).rejects.toMatchObject({
            code: "payment_required",
        });
    });

    it("unlocks only the template that was paid for", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        db.insert("entitlements", {
            user_id: "u1",
            kind: "template",
            template_id: "tmpl-gym",
            source: "paid",
            status: "active",
        });

        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-gym", "premium")).resolves.toBeUndefined();
        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-shop", "premium")).rejects.toMatchObject({
            code: "payment_required",
        });
    });

    it("refuses everyone else, and does not invent a grant", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });

        await expect(assertCanUsePaidDesign(db.asUser("u1"), "u1", "tmpl-1", "premium")).rejects.toMatchObject({
            code: "payment_required",
            message: expect.stringMatching(/Razorpay/i),
        });
        expect(db.rows("entitlements")).toHaveLength(0);
    });
});
