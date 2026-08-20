#!/usr/bin/env bash
# Back-compat alias — use setup-original-repo.sh.
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/setup-original-repo.sh"
