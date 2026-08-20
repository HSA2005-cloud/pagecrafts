<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Original repo — pull and PRs

Canonical / production repo: **`AdithyaPatil-1609/pagecrafts`**.

The cloud agent often clones the fork `HSA2005-cloud/pagecrafts`. That fork is only a place to **host branches** when `cursor[bot]` cannot push to the original (GitHub returns 403).

## Rules

1. **Pull / fetch** always from the original repo (`origin` fetch URL → `AdithyaPatil-1609/pagecrafts`). Use `scripts/pull-original.sh` or `git fetch origin` / `git pull origin main` after `scripts/setup-original-repo.sh`.
2. **Never open PRs on the fork.** PRs target `AdithyaPatil-1609/pagecrafts` `main` with head `HSA2005-cloud:<branch>`. Use `scripts/pr-original.sh`.
3. **Do not treat a fork-only PR as done.** Production follows the original repo.
4. `gh` is defaulted to the original via `scripts/setup-original-repo.sh` (wired into `.cursor/install.sh` and `.cursor/start.sh`). `GH_REPO=AdithyaPatil-1609/pagecrafts`.

If `gh pr create` returns 403, push the branch (fork push URL) and give the human:

`https://github.com/AdithyaPatil-1609/pagecrafts/compare/main...HSA2005-cloud:<branch>?expand=1`
