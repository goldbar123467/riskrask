#!/usr/bin/env bash
# Disable root SSH login and password auth. Idempotent.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "must run as root (use sudo)" >&2
  exit 1
fi

CFG=/etc/ssh/sshd_config.d/99-riskrask-hardening.conf
cat > "$CFG" <<'EOF'
# Managed by riskrask infra. Do not edit by hand.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 60
ClientAliveCountMax 3
EOF

# Validate before reload
sshd -t

systemctl reload ssh

echo "sshd hardening applied; rules in $CFG"
