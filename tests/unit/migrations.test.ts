import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Migration hygiene, checked here because CI checks it too late.
//
// `supabase db reset` refuses two migrations that share a version, and the whole database
// job fails on the first one it meets. That has now happened three times — the history has
// "rename migration to fix duplicate timestamp version", "remove duplicate 20260813120000
// migration file" and "merge duplicate-version migrations into single ..." — and each time
// it was found by a red pipeline rather than by the person who added the file.
//
// The cause is structural rather than careless: two people branch on the same day, both
// name a migration with that day's timestamp, and neither branch conflicts with the other
// because the filenames differ. Nothing collides until they are in the same directory. A
// test is the only thing that sees it before CI does.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const ROLLBACKS = join(process.cwd(), "supabase", "rollback");

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const versionOf = (file: string) => file.split("_")[0]!;

describe("migration files", () => {
    it("there are some, and this test is looking in the right place", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it("no two share a version — `supabase db reset` refuses the whole set if they do", () => {
        const seen = new Map<string, string[]>();
        for (const file of files) {
            const version = versionOf(file);
            seen.set(version, [...(seen.get(version) ?? []), file]);
        }

        const collisions = [...seen.entries()]
            .filter(([, group]) => group.length > 1)
            .map(([version, group]) => `${version}: ${group.join(" + ")}`);

        expect(collisions, "rename the later one, keeping the earlier version").toEqual([]);
    });

    it("every version is a sortable timestamp, so the order applied is the order intended", () => {
        for (const file of files) {
            expect(versionOf(file), file).toMatch(/^\d{14}$/);
        }
    });

    it("every file has a name after its version, not just a number", () => {
        for (const file of files) {
            expect(file, `${file} needs a descriptive suffix`).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
        }
    });

    // The workflow in docs/database-workflow.md asks for a rollback beside each migration.
    // Not every historical one has kept to it, so this checks that the rollbacks which do
    // exist point at a migration that also exists — a rollback for a renamed or deleted
    // migration is a trap for whoever reaches for it in a hurry.
    it("no rollback is left pointing at a migration that is gone", () => {
        const versions = new Set(files.map(versionOf));
        const orphans = readdirSync(ROLLBACKS)
            .filter((f) => f.endsWith(".sql"))
            .filter((f) => !versions.has(versionOf(f)));

        expect(orphans, "these rollbacks name a version no migration has").toEqual([]);
    });

    it("no migration is empty", () => {
        for (const file of files) {
            const sql = readFileSync(join(MIGRATIONS, file), "utf8").trim();
            expect(sql.length, `${file} is empty`).toBeGreaterThan(0);
        }
    });

    // The inverse of the orphan check above, and the one that actually protects an
    // incident. Closed at D20: vertical_profiles and ai_edit_proposals had no undo, which
    // the previous test could not see -- it only looked for rollbacks pointing at nothing,
    // never for migrations pointing at nothing.
    //
    // The cost of that asymmetry is paid at the worst possible moment: a bad deploy at 2am
    // reversed by whoever is awake, writing DROP statements from memory against production.
    it("every migration has a rollback beside it", () => {
        const rollbacks = new Set(
            readdirSync(ROLLBACKS).filter((f) => f.endsWith(".sql")).map(versionOf),
        );

        const undoable = files.filter((f) => !rollbacks.has(versionOf(f)));

        expect(
            undoable,
            "write supabase/rollback/<same-filename>.sql -- see docs/database-workflow.md",
        ).toEqual([]);
    });

    // 20260813120001 and 20260813130000 are byte-identical: the same migration committed
    // twice on the same day under two versions. The collision test could not catch it --
    // the versions differ -- and nothing ever failed, because applying it a second time is
    // a no-op. The next accidental duplicate may not be idempotent, and then `db reset`
    // fails on a fresh machine and passes on the one it was written on.
    //
    // The pair is allowed rather than deleted: both have been applied to the live database,
    // and removing a file whose version sits in supabase_migrations would put the repository
    // and the database out of step -- on freeze day, for a file that does nothing.
    const KNOWN_IDENTICAL = [
        "20260813120001_template_thumbnail_optional.sql == 20260813130000_template_thumbnail_optional.sql",
    ];

    it("no two migrations have identical contents", () => {
        const byContent = new Map<string, string[]>();

        for (const file of files) {
            const sql = readFileSync(join(MIGRATIONS, file), "utf8").trim();
            byContent.set(sql, [...(byContent.get(sql) ?? []), file]);
        }

        const duplicates = [...byContent.values()]
            .filter((group) => group.length > 1)
            .map((group) => group.join(" == "))
            .filter((pair) => !KNOWN_IDENTICAL.includes(pair));

        expect(duplicates, "the same migration committed twice").toEqual([]);
    });
});
