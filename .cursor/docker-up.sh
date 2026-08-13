#!/usr/bin/env bash
# Bring up the Docker daemon (tuned for this nested Cloud Agent VM) plus a Redis +
# Serverless-Redis-HTTP (SRH) pair that speaks the Upstash REST protocol the app's
# rate limiter expects. Idempotent: safe to run on every boot and more than once.
set -euo pipefail

SRH_TOKEN="local-dev-token"

ensure_dockerd() {
  sudo mkdir -p /etc/docker
  # overlay2 cannot mount in this nested VM ("failed to mount overlay: invalid
  # argument"); fuse-overlayfs works. Let Docker manage its own nft rules —
  # disabling them (iptables:false) breaks all container networking.
  echo '{"storage-driver":"fuse-overlayfs"}' | sudo tee /etc/docker/daemon.json >/dev/null

  if ! sudo docker info >/dev/null 2>&1; then
    sudo rm -f /var/run/docker.pid
    sudo nohup dockerd >/tmp/dockerd.log 2>&1 &
    for _ in $(seq 1 60); do
      sudo docker info >/dev/null 2>&1 && break
      sleep 1
    done
  fi

  if ! sudo docker info >/dev/null 2>&1; then
    echo "dockerd failed to start" >&2
    tail -n 40 /tmp/dockerd.log >&2 || true
    return 1
  fi

  # The Supabase CLI and the helper commands below run unprivileged, so the
  # socket must be usable without sudo. Wait until that is actually true rather
  # than assuming a single chmod raced ahead of the socket being (re)created.
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
    sleep 1
  done

  if ! docker info >/dev/null 2>&1; then
    echo "docker socket is not accessible without sudo" >&2
    return 1
  fi
}

fix_bridge_networking() {
  # br_netfilter forces same-bridge container traffic through iptables, where
  # Docker's default rules drop it in this VM. Turning it off lets containers on
  # one network reach each other (Postgres <-> auth/rest/storage, SRH <-> Redis).
  for f in bridge-nf-call-iptables bridge-nf-call-ip6tables; do
    if [ -f "/proc/sys/net/bridge/$f" ]; then
      echo 0 | sudo tee "/proc/sys/net/bridge/$f" >/dev/null || true
    fi
  done
}

ensure_redis_srh() {
  docker network inspect srhnet >/dev/null 2>&1 || docker network create srhnet >/dev/null

  if ! docker ps --format '{{.Names}}' | grep -qx 'pc-redis'; then
    docker rm -f pc-redis >/dev/null 2>&1 || true
    docker run -d --name pc-redis --restart unless-stopped --network srhnet \
      redis:7-alpine >/dev/null
  fi

  if ! docker ps --format '{{.Names}}' | grep -qx 'pc-srh'; then
    docker rm -f pc-srh >/dev/null 2>&1 || true
    docker run -d --name pc-srh --restart unless-stopped --network srhnet -p 8079:80 \
      -e SRH_MODE=env \
      -e SRH_TOKEN="$SRH_TOKEN" \
      -e SRH_CONNECTION_STRING="redis://pc-redis:6379" \
      hiett/serverless-redis-http:latest >/dev/null
  fi
}

ensure_dockerd
fix_bridge_networking
ensure_redis_srh
