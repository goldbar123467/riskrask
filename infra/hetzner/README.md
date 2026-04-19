# Hetzner deploy notes

Target: `159.69.91.90` (Ubuntu 24.04 LTS, 4 vCPU, 7.6 GB RAM, 75 GB disk, Hetzner Nuremberg). User: `clark` with passwordless sudo and ed25519 key auth.

## Bootstrap (run from a workstation, one-time)

```sh
# 1. push your key to the box (already done in our case)

# 2. update + base packages
ssh clark@159.69.91.90 'sudo apt-get update && sudo apt-get -y upgrade \
  && sudo apt-get -y install build-essential curl git ufw fail2ban unattended-upgrades jq'

# 3. install Docker via the convenience script
ssh clark@159.69.91.90 'curl -fsSL https://get.docker.com | sudo sh \
  && sudo usermod -aG docker clark'
# log out + back in so the group membership applies

# 4. enable UFW (script in this dir)
scp infra/hetzner/ufw.sh clark@159.69.91.90:/tmp/
ssh clark@159.69.91.90 'sudo bash /tmp/ufw.sh'

# 5. harden sshd
scp infra/hetzner/sshd-hardening.sh clark@159.69.91.90:/tmp/
ssh clark@159.69.91.90 'sudo bash /tmp/sshd-hardening.sh'

# 6. clone the repo
ssh clark@159.69.91.90 'git clone git@github.com:goldbar123467/riskrask.git ~/riskrask'

# 7. drop the secrets file
scp ~/riskrask-secrets/.env.prod clark@159.69.91.90:~/.config/riskrask/.env.prod
ssh clark@159.69.91.90 'chmod 600 ~/.config/riskrask/.env.prod \
  && cp ~/.config/riskrask/.env.prod ~/riskrask/apps/server/.env'

# 8. start the stack
ssh clark@159.69.91.90 'cd ~/riskrask && docker compose -f apps/server/docker-compose.yml up -d --build'
```

## Updates

```sh
ssh clark@159.69.91.90 'cd ~/riskrask && git pull && docker compose -f apps/server/docker-compose.yml up -d --build'
```

## Rollback

```sh
ssh clark@159.69.91.90 'cd ~/riskrask && git checkout v3.0.0 && docker compose -f apps/server/docker-compose.yml up -d --build'
```
