#!/usr/bin/env bash
#
# Instalação automática do Ziah Cortes num servidor Ubuntu (22.04 / 24.04).
#
# Rode a partir da pasta do projeto já clonado no servidor, como root:
#
#   sudo bash deploy/setup_servidor.sh <IP-DO-SERVIDOR>
#
# Exemplo:  sudo bash deploy/setup_servidor.sh 203.0.113.45
#
# O que ele faz:
#   1. Instala Python 3 e o Caddy (HTTPS automático).
#   2. Cria o usuário de sistema "ziah" e copia o app para /opt/ziah.
#   3. Cria o config.json (se não existir) e o /etc/ziah/ziah.env.
#   4. Instala e liga o serviço systemd (reinício automático).
#   5. Configura o Caddy com HTTPS via <IP>.sslip.io e abre o firewall.
#
set -euo pipefail

APP_DIR=/opt/ziah
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # raiz do projeto (uma pasta acima de deploy/)

# ---- 0. Checagens ----
if [[ $EUID -ne 0 ]]; then
  echo "Rode com sudo:  sudo bash deploy/setup_servidor.sh <IP>"; exit 1
fi
SERVER_IP="${1:-}"
if [[ -z "$SERVER_IP" ]]; then
  echo "Informe o IP público do servidor. Ex.: sudo bash deploy/setup_servidor.sh 203.0.113.45"; exit 1
fi
SITE_ADDR="${SERVER_IP}.sslip.io"

echo "==> Instalando dependências (python3, caddy)..."
apt-get update -y
apt-get install -y python3 debian-keyring debian-archive-keyring apt-transport-https curl gnupg
# Repositório oficial do Caddy
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> Criando usuário e pasta do app..."
id -u ziah >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin ziah
mkdir -p "$APP_DIR"
# Copia o código (sem .git, banco de testes ou segredos locais)
rsync -a --delete \
  --exclude '.git' --exclude '__pycache__' --exclude 'appointments.db*' \
  --exclude 'config.json' --exclude '.claude' \
  "$SRC_DIR"/ "$APP_DIR"/

echo "==> Configurando config.json..."
if [[ ! -f "$APP_DIR/config.json" ]]; then
  cp "$APP_DIR/config.example.json" "$APP_DIR/config.json"
  echo "    Criado $APP_DIR/config.json a partir do modelo — EDITE-O depois."
fi
chown -R ziah:ziah "$APP_DIR"
chmod 600 "$APP_DIR/config.json"

echo "==> Configurando segredos em /etc/ziah/ziah.env..."
mkdir -p /etc/ziah
if [[ ! -f /etc/ziah/ziah.env ]]; then
  cp "$SRC_DIR/deploy/ziah.env.example" /etc/ziah/ziah.env
fi
chown ziah:ziah /etc/ziah/ziah.env
chmod 600 /etc/ziah/ziah.env

echo "==> Instalando o serviço systemd..."
cp "$SRC_DIR/deploy/ziah.service" /etc/systemd/system/ziah.service
systemctl daemon-reload
systemctl enable --now ziah

echo "==> Configurando o Caddy (HTTPS automático em ${SITE_ADDR})..."
sed "s/203\.0\.113\.45\.sslip\.io/${SITE_ADDR}/" "$SRC_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo "==> Configurando o firewall (SSH, HTTP, HTTPS)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  yes | ufw enable || true
fi

echo "==> Configurando backup diário do banco..."
chmod +x "$APP_DIR/deploy/backup_db.sh"
cp "$SRC_DIR/deploy/ziah-backup.cron" /etc/cron.d/ziah-backup
chmod 644 /etc/cron.d/ziah-backup
mkdir -p /var/backups/ziah
# Faz um primeiro backup agora para validar que está tudo certo.
bash "$APP_DIR/deploy/backup_db.sh" || echo "    (backup inicial pulado — banco ainda vazio)"

echo ""
echo "======================================================================"
echo " Pronto! Acesse:"
echo "   Cliente:  https://${SITE_ADDR}/"
echo "   Painel:   https://${SITE_ADDR}/admin"
echo ""
echo " IMPORTANTE — faça agora:"
echo "   1. Edite os segredos:   sudo nano /etc/ziah/ziah.env"
echo "   2. Edite serviços/preços/WhatsApp:  sudo nano ${APP_DIR}/config.json"
echo "   3. Reinicie:            sudo systemctl restart ziah"
echo ""
echo " Logs do app:   journalctl -u ziah -f"
echo " Backups:       /var/backups/ziah  (diário às 03:30)"
echo "======================================================================"
