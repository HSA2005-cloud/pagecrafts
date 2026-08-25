import { describe, expect, it } from "vitest";

import { createProject, patchProject } from "@/lib/data/projects";
import { patchProjectContent } from "@/lib/data/project-content";
import { assertCanPublish } from "@/lib/data/entitlements";
import { projectPublishInputs } from "@/lib/deploy/publishable";
import { createFakeDb, type FakeDb } from "../support/fake-db";

// R2 D15 · Meera's path, end to end.
//
//   "email sign-in -> pick template -> edit content -> Unsplash photo -> working form ->
//    pay Rs 249 -> live URL ... from a cold landing page to a verified live address,
//    without one technical word."
//
// Sign-in and the live address are the two ends this cannot reach: one needs a browser with
// a real account, the other needs a host. Everything between them is the code under test,
// and it is walked here in one sequence rather than as six unrelated unit tests — because
// the failures this milestone exists to catch are the ones that only appear when the steps
// run in order. The publish-content bug found at R3 D15 was exactly that shape: every step
// passed alone, and the site still went live with the wrong words.
//
// The browser half of D15 — the same journey at 375px — is a manual pass; what it found is
// in the commit, not here, because layout is not something a node test can see.

const TEMPLATE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Cafe</title></head>
  <body>
    <h1 data-slot="hero.headline">Good coffee.</h1>
    <p data-slot="hero.subhead">A cosy place.</p>
    <div class="hero-frame" data-slot="hero.image"><img src="stock.jpg" alt="A room" /></div>
    <form class="form" action="" method="post"><input type="email" name="email" /></form>
    <footer><p data-credits>Photo by <a href="https://unsplash.test/@ada">Ada Lovelace</a></p></footer>
  </body>
</html>`;

const CONTENT_SCHEMA = {
    sections: [
        {
            key: "hero",
            label: "Hero",
            fields: [
                { key: "headline", label: "Headline", type: "text" as const, maxLength: 60 },
                { key: "subhead", label: "Subheading", type: "text" as const, maxLength: 140 },
                { key: "image", label: "Photo", type: "image" as const },
            ],
        },
    ],
};

const MEERA = "00000000-0000-4000-8000-00000000mee1".replace("mee1", "0001");
const TEMPLATE_ID = "00000000-0000-4000-8000-000000000002";

function freshWorld(): FakeDb {
    const db = createFakeDb({
        users: [{ id: MEERA }],
        templates: [
            {
                id: TEMPLATE_ID,
                name: "Cafe",
                description: "A cosy cafe page.",
                files: { "index.html": TEMPLATE_HTML, "styles.css": "body{}" },
                content_schema: CONTENT_SCHEMA,
                tier: "free",
            },
        ],
    });
    return db;
}

const indexOf = (files: { path: string; content: string }[]) =>
    files.find((f) => f.path === "index.html")!.content;

describe("Meera's path", () => {
    it("carries her words, her photograph and her form all the way to the build", async () => {
        const db = freshWorld();
        const meera = db.asUser(MEERA);

        // 1. She picks a design. The fork copies the template's files into a project of her
        //    own, so editing it can never change the template or anyone else's site.
        const { id } = await createProject(meera, MEERA, {
            name: "Kettle & Co.",
            sourceTemplateId: TEMPLATE_ID,
        });

        expect(db.rows("project_files").filter((f) => f.project_id === id).length).toBeGreaterThan(0);

        // 2. She edits the words through the content panel's endpoint.
        await patchProjectContent(meera, id, [
            { path: "hero.headline", value: "Kettle & Co." },
            { path: "hero.subhead", value: "Open from seven, on the corner." },
        ]);

        // 3. She picks a photograph. The asset row and its bytes are what the picker
        //    produces; pointing a slot at it is a content op like any other.
        const asset = db.insert("assets", {
            project_id: id,
            storage_path: `${MEERA}/${id}/hers.jpg`,
            mime_type: "image/jpeg",
        });
        db.putObject(`${MEERA}/${id}/hers.jpg`, "HER-PHOTOGRAPH");
        await patchProjectContent(meera, id, [{ path: "hero.image", value: asset.id }]);

        // 4. She points the contact form somewhere real.
        await patchProject(meera, id, {
            name: "Kettle & Co.",
            siteMeta: { title: "Kettle & Co.", description: "Coffee and bread, on the corner." },
            formEndpoint: "https://forms.example/kettle",
        });

        // 5. The gate. PageCrafts hosting is free — publish is granted on first attempt.
        await expect(assertCanPublish(meera, MEERA, id)).resolves.toMatchObject({
            granted: true,
            source: "launch_offer",
        });

        db.insert("entitlements", {
            user_id: MEERA,
            project_id: id,
            kind: "publish",
            source: "paid",
            status: "active",
        });

        await expect(assertCanPublish(meera, MEERA, id)).resolves.toBeDefined();

        // 6. What would go to the host.
        const { files } = await projectPublishInputs(meera, id);
        const html = indexOf(files);

        expect(html, "her headline").toContain("Kettle &amp; Co.");
        expect(html, "her subheading").toContain("Open from seven, on the corner.");
        expect(html, "the template's placeholder copy survived").not.toContain("A cosy place.");

        expect(html, "her site title").toContain("<title>Kettle &amp; Co.</title>");
        expect(html, "the share card").toContain('property="og:description"');

        expect(html, "her form's destination").toContain('action="https://forms.example/kettle"');

        const photo = files.find((f) => f.path.includes(asset.id as string));
        expect(photo, "her photograph was not bundled").toBeDefined();
        expect(Buffer.from(photo!.content, "base64").toString()).toBe("HER-PHOTOGRAPH");

        expect(html, "the photographer's credit (S-1)").toContain("Ada Lovelace");
    });

    it("keeps every edit if she never publishes — the work is not held hostage", async () => {
        const db = freshWorld();
        const meera = db.asUser(MEERA);

        const { id } = await createProject(meera, MEERA, {
            name: "Kettle & Co.",
            sourceTemplateId: TEMPLATE_ID,
        });
        await patchProjectContent(meera, id, [{ path: "hero.headline", value: "Kettle & Co." }]);

        await expect(assertCanPublish(meera, MEERA, id)).resolves.toMatchObject({
            granted: true,
        });

        // Skipping publish must leave the project exactly as she left it.
        const project = db.rows("projects").find((p) => p.id === id)!;
        expect(project.content_json).toMatchObject({ hero: { headline: "Kettle & Co." } });
    });

    it("a second publish updates her site rather than starting another one", async () => {
        const db = freshWorld();
        const meera = db.asUser(MEERA);

        const { id } = await createProject(meera, MEERA, {
            name: "Kettle & Co.",
            sourceTemplateId: TEMPLATE_ID,
        });
        db.insert("entitlements", {
            user_id: MEERA,
            project_id: id,
            kind: "publish",
            source: "paid",
            status: "active",
        });

        const first = await projectPublishInputs(meera, id);

        await patchProjectContent(meera, id, [{ path: "hero.headline", value: "New this week" }]);
        const second = await projectPublishInputs(meera, id);

        expect(indexOf(second.files)).toContain("New this week");
        expect(second.projectName).toBe(first.projectName);
        expect(second.files.map((f) => f.path).sort()).toEqual(first.files.map((f) => f.path).sort());
    });

    it("is hers alone at every step", async () => {
        const db = freshWorld();
        db.insert("users", { id: "someone-else" });
        const meera = db.asUser(MEERA);

        const { id } = await createProject(meera, MEERA, {
            name: "Kettle & Co.",
            sourceTemplateId: TEMPLATE_ID,
        });

        const stranger = db.asUser("someone-else");

        await expect(patchProjectContent(stranger, id, [{ path: "hero.headline", value: "mine" }]))
            .rejects.toMatchObject({ code: "not_found" });
        await expect(projectPublishInputs(stranger, id)).rejects.toMatchObject({ code: "not_found" });
    });
});
