<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pull requests — always upstream

This checkout is often the **fork** `HSA2005-cloud/pagecrafts`. Production and the canonical repo are **`AdithyaPatil-1609/pagecrafts`**.

**Always open PRs against upstream**, never against the fork:

- Target: `AdithyaPatil-1609/pagecrafts` (`main`)
- Head: `HSA2005-cloud:<feature-branch>`
- Terminal: `gh` is defaulted to upstream via `scripts/setup-upstream-default.sh` (run from `.cursor/install.sh` / `.cursor/start.sh`). Prefer `scripts/pr-upstream.sh` to open a PR.
- Equivalent: `gh pr create --repo AdithyaPatil-1609/pagecrafts --head HSA2005-cloud:$(git branch --show-current) --base main`
- Do **not** merge only into `HSA2005-cloud/pagecrafts` and stop — that does not update `pagecrafts.in`.

If the GitHub App cannot create the upstream PR (403), push the branch to the fork and give the human this compare link:

`https://github.com/AdithyaPatil-1609/pagecrafts/compare/main...HSA2005-cloud:<branch>?expand=1`
