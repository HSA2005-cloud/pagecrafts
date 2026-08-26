import { describe, expect, it } from "vitest";

import { assertCanEdit, checkEditPermission } from "@/lib/data/entitlements";
import { listDeployments } from "@/lib/data/deployments";
import { createFakeDb } from "../support/fake-db";

// Editing a site that is already live needs Rs 249 unlock (no multi-day goodwill window).

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const LIVE_URL = "https://kettle.pagecrafts.in";

function site() {
    const db = createFakeDb({ users: [{ id: "u1" }] });
    const project = db.insert("projects", { user_id: "u1", name: "Kettle & Co.", content_json: {} });
    return { db, id: project.id as string };
}

function published(db: ReturnType<typeof site>["db"], projectId: string, when: string) {
    db.insert("deployments", {
        project_id: projectId,
        status: "live",
        live_url: LIVE_URL,
        created_at: when,
        updated_at: when,
    });
}

describe("a site nobody has published", () => {
    it("is a draft, and drafts are free to change", async () => {
        const { db, id } = site();

        await expect(checkEditPermission(db.asUser("u1"), "u1", id)).resolves.toMatchObject({
            allowed: true,
            reason: "never_published",
        });
    });

    it("is not unlocked by a publish that failed", async () => {
        const { db, id } = site();
        db.insert("deployments", { project_id: id, status: "failed", created_at: ago(30 * DAY) });

        await expect(checkEditPermission(db.asUser("u1"), "u1", id)).resolves.toMatchObject({
            reason: "never_published",
        });
    });
});

describe("after the first live publish", () => {
    it("locks editing immediately", async () => {
        const { db, id } = site();
        published(db, id, ago(60_000));

        await expect(checkEditPermission(db.asUser("u1"), "u1", id)).resolves.toMatchObject({
            allowed: false,
            reason: "locked",
        });
    });

    it("stays locked after a republish", async () => {
        const { db, id } = site();
        published(db, id, ago(60 * DAY));
        published(db, id, ago(1 * DAY));

        await expect(checkEditPermission(db.asUser("u1"), "u1", id)).resolves.toMatchObject({
            allowed: false,
            reason: "locked",
        });
    });

    it("an edit_unlock reopens editing", async () => {
        const { db, id } = site();
        published(db, id, ago(DAY));
        db.insert("entitlements", {
            user_id: "u1",
            project_id: id,
            kind: "edit_unlock",
            source: "paid",
            status: "active",
        });

        await expect(checkEditPermission(db.asUser("u1"), "u1", id)).resolves.toMatchObject({
            allowed: true,
            reason: "unlocked",
        });
    });

    it("pro covers it too", async () => {
        const { db, id } = site();
        published(db, id, ago(DAY));
        db.insert("entitlements", { user_id: "u1", kind: "pro", source: "pro", status: "active" });

        await expect(checkEditPermission(db.asUser("u1"), "u1", id)).resolves.toMatchObject({
            allowed: true,
            reason: "pro",
        });
    });

    it("an unlock bought for another site does not carry over", async () => {
        const { db, id } = site();
        const other = db.insert("projects", { user_id: "u1", name: "Other", content_json: {} });
        published(db, id, ago(DAY));
        db.insert("entitlements", {
            user_id: "u1",
            project_id: other.id,
            kind: "edit_unlock",
            source: "paid",
            status: "active",
        });

        await expect(checkEditPermission(db.asUser("u1"), "u1", id)).resolves.toMatchObject({
            allowed: false,
        });
    });

    it("refuses the write with the Rs 249 message", async () => {
        const { db, id } = site();
        published(db, id, ago(DAY));

        await expect(assertCanEdit(db.asUser("u1"), "u1", id)).rejects.toMatchObject({
            code: "payment_required",
            message: expect.stringContaining("Rs 249"),
        });
    });
});

describe("the publish history behind screen 02", () => {
    it("lists attempts newest first", async () => {
        const { db, id } = site();
        db.insert("deployments", { project_id: id, status: "failed", created_at: ago(3 * DAY), error: "boom" });
        published(db, id, ago(1 * DAY));

        const history = await listDeployments(db.asUser("u1"), id);

        expect(history).toHaveLength(2);
        expect(history[0]!.state).toBe("live");
        expect(history[1]!.state).toBe("failed");
    });

    it("keeps the failures, and explains them in the owner's words", async () => {
        const { db, id } = site();
        db.insert("deployments", {
            project_id: id,
            status: "failed",
            created_at: ago(DAY),
            failure_reason: "hosting_failed",
            error: "hosting API 503",
        });

        const [attempt] = await listDeployments(db.asUser("u1"), id);
        expect(attempt.error).toBe(
            "Your files are uploaded, but we could not switch the site on. " +
                "Nothing needs redoing. Try publishing again — if it happens twice, tell us and we will finish it by hand.",
        );
        expect(attempt.error).not.toContain("503");
    });

    it("still explains a failure recorded before reasons were stored", async () => {
        const { db, id } = site();
        db.insert("deployments", { project_id: id, status: "failed", created_at: ago(DAY), error: "boom" });

        const [attempt] = await listDeployments(db.asUser("u1"), id);
        expect(attempt.error).toMatch(/Publishing did not finish\./);
        expect(attempt.error).toMatch(/Nothing you have made is lost/);
    });

    it("surfaces a URL only for an attempt that reached live (C-05)", async () => {
        const { db, id } = site();
        db.insert("deployments", {
            project_id: id,
            status: "failed",
            live_url: LIVE_URL,
            created_at: ago(DAY),
        });

        const [attempt] = await listDeployments(db.asUser("u1"), id);
        expect(attempt.liveUrl).toBeNull();
    });

    it("is empty for a project nobody has published", async () => {
        const { db, id } = site();
        await expect(listDeployments(db.asUser("u1"), id)).resolves.toEqual([]);
    });

    it("shows somebody else nothing", async () => {
        const { db, id } = site();
        published(db, id, ago(DAY));
        db.insert("users", { id: "u2" });

        await expect(listDeployments(db.asUser("u2"), id)).resolves.toEqual([]);
    });
});
