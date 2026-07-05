# Ziah Cortes — Sistema de Agendamento

Sistema de agendamento online para a barbearia **Ziah Cortes**. O cliente marca
horário pelo site; o painel `/admin` gerencia a agenda; o barbeiro recebe avisos
de marcação e cancelamento pelo Telegram.

Feito para ser simples de operar: um único servidor em **Python (biblioteca
padrão, zero dependências externas)** com banco **SQLite**. Não precisa instalar
pacotes com `pip`.

---

## Estrutura do projeto

```
PROJETO_ZIAH/
├── server.py              # Servidor HTTP + API + banco (SQLite)
├── config.json            # Configuração e SEGREDOS (NÃO versionado)
├── config.example.json    # Modelo para criar o config.json
├── configurar_telegram.py # Assistente para cadastrar quem recebe os avisos
├── CONFIGURAR_TELEGRAM.bat# Atalho (Windows) para o assistente acima
├── requirements.txt       # Só notas — o projeto não tem dependências pip
├── appointments.db        # Banco com dados reais (NÃO versionado)
├── static/                # Front-end (HTML, CSS, JS)
│   ├── index.html         # Página do cliente
│   ├── admin.html         # Painel do barbeiro
│   ├── app.js / admin.js  # Lógica das páginas
│   ├── styles.css / theme.js / logo.svg
├── deploy/                # Arquivos de produção (servidor)
│   ├── DEPLOY.md          # Guia de deploy passo a passo
│   ├── setup_servidor.sh  # Instalação automática (Ubuntu)
│   ├── ziah.service       # Serviço systemd
│   ├── Caddyfile          # Proxy reverso + HTTPS automático
│   ├── ziah.env.example   # Modelo dos segredos
│   ├── backup_db.sh       # Backup diário do banco
│   └── ziah-backup.cron   # Agendamento do backup
├── README.md              # Este arquivo
└── SEGURANCA.md           # Passos de segurança (LEIA antes de produção)
```

---

## Requisitos

- **Python 3.8+** (recomendado 3.10 ou superior). Confira com `python --version`.

## Rodar localmente

1. Crie o `config.json` a partir do modelo:

   ```bash
   copy config.example.json config.json     # Windows
   # cp config.example.json config.json     # Linux/Mac
   ```

2. Edite o `config.json` com seus dados (WhatsApp, senha do admin, serviços).

3. Inicie o servidor:

   ```bash
   python server.py
   ```

4. Acesse:
   - Cliente: <http://localhost:8000>
   - Painel:  <http://localhost:8000/admin>

O servidor cria as tabelas do banco sozinho no primeiro start.

---

## Configuração (`config.json`)

Principais campos:

| Campo | O que é |
|---|---|
| `business_name` | Nome exibido no site |
| `whatsapp` | Número (só dígitos, com DDI) para o botão de WhatsApp |
| `admin.username` / `admin.password_sha256` | Login do painel (senha em hash SHA-256) |
| `services` | Lista de serviços com `name`, `price` e `addon_sobrancelha` opcional |
| `direct_services` | Serviços que só podem ser combinados direto com o barbeiro |
| `slots.morning` / `slots.afternoon` | Horários disponíveis |
| `open_weekdays` | Dias abertos (0=segunda … 6=domingo) |
| `max_days_ahead` | Até quantos dias à frente o cliente pode marcar |
| `cancel_min_hours` | Antecedência mínima para o cliente cancelar sozinho |
| `booking_cutoff_minutes` | Minutos antes do horário em que o site trava a marcação |
| `week_booking_limit` | Máximo de marcações por cliente na semana |
| `telegram` | Token do bot e destinatários dos avisos |
| `host` / `port` | Endereço de escuta (padrão `127.0.0.1:8000`) |

### Segredos por variável de ambiente (recomendado em produção)

Em vez de deixar os segredos no `config.json`, você pode defini-los no ambiente.
Eles têm **prioridade** sobre o arquivo:

| Variável | Substitui |
|---|---|
| `BARBER_ADMIN_USER` | `admin.username` |
| `BARBER_ADMIN_PASSWORD` | senha do admin (texto puro; o servidor faz o hash) |
| `BARBER_TELEGRAM_TOKEN` | `telegram.bot_token` |
| `BARBER_TELEGRAM_CHAT_ID` | um destinatário do Telegram |

Exemplo (Windows PowerShell):

```powershell
$env:BARBER_ADMIN_PASSWORD = "minha-senha-forte"
python server.py
```

---

## Notificações no Telegram

Para o barbeiro (e você) receberem avisos de marcação/cancelamento:

1. Crie um bot no **@BotFather** (`/newbot`) e guarde o token.
2. Cada pessoa que vai receber abre o bot e toca em **Iniciar**.
3. Rode o assistente logo em seguida:

   ```bash
   python configurar_telegram.py      # ou dê 2 cliques em CONFIGURAR_TELEGRAM.bat
   ```

   Ele captura quem falou com o bot e adiciona aos destinatários. Repita para
   cada pessoa e reinicie o site no final.

---

## Colocar em produção (servidor)

Como o site vai atender vários clientes, o ideal é um **servidor Linux (VPS)**
sempre no ar, com HTTPS e reinício automático. O passo a passo completo —
escolha do provedor, criação do VPS, deploy, HTTPS e backup — está em
**[`deploy/DEPLOY.md`](deploy/DEPLOY.md)**.

Resumo da arquitetura: o **Caddy** recebe os acessos em HTTPS (porta 443) e
repassa para o `server.py`, que escuta só em `127.0.0.1:8000` sob o **systemd**
(que o mantém no ar). O banco SQLite dá conta do movimento de uma barbearia.

Instalação rápida (num Ubuntu 24.04, já como root):

```bash
apt-get update && apt-get install -y git
git clone https://github.com/Estudio-Kode/kode-ziahcortes-sisagendamento.git ziah
cd ziah
sudo bash deploy/setup_servidor.sh SEU-IP    # ex.: ...setup_servidor.sh 203.0.113.45
```

O script instala tudo e liga o HTTPS automático em `https://SEU-IP.sslip.io`
(funciona **sem precisar de domínio**; dá para trocar por um domínio depois).

Arquivos de deploy inclusos na pasta `deploy/`:

- `DEPLOY.md` — guia completo passo a passo
- `setup_servidor.sh` — instalação automática (Ubuntu)
- `ziah.service` — serviço systemd (reinício automático)
- `Caddyfile` — proxy reverso com HTTPS automático
- `ziah.env.example` — modelo dos segredos (senha do admin, token)
- `backup_db.sh` + `ziah-backup.cron` — backup diário automático do banco

> **Antes de divulgar**, faça os passos do [`SEGURANCA.md`](SEGURANCA.md)
> (rotacionar o token do Telegram e limpar o histórico do Git).

---

## Segurança já embutida

O servidor já traz: cabeçalhos de segurança (CSP, `X-Frame-Options`, etc.),
limite de tentativas de login por IP, sessões de admin com expiração, proteção
contra *path traversal* nos arquivos estáticos, limite de tamanho de requisição
e trava de concorrência nas marcações. Ainda assim, cumpra os passos do
[`SEGURANCA.md`](SEGURANCA.md) antes de expor o site.
