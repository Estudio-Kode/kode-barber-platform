# 🚀 Colocar o Ziah Cortes em produção (servidor)

Guia para publicar o site num servidor Linux, com HTTPS e reinício automático,
pronto para atender vários clientes ao mesmo tempo.

Arquitetura: os clientes acessam o **Caddy** (porta 443, HTTPS), que repassa o
tráfego para o **servidor Python** rodando só no `localhost:8000`, sob o
**systemd** (que o mantém no ar e reinicia se cair). O banco é o **SQLite**, que
dá conta tranquilamente do movimento de uma barbearia.

```
Cliente ──HTTPS──> Caddy (443) ──local──> server.py (127.0.0.1:8000) ──> SQLite
```

---

## 1. Escolher e criar o servidor (VPS)

Você ainda não tem servidor. Recomendação para uma barbearia (barato, com
datacenter em São Paulo e suporte em português):

| Provedor | Plano de entrada | Preço aprox. | Observação |
|---|---|---|---|
| **Hostinger VPS** (recomendado) | KVM 1 — 1 vCPU, 4 GB RAM | ~R$ 28/mês | Datacenter em SP, suporte 24/7 em PT, backup incluso. Mais fácil para iniciante. |
| **Vultr** | Regular — 1 vCPU, 1 GB RAM | ~US$ 5–6/mês | Tem região São Paulo. Mais técnico, interface em inglês. |
| **Contabo** | Cloud VPS | ~US$ 5/mês | Barato, mas datacenter fora do Brasil (latência maior). |

Qualquer um serve — o site é leve. Ao criar o VPS:

1. Escolha a imagem **Ubuntu 24.04 LTS** (ou 22.04).
2. Escolha a região mais perto (**São Paulo**, se houver).
3. Defina uma senha de root **ou** adicione sua chave SSH.
4. Anote o **IP público** do servidor (algo como `203.0.113.45`).

---

## 2. Acessar o servidor

No seu computador (PowerShell no Windows já tem `ssh`):

```bash
ssh root@SEU-IP
```

Aceite a chave na primeira vez e entre com a senha.

---

## 3. Instalação automática (jeito fácil)

No servidor, instale o git, clone o projeto e rode o script de setup:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/Estudio-Kode/kode-ziahcortes-sisagendamento.git ziah
cd ziah
sudo bash deploy/setup_servidor.sh SEU-IP
```

Troque `SEU-IP` pelo IP do servidor (ex.: `sudo bash deploy/setup_servidor.sh 203.0.113.45`).

O script instala Python e Caddy, cria o serviço, liga o HTTPS automático em
`https://SEU-IP.sslip.io` e abre o firewall. Ao terminar, faça os ajustes finais
(passo 5).

> Prefere fazer manualmente? Veja o passo 4. Se usou o script, pule para o 5.

---

## 4. Instalação manual (passo a passo)

```bash
# 4.1 Dependências
apt-get update && apt-get install -y python3 rsync git

# 4.2 Caddy (proxy com HTTPS automático)
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# 4.3 Usuário e código
useradd --system --home /opt/ziah --shell /usr/sbin/nologin ziah
git clone https://github.com/Estudio-Kode/kode-ziahcortes-sisagendamento.git /tmp/ziah
mkdir -p /opt/ziah
rsync -a --exclude '.git' --exclude 'appointments.db*' --exclude 'config.json' /tmp/ziah/ /opt/ziah/
cp /opt/ziah/config.example.json /opt/ziah/config.json
chown -R ziah:ziah /opt/ziah && chmod 600 /opt/ziah/config.json

# 4.4 Segredos
mkdir -p /etc/ziah
cp /opt/ziah/deploy/ziah.env.example /etc/ziah/ziah.env
chown ziah:ziah /etc/ziah/ziah.env && chmod 600 /etc/ziah/ziah.env

# 4.5 Serviço systemd
cp /opt/ziah/deploy/ziah.service /etc/systemd/system/ziah.service
systemctl daemon-reload && systemctl enable --now ziah

# 4.6 Caddy: edite o Caddyfile trocando pelo <IP>.sslip.io e recarregue
cp /opt/ziah/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile      # troque 203.0.113.45.sslip.io pelo SEU IP
systemctl reload caddy

# 4.7 Firewall
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

---

## 5. Ajustes finais (obrigatório)

1. **Segredos** — senha do admin e token do Telegram:

   ```bash
   sudo nano /etc/ziah/ziah.env
   ```

2. **Dados do negócio** — WhatsApp, serviços, preços, horários:

   ```bash
   sudo nano /opt/ziah/config.json
   ```

3. **Aplicar as mudanças:**

   ```bash
   sudo systemctl restart ziah
   ```

Acesse então:
- Cliente: `https://SEU-IP.sslip.io/`
- Painel:  `https://SEU-IP.sslip.io/admin`

> Antes de divulgar, cumpra o [`../SEGURANCA.md`](../SEGURANCA.md): rotacione o
> token do Telegram e limpe o histórico do Git.

---

## 6. Domínio próprio (quando tiver)

O `.sslip.io` funciona bem, mas um domínio (ex.: `ziahcortes.com.br`) fica mais
profissional. Depois de registrar um:

1. No painel do domínio, crie um registro **A** apontando para o IP do servidor.
2. Edite `/etc/caddy/Caddyfile`, troque a linha do `.sslip.io` pelo seu domínio
   (há um bloco de exemplo comentado no arquivo).
3. `sudo systemctl reload caddy` — o Caddy emite o certificado HTTPS sozinho.

---

## 7. Operação do dia a dia

```bash
# Ver o site funcionando / erros
journalctl -u ziah -f

# Reiniciar o app (após mudar config)
sudo systemctl restart ziah

# Status
systemctl status ziah caddy
```

**Atualizar o site** com uma versão nova do GitHub:

```bash
cd /tmp/ziah && git pull
sudo rsync -a --exclude '.git' --exclude 'appointments.db*' --exclude 'config.json' /tmp/ziah/ /opt/ziah/
sudo chown -R ziah:ziah /opt/ziah
sudo systemctl restart ziah
```

## 8. Backup automático do banco (dados dos clientes)

O `setup_servidor.sh` já configura um **backup diário automático**. Se instalou
manualmente, ative assim:

```bash
sudo chmod +x /opt/ziah/deploy/backup_db.sh
sudo cp /opt/ziah/deploy/ziah-backup.cron /etc/cron.d/ziah-backup
sudo mkdir -p /var/backups/ziah
```

Como funciona:

- Roda **todo dia às 03:30** (via `cron`).
- Gera uma cópia **consistente** do SQLite (o script usa o backup nativo do
  banco, seguro mesmo com o site rodando) e compacta com gzip.
- Guarda em `/var/backups/ziah/` e mantém os **últimos 14 dias** (apaga os mais
  antigos sozinho).
- Registra cada execução em `/var/log/ziah-backup.log`.

Rodar um backup na hora (sem esperar o horário):

```bash
sudo bash /opt/ziah/deploy/backup_db.sh
ls -lh /var/backups/ziah/          # ver os backups
```

**Restaurar** um backup (ex.: recuperar dados após um problema):

```bash
sudo systemctl stop ziah
sudo gunzip -c /var/backups/ziah/appointments-2026-07-05_0330.db.gz \
  | sudo tee /opt/ziah/appointments.db > /dev/null
sudo rm -f /opt/ziah/appointments.db-wal /opt/ziah/appointments.db-shm
sudo chown ziah:ziah /opt/ziah/appointments.db
sudo systemctl start ziah
```

> Recomendado: de tempos em tempos, copie os backups também para **fora do
> servidor** (seu computador ou uma nuvem), caso o VPS tenha algum problema:
> `scp root@SEU-IP:/var/backups/ziah/*.gz ./`
