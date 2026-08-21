#!/usr/bin/env bash
# One-time (idempotent) setup: system tooling, Node dependencies, and pre-pulled
# container images so the per-boot `start` step is fast and works offline.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."

SUPABASE_CLI_VERSION="2.39.2"

# 1. System packages: Docker + the Supabase CLI (+ networking helpers). Kept out
#    of `start` because they are stable and slow to install.
if ! command -v docker >/dev/null 2>&1 || ! command -v supabase >/dev/null 2>&1; then
  sudo apt-get update -y
fi

if ! command -v docker >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    -o Dpkg::Options::=--force-confold \
    docker.io iptables uidmap fuse-overlayfs
fi

if ! command -v supabase >/dev/null 2>&1; then
  arch="$(dpkg --print-architecture)"
  curl -fsSL \
    "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_${arch}.deb" \
    -o /tmp/supabase.deb
  sudo dpkg -i /tmp/supabase.deb
fi

# 2. Pull / gh default to the ORIGINAL repo (AdithyaPatil-1609/pagecrafts),
#    never the HSA2005-cloud fork.
bash "$here/../scripts/setup-original-repo.sh" || true

# 3. Node dependencies. The committed lockfile is authoritative.
npm ci

# 4. Pre-pull container images (Redis, SRH, and the whole Supabase stack) so they
#    are baked into the environment snapshot. Best-effort: if Docker cannot come
#    up during the build, `start` will pull the images on first boot instead.
if bash "$here/docker-up.sh"; then
  supabase start -x realtime,edge-runtime,logflare,vector || true
  supabase stop --no-backup >/dev/null 2>&1 || true
else
  echo "WARN: could not pre-pull images during install; start will pull them" >&2
fi
