#!/usr/bin/env bash
# Push the current branch, then open (or print) a PR on the ORIGINAL repo
# AdithyaPatil-1609/pagecrafts. Never opens a PR on the HSA2005-cloud fork.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# shellcheck disable=SC1091
[ -f "$HOME/.config/pagecrafts/original-repo.env" ] && . "$HOME/.config/pagecrafts/original-repo.env"
bash "$root/scripts/setup-original-repo.sh" >/dev/null

ORIGINAL_REPO="${GH_REPO:-AdithyaPatil-1609/pagecrafts}"
FORK_OWNER="${PAGECRAFTS_FORK_OWNER:-HSA2005-cloud}"
BRANCH="$(git branch --show-current)"

if [ -z "$BRANCH" ] || [ "$BRANCH" = "main" ]; then
  echo "Refuse to open a PR from '${BRANCH:-detached}'. Create a feature branch first." >&2
  exit 1
fi

TITLE="${1:-}"
if [ -z "$TITLE" ]; then
  TITLE="$(git log -1 --pretty=%s)"
fi

BODY="${2:-}"
if [ -z "$BODY" ]; then
  BODY="$(git log -1 --pretty=%b)"
fi

# Push branch to the fork (writable). Pulls still come from original via origin fetch.
if git remote get-url fork >/dev/null 2>&1; then
  git push -u fork "HEAD:refs/heads/${BRANCH}"
else
  git push -u origin "HEAD:refs/heads/${BRANCH}"
fi

COMPARE="https://github.com/${ORIGINAL_REPO}/compare/main...${FORK_OWNER}:${BRANCH}?expand=1"

echo "Opening PR on ${ORIGINAL_REPO} from ${FORK_OWNER}:${BRANCH}…"
if gh pr create \
  --repo "$ORIGINAL_REPO" \
  --head "${FORK_OWNER}:${BRANCH}" \
  --base main \
  --title "$TITLE" \
  --body "${BODY:-See branch ${BRANCH}.}"; then
  exit 0
fi

echo ""
echo "Could not create the PR with this token (often 403 for cursor[bot])."
echo "Branch is on the fork. Open the PR on the ORIGINAL repo here:"
echo "  ${COMPARE}"
exit 0
