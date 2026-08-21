#!/usr/bin/env bash
# Back-compat alias — use pr-original.sh.
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/pr-original.sh" "$@"
