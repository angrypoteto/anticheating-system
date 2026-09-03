#!/usr/bin/env bash
# One-shot bootstrap for a fresh Ubuntu 22.04/24.04 VM (Oracle Always Free, DigitalOcean, etc).
# Run as root right after first login: bash provision-vps.sh
set -euo pipefail

# ---- Edit these before running ----
DOMAIN="exam.example.edu"        # domain/subdomain pointed at this VM's IP, or leave blank to skip TLS
APP_USER="deploy"                # non-root user that will own and run the app
APP_PORT="3000"                  # port the Next.js app listens on internally
NODE_VERSION="20"                # LTS line to install via nvm
# ------------------------------------

echo "==> System update"
apt-get update -y && apt-get upgrade -y

echo "==> Creating deploy user"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi

echo "==> Firewall (UFW): allow SSH, HTTP, HTTPS only"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban for SSH brute-force protection"
apt-get install -y fail2ban
systemctl enable --now fail2ban

echo "==> Nginx"
apt-get install -y nginx
systemctl enable --now nginx

echo "==> Node.js ${NODE_VERSION} + PM2 (installed as ${APP_USER}, not root)"
sudo -iu "$APP_USER" bash -lc "
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  nvm install ${NODE_VERSION}
  nvm alias default ${NODE_VERSION}
  npm install -g pm2
"

echo "==> Nginx reverse proxy config for ${DOMAIN}"
cat > "/etc/nginx/sites-available/${DOMAIN}" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "exam.example.edu" ]; then
  echo "==> TLS via Let's Encrypt for ${DOMAIN}"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "admin@${DOMAIN}" --redirect
else
  echo "==> Skipping TLS: set DOMAIN at the top of this script to your real domain, then re-run the certbot block manually:"
  echo "    certbot --nginx -d your.domain -m you@example.com --agree-tos --redirect"
fi

echo "==> Done."
echo "Next: as ${APP_USER}, clone the repo, run 'npm ci && npm run build', then:"
echo "  pm2 start npm --name anticheat -- start -- --port ${APP_PORT}"
echo "  pm2 save && pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}"
