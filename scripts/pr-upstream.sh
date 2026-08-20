#!/usr/bin/env bash
# Open a pull request against upstream AdithyaPatil-1609/pagecrafts from the
# current fork branch. Never opens a PR on the HSA2005-cloud fork.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# shellcheck disable=SC1091
[ -f "$HOME/.config/pagecrafts/upstream.env" ] && . "$HOME/.config/pagecrafts/upstream.env"
bash "$root/scripts/setup-upstream-default.sh" >/dev/null

UPSTREAM_REPO="${GH_REPO:-AdithyaPatil-1609/pagecrafts}"
FORK_OWNER="HSA2005-cloud"
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

git push -u origin "HEAD:refs/heads/${BRANCH}"

echo "Opening PR on ${UPSTREAM_REPO} from ${FORK_OWNER}:${BRANCH}…"
gh pr create \
  --repo "$UPSTREAM_REPO" \
  --head "${FORK_OWNER}:${BRANCH}" \
  --base main \
  --title "$TITLE" \
  --body "${BODY:-See branch ${BRANCH}.}"
