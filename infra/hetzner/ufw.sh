#!/usr/bin/env bash
# UFW config for the riskrask Hetzner box.
# Outbound: everything. Inbound: ssh + 80/443. Game-server port 8787 stays loopback-only
# because Caddy reverse-proxies it.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "must run as root (use sudo)" >&2
  exit 1
fi

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH with rate-limit
ufw limit 22/tcp comment 'ssh (rate-limited)'

# HTTP/HTTPS for Caddy
ufw allow 80/tcp comment 'http (caddy / acme)'
ufw allow 443/tcp comment 'https (caddy)'
ufw allow 443/udp comment 'http3 (caddy)'

ufw --force enable
ufw status verbose
