#!/usr/bin/env bash
# Pull the latest main from the ORIGINAL repo (AdithyaPatil-1609/pagecrafts).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

bash "$root/scripts/setup-original-repo.sh" >/dev/null

BRANCH="$(git branch --show-current)"
echo "Fetching original main…"
git fetch origin main

if [ "$BRANCH" = "main" ]; then
  git pull origin main
else
  echo "On ${BRANCH}: fast-forwarding with origin/main as the merge base reference."
  git merge --ff-only origin/main 2>/dev/null || \
    echo "Tip: rebase with: git rebase origin/main"
fi
