import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, buildStack } from "../../scripts/db/stack";
import { CATEGORY_IDS } from "@/lib/contracts";
import { TEMPLATES } from "@/lib/templates";
import { templateRow } from "@/lib/templates/row";

// The seed, against the schema twenty-one migrations later (R3 D19).
//
// The seed is what a fresh database is built from, what every new developer sees on their
// first `supabase db reset`, and what the browser walk-through in CI signs in as. It has
// been carried along since the first migration and edited by hand ever since.
//
// `db reset` proves it *inserts*. That is a lower bar than it sounds: a column added by a
// later migration is nullable by default, so the seed keeps loading while quietly producing
// rows the product cannot use. These check the rows are usable — visible to the person they
// belong to, consistent with the enums and constraints as they now stand, and enough to
// walk the funnel on.

let db: PGlite;

beforeAll(async () => {
    const stack = await buildStack({ seed: true });
    const failed = stack.steps.filter((s) => !s.ok);
    if (failed.length > 0) throw new Error(`${failed[0]!.name} failed:\n${failed[0]!.error}`);
    db = stack.db;
}, 120_000);

afterAll(async () => {
    await db?.close();
});

async function rows<T>(sql: string): Promise<T[]> {
    return (await db.query<T>(sql)).rows;
}

/** A Postgres error's first line — the constraint name, without the DETAIL/HINT tail. */
function firstLine(error: unknown): string {
    return String(error instanceof Error ? error.message : error).split("\n")[0]!;
}

describe("the people the seed creates", () => {
    it("gives every auth user a profile row", async () => {
        // The profile is made by a trigger on auth.users. If the seed inserts a user the
        // trigger cannot serve — a null email, a duplicate — the row is simply missing and
        // every owner-scoped query for that person comes back empty.
        const orphans = await rows<{ email: string }>(`
            select u.email from auth.users u
             where not exists (select 1 from public.users p where p.id = u.id)
        `);
        expect(orphans.map((o) => o.email)).toEqual([]);
    });

    it("creates more than one, so cross-user tests have somebody to be", async () => {
        const [count] = await rows<{ n: number }>(
            "select count(*)::int as n from public.users",
        );
        expect(count!.n).toBeGreaterThanOrEqual(2);
    });

    it("stores every email lowercased, as the column demands", async () => {
        const wrong = await rows<{ email: string }>(
            "select email from public.users where email <> lower(email)",
        );
        expect(wrong).toEqual([]);
    });
});

describe("the projects the seed creates", () => {
    it("gives each of them an owner who exists", async () => {
        const orphans = await rows<{ id: string }>(`
            select p.id from public.projects p
             where not exists (select 1 from public.users u where u.id = p.user_id)
        `);
        expect(orphans).toEqual([]);
    });

    it("shows each owner their own project and nobody else's", async () => {
        // The seeded pair is what e2e/cross-user.spec.ts is built on. If they ever ended up
        // owned by the same person, that whole spec would pass while proving nothing.
        const owners = await rows<{ user_id: string; n: number }>(
            "select user_id, count(*)::int as n from public.projects group by user_id",
        );
        expect(owners.length).toBeGreaterThanOrEqual(2);

        for (const owner of owners) {
            const visible = await asUser(db, owner.user_id, () =>
                db.query<{ n: number }>("select count(*)::int as n from public.projects"),
            );
            expect(visible.rows[0]!.n, `${owner.user_id} sees more than their own`).toBe(owner.n);
        }
    });

    it("gives at least one project files to publish", async () => {
        // A project with no files answers validation_failed on publish, so a seed of empty
        // projects makes the publish path unwalkable on a fresh database.
        const [withFiles] = await rows<{ n: number }>(`
            select count(distinct project_id)::int as n from public.project_files
        `);
        expect(withFiles!.n).toBeGreaterThanOrEqual(1);
    });

    it("names an index.html, because that is what a site is", async () => {
        const [index] = await rows<{ n: number }>(
            "select count(*)::int as n from public.project_files where path = 'index.html'",
        );
        expect(index!.n).toBeGreaterThanOrEqual(1);
    });
});

describe("the templates the seed creates", () => {
    it("uses only categories the enum knows and the app cards", async () => {
        // Two directions, and the second is the one that drifted at R2: the database enum
        // and the TypeScript Category union are maintained separately.
        const seeded = await rows<{ category: string }>(
            "select distinct category::text as category from public.templates",
        );
        for (const row of seeded) {
            expect(CATEGORY_IDS as readonly string[], `seed uses ${row.category}`).toContain(
                row.category,
            );
        }
    });

    it("gives every one a tier the app can price", async () => {
        // There is no price column, deliberately: the database stores the tier so the fork
        // gate can enforce it server-side, and the price is a business rule the app owns
        // (see 20260811090000_template_tier.sql). So the check is that every seeded tier is
        // one the app has a price for — a tier it does not know would make the gallery and
        // the checkout disagree on a fresh database.
        const PRICES: Record<string, number> = { free: 0, premium: 499, signature: 999 };
        const tiers = await rows<{ tier: string }>(
            "select distinct tier::text as tier from public.templates",
        );

        expect(tiers.length).toBeGreaterThan(0);
        for (const { tier } of tiers) {
            expect(Object.keys(PRICES), `seed uses tier ${tier}`).toContain(tier);
        }
    });

    it("gives every one a source a person could open", async () => {
        const bad = await rows<{ name: string; source_url: string }>(`
            select name, source_url from public.templates
             where source_url !~ '^https://'
                or source_url like '%github.com/pagecraft/templates%'
        `);
        expect(bad).toEqual([]);
    });

    it("gives every one a content schema with something in it", async () => {
        // content_schema is what the editor's panel is generated from (C-07). A template
        // with an empty one forks into a project nobody can edit.
        const empty = await rows<{ name: string }>(`
            select name from public.templates
             where content_schema is null
                or jsonb_array_length(coalesce(content_schema->'sections', '[]'::jsonb)) = 0
        `);
        expect(empty).toEqual([]);
    });

    it("gives every one the files it claims to be made of", async () => {
        const missing = await rows<{ name: string }>(`
            select name from public.templates
             where not (files ? 'index.html')
        `);
        expect(missing).toEqual([]);
    });

    it("is readable by any signed-in person", async () => {
        const [someone] = await rows<{ id: string }>("select id from public.users limit 1");
        const seen = await asUser(db, someone!.id, () =>
            db.query<{ n: number }>("select count(*)::int as n from public.templates"),
        );
        const [all] = await rows<{ n: number }>("select count(*)::int as n from public.templates");

        expect(seen.rows[0]!.n).toBe(all!.n);
    });
});

describe("what twenty-one migrations left behind", () => {
    it("leaves no column added later sitting null across every seeded row", async () => {
        // The failure this whole file exists for. A migration adds a column, the seed is
        // never updated, and every row has it null — which inserts fine and breaks whatever
        // reads it. Reported as a list rather than asserted empty, because some columns are
        // legitimately null in a seed (nobody has published, nobody has paid); what matters
        // is that the list is looked at rather than discovered later.
        const columns = await rows<{ table_name: string; column_name: string }>(`
            select table_name, column_name
              from information_schema.columns
             where table_schema = 'public'
             order by table_name, ordinal_position
        `);

        const allNull: string[] = [];
        for (const { table_name, column_name } of columns) {
            const [row] = await rows<{ total: number; filled: number }>(`
                select count(*)::int as total,
                       count("${column_name}")::int as filled
                  from public."${table_name}"
            `);
            if (row!.total > 0 && row!.filled === 0) allNull.push(`${table_name}.${column_name}`);
        }

        // The set as it stands. Each is a column nothing in the seed exercises; adding one
        // here is a decision, and being forced to make it is the point.
        expect(allNull.sort()).toEqual([
            // The seeded commits pre-date snapshots, which is a case the product already
            // handles: getCommitSnapshot answers validation_failed rather than restoring
            // nothing. Worth knowing that the restore path cannot be walked on a fresh
            // database without making a commit first.
            "commits.snapshot",
            // Forms are configured by the owner after forking.
            "projects.form_endpoint",
            // No seeded project has been published, so nothing has claimed a site.
            "projects.repo_full_name",
            // Nobody has signed in with GitHub, and nobody has set a display name.
            "users.avatar_url",
            "users.billing_city",
            "users.billing_line",
            "users.encrypted_token",
            "users.github_id",
            "users.gstin",
            "users.handle",
            "users.phone",
        ].sort());
    });

    it("has a row in every table the funnel reads before anything is created", async () => {
        // templates is the only one: the gallery is the first screen, and an empty library
        // is a dead end on a fresh database.
        const [templates] = await rows<{ n: number }>(
            "select count(*)::int as n from public.templates",
        );
        expect(templates!.n).toBeGreaterThan(0);
    });
});

describe("the whole library, written the way the app writes it", () => {
    it("upserts all 115 designs without a constraint refusing one", async () => {
        // The unit test on templateRow checks the shape it produces. This checks Postgres
        // agrees, which is a different question and the one that actually broke: R2 D18
        // rendered the thumbnails and made thumbnailUrlFor() return `/templates/<id>.webp`,
        // and templates.thumbnail_url has a CHECK of `null or ~ '^https://'`. Every one of
        // the 115 rows would have been refused on a real database. Only a test that lets
        // Postgres judge the values can notice that.
        const inserted: string[] = [];
        const refused: string[] = [];

        for (const template of TEMPLATES) {
            const row = templateRow(template);
            try {
                await db.query(
                    `insert into public.templates
                       (id, name, description, category, tags, thumbnail_url, files,
                        content_schema, license, source_url, tier)
                     values ($1,$2,$3,$4::public.template_category,$5,$6,$7,$8,$9,$10,
                             $11::public.template_tier)
                     on conflict (id) do update set thumbnail_url = excluded.thumbnail_url`,
                    [
                        row.id, row.name, row.description, row.category, row.tags,
                        row.thumbnail_url, JSON.stringify(row.files),
                        JSON.stringify(row.content_schema), row.license, row.source_url,
                        row.tier,
                    ],
                );
                inserted.push(template.id);
            } catch (error) {
                refused.push(`${template.id}: ${firstLine(error)}`);
            }
        }

        expect(refused.slice(0, 5)).toEqual([]);
        expect(inserted).toHaveLength(TEMPLATES.length);
    }, 60_000);

    it("still refuses a relative thumbnail, so the seam is doing something", async () => {
        // The negative control. If this ever passes, the column has stopped guarding and
        // absoluteOnly() in lib/templates/row.ts is no longer protecting anything.
        await expect(
            db.query("update public.templates set thumbnail_url = $1 where true", [
                "/templates/gym.webp",
            ]),
        ).rejects.toThrow(/templates_thumbnail_url_check/);
    });
});
