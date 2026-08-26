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

# Push branch to the original repo (same as fetch).
if ! git push -u origin "HEAD:refs/heads/${BRANCH}"; then
  echo "Push to ${ORIGINAL_REPO} failed. If you lack write access, push to fork and open a cross-repo PR:" >&2
  if git remote get-url fork >/dev/null 2>&1; then
    git push -u fork "HEAD:refs/heads/${BRANCH}"
    COMPARE="https://github.com/${ORIGINAL_REPO}/compare/main...${FORK_OWNER}:${BRANCH}?expand=1"
    echo "  ${COMPARE}" >&2
  fi
  exit 1
fi

COMPARE="https://github.com/${ORIGINAL_REPO}/compare/main...${BRANCH}?expand=1"

echo "Opening PR on ${ORIGINAL_REPO} from ${BRANCH}…"
if gh pr create \
  --repo "$ORIGINAL_REPO" \
  --head "${BRANCH}" \
  --base main \
  --title "$TITLE" \
  --body "${BODY:-See branch ${BRANCH}.}"; then
  exit 0
fi

echo ""
echo "Could not create the PR with this token."
echo "Branch is on the original repo. Open the PR here:"
echo "  ${COMPARE}"
exit 0
