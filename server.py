#!/usr/bin/env python3
"""
Servidor da Barbearia - HTTP + SQLite usando apenas a biblioteca padrao do Python.

Como rodar:
    python server.py

Depois abra no navegador: http://localhost:8000
Painel admin: http://localhost:8000/admin

Toda a configuracao (WhatsApp, login admin, servicos, horarios) fica em config.json.
"""

import json
import os
import re
import sqlite3
import secrets
import hashlib
import hmac
import threading
import time
import urllib.request
import urllib.parse
from datetime import datetime, date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
# Em plataformas com disco efemero (ex.: Railway), o banco precisa ficar num
# volume persistente fora da pasta da aplicacao. Se BARBER_DATA_DIR estiver
# definida (aponte-a para o "Mount Path" do volume), o banco vai para la;
# senao, mantem o comportamento local de sempre (ao lado do server.py).
DATA_DIR = os.environ.get("BARBER_DATA_DIR", BASE_DIR)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "appointments.db")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

WEEKDAY_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
MONTH_LABELS = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config():
    """Carrega a configuracao do config.json local ou, se nao existir (ex.: em
    plataformas como Railway, onde o arquivo e ignorado pelo Git de proposito),
    da variavel de ambiente BARBER_CONFIG_JSON (o JSON inteiro como texto)."""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    raw = os.environ.get("BARBER_CONFIG_JSON")
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise SystemExit(
                "BARBER_CONFIG_JSON esta definida, mas nao e um JSON valido: %s" % e
            )

    raise SystemExit(
        "Nao encontrei configuracao. Crie um config.json (copie de "
        "config.example.json) OU defina a variavel de ambiente "
        "BARBER_CONFIG_JSON com o conteudo do config.json em uma linha so. "
        "Em plataformas como Railway, use a segunda opcao."
    )


CONFIG = load_config()

# Sessoes admin em memoria: token -> expiry (epoch)
SESSIONS = {}
SESSION_TTL = 60 * 60 * 8  # 8 horas
_db_lock = threading.Lock()

# Limites de seguranca
MAX_BODY_BYTES = 64 * 1024          # tamanho maximo de um corpo JSON (anti-DoS)
MAX_NAME_LEN = 60                     # tamanho maximo do nome
MAX_NOTE_LEN = 2000                   # tamanho maximo das observacoes de um dia
LOGIN_MAX_ATTEMPTS = 5               # tentativas de login antes de bloquear
LOGIN_WINDOW_SECONDS = 5 * 60        # janela do bloqueio (por IP)

# Controle de tentativas de login: ip -> [timestamps das falhas recentes]
_login_attempts = {}
_login_lock = threading.Lock()

# Caracteres de controle (exceto espacos comuns) usados para limpar entradas de texto.
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_text(value, max_len):
    """Remove caracteres de controle e limita o tamanho de um texto livre."""
    cleaned = _CONTROL_CHARS.sub("", (value or "")).strip()
    return cleaned[:max_len]


def login_rate_limited(ip):
    """True se o IP excedeu o numero de tentativas de login na janela atual."""
    now = time.time()
    with _login_lock:
        recent = [t for t in _login_attempts.get(ip, []) if now - t < LOGIN_WINDOW_SECONDS]
        _login_attempts[ip] = recent
        return len(recent) >= LOGIN_MAX_ATTEMPTS


def record_login_failure(ip):
    with _login_lock:
        _login_attempts.setdefault(ip, []).append(time.time())


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db():
    conn = get_db()
    # Clientes: o TELEFONE e a identidade (chave primaria). O nome e apenas um
    # rotulo para o barbeiro saber quem e; pode ser atualizado a cada visita.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS clients (
            phone      TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    # Marcacoes: identificadas pelo telefone do cliente (sem nome aqui; o nome
    # vem da tabela clients). Em DB ja existente, a migracao abaixo ajusta isso.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS appointments (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            phone      TEXT NOT NULL,
            service    TEXT NOT NULL,
            date       TEXT NOT NULL,
            time       TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(date, time)
        )
        """
    )
    # Horarios bloqueados pelo admin: nenhum cliente pode marcar nesses (date, time).
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS blocked_slots (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            date       TEXT NOT NULL,
            time       TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(date, time)
        )
        """
    )
    # Observacoes (anotacoes livres) do admin para cada dia.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS day_notes (
            date       TEXT PRIMARY KEY,
            note       TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    _migrate_phone_identity(conn)
    conn.close()


def _migrate_phone_identity(conn):
    """
    Migracao para bancos antigos onde appointments tinha a coluna 'name'.

    Move o nome de cada telefone para a tabela clients (mantendo o nome mais
    recente) e reconstroi appointments sem a coluna 'name'. Idempotente: se a
    coluna ja nao existe, nao faz nada.
    """
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(appointments)")]
    if "name" not in cols:
        return  # ja migrado (ou DB novo)

    # 1. Deriva um nome por telefone (o mais recente, por created_at).
    rows = conn.execute(
        "SELECT phone, name, created_at FROM appointments ORDER BY created_at"
    ).fetchall()
    derived = {}
    for r in rows:
        c = derived.get(r["phone"])
        if c is None:
            derived[r["phone"]] = {"name": r["name"], "created_at": r["created_at"]}
        else:
            c["name"] = r["name"]  # ordem crescente -> ultimo nome prevalece
    for phone, c in derived.items():
        existing = conn.execute(
            "SELECT 1 FROM clients WHERE phone = ?", (phone,)
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO clients (phone, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (phone, c["name"], c["created_at"], c["created_at"]),
            )

    # 2. Reconstroi appointments sem a coluna 'name', preservando os dados.
    conn.execute("ALTER TABLE appointments RENAME TO _appointments_old")
    conn.execute(
        """
        CREATE TABLE appointments (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            phone      TEXT NOT NULL,
            service    TEXT NOT NULL,
            date       TEXT NOT NULL,
            time       TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(date, time)
        )
        """
    )
    conn.execute(
        """INSERT INTO appointments (id, phone, service, date, time, created_at)
           SELECT id, phone, service, date, time, created_at FROM _appointments_old"""
    )
    conn.execute("DROP TABLE _appointments_old")
    conn.commit()
    print("[migracao] appointments migrada para identidade por telefone "
          "(%d cliente(s))." % len(derived))


# ---------------------------------------------------------------------------
# Helpers de dominio
# ---------------------------------------------------------------------------

def all_slots():
    return list(CONFIG["slots"]["morning"]) + list(CONFIG["slots"]["afternoon"])


def service_names():
    """Nomes dos servicos (aceita lista de strings ou de objetos {name, price})."""
    return [s["name"] if isinstance(s, dict) else s for s in CONFIG["services"]]


def get_service(name):
    """Retorna o objeto do servico pelo nome, ou None."""
    for s in CONFIG["services"]:
        sname = s["name"] if isinstance(s, dict) else s
        if sname == name:
            return s if isinstance(s, dict) else {"name": s}
    return None


def normalize_phone(raw):
    """Mantem apenas digitos."""
    return re.sub(r"\D", "", raw or "")


def selectable_days():
    """Lista os dias selecionaveis (terca a sabado, ate max_days_ahead)."""
    today = date.today()
    out = []
    for offset in range(0, CONFIG["max_days_ahead"] + 1):
        d = today + timedelta(days=offset)
        if d.weekday() in CONFIG["open_weekdays"]:
            out.append({
                "date": d.isoformat(),
                "weekday": WEEKDAY_LABELS[d.weekday()],
                "day": d.day,
                "month": MONTH_LABELS[d.month],
                "is_today": d == today,
            })
    return out


def is_valid_booking_date(date_str):
    try:
        d = date.fromisoformat(date_str)
    except (ValueError, TypeError):
        return False
    today = date.today()
    if d < today:
        return False
    if d > today + timedelta(days=CONFIG["max_days_ahead"]):
        return False
    if d.weekday() not in CONFIG["open_weekdays"]:
        return False
    return True


def slot_is_past(date_str, time_str):
    """True se o horario ja passou (considerando data+hora atual)."""
    try:
        dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        return True
    return dt <= datetime.now()


def hours_until(date_str, time_str):
    try:
        dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        return -1
    return (dt - datetime.now()).total_seconds() / 3600.0


def minutes_until(date_str, time_str):
    """Minutos ate o horario; None se a data/hora for invalida."""
    try:
        dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    return (dt - datetime.now()).total_seconds() / 60.0


def slot_within_cutoff(date_str, time_str):
    """
    True se o horario ainda nao passou, mas falta pouco tempo para marcar
    pelo site (<= booking_cutoff_minutes). Nesse caso a marcacao deve ser
    combinada direto com o barbeiro (WhatsApp).
    """
    m = minutes_until(date_str, time_str)
    if m is None:
        return False
    cutoff = CONFIG.get("booking_cutoff_minutes", 30)
    return 0 < m <= cutoff


def week_bounds(date_str):
    """Retorna (segunda, domingo) em ISO da semana que contem date_str."""
    d = date.fromisoformat(date_str)
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def blocked_set(conn, date_str):
    """Conjunto de horarios bloqueados pelo admin para uma data."""
    rows = conn.execute(
        "SELECT time FROM blocked_slots WHERE date = ?", (date_str,)
    ).fetchall()
    return {r["time"] for r in rows}


def upsert_client(conn, phone, name):
    """Cria ou atualiza o cliente identificado pelo telefone, guardando o nome."""
    now = datetime.now().isoformat(timespec="seconds")
    existing = conn.execute(
        "SELECT 1 FROM clients WHERE phone = ?", (phone,)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE clients SET name = ?, updated_at = ? WHERE phone = ?",
            (name, now, phone),
        )
    else:
        conn.execute(
            "INSERT INTO clients (phone, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (phone, name, now, now),
        )


def client_week_count(conn, phone, date_str, exclude_id=None):
    """Quantas marcacoes o telefone ja tem na mesma semana de date_str."""
    monday, sunday = week_bounds(date_str)
    sql = ("SELECT COUNT(*) AS n FROM appointments "
           "WHERE phone = ? AND date BETWEEN ? AND ?")
    params = [phone, monday, sunday]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    return conn.execute(sql, params).fetchone()["n"]


# ---------------------------------------------------------------------------
# Notificacoes ao barbeiro (Telegram)
# ---------------------------------------------------------------------------

def format_phone_br(digits):
    d = re.sub(r"\D", "", digits or "")
    if len(d) == 11:
        return "(%s) %s-%s" % (d[:2], d[2:7], d[7:])
    if len(d) == 10:
        return "(%s) %s-%s" % (d[:2], d[2:6], d[6:])
    return d


def format_date_label(date_str):
    try:
        d = date.fromisoformat(date_str)
        return "%s, %d %s" % (WEEKDAY_LABELS[d.weekday()], d.day, MONTH_LABELS[d.month])
    except (ValueError, TypeError):
        return date_str


def _telegram_recipients(cfg):
    """
    Lista (sem repetidos) de chat_ids que devem receber as notificacoes.

    Aceita um destinatario unico em "chat_id" (compatibilidade) e/ou uma lista
    em "chat_ids". Permite avisar varias pessoas (ex.: o barbeiro e voce).
    """
    ids = []
    env_id = str(os.environ.get("BARBER_TELEGRAM_CHAT_ID") or "").strip()
    if env_id:
        ids.append(env_id)
    single = str(cfg.get("chat_id") or "").strip()
    if single:
        ids.append(single)
    for c in (cfg.get("chat_ids") or []):
        c = str(c).strip()
        if c:
            ids.append(c)
    seen, out = set(), []
    for c in ids:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def telegram_notify(text):
    """
    Envia uma mensagem aos destinatarios via Telegram, em segundo plano.

    Le as credenciais de CONFIG["telegram"] (ou das variaveis de ambiente
    BARBER_TELEGRAM_TOKEN / BARBER_TELEGRAM_CHAT_ID). Se nao estiver
    configurado/ativado, nao faz nada. Falhas NUNCA interrompem a marcacao,
    e uma falha em um destinatario nao impede os demais.
    """
    cfg = CONFIG.get("telegram") or {}
    if not cfg.get("enabled", False):
        return
    token = (os.environ.get("BARBER_TELEGRAM_TOKEN") or cfg.get("bot_token") or "").strip()
    recipients = _telegram_recipients(cfg)
    if not token or not recipients:
        return

    def _send():
        url = "https://api.telegram.org/bot%s/sendMessage" % token
        for chat_id in recipients:
            try:
                payload = urllib.parse.urlencode({
                    "chat_id": chat_id,
                    "text": text,
                    "disable_web_page_preview": "true",
                }).encode("utf-8")
                urllib.request.urlopen(urllib.request.Request(url, data=payload), timeout=10).read()
            except Exception as exc:  # noqa: BLE001 - best-effort, por destinatario
                print("[telegram] falha ao notificar %s: %s" % (chat_id, exc))

    threading.Thread(target=_send, daemon=True).start()


def notify_booking(name, phone, service, date_str, time_str):
    telegram_notify(
        "🟢 Nova marcação\n"
        "👤 %s\n"
        "📞 %s\n"
        "✂️ %s\n"
        "📅 %s às %s"
        % (name, format_phone_br(phone), service, format_date_label(date_str), time_str)
    )


def notify_cancel(name, phone, service, date_str, time_str, by_admin=False):
    origem = "pelo painel" if by_admin else "pelo cliente"
    telegram_notify(
        "🔴 Marcação desmarcada (%s)\n"
        "👤 %s\n"
        "📞 %s\n"
        "✂️ %s\n"
        "📅 %s às %s"
        % (origem, name or "—", format_phone_br(phone), service, format_date_label(date_str), time_str)
    )


# ---------------------------------------------------------------------------
# Sessoes admin
# ---------------------------------------------------------------------------

def create_session():
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = datetime.now().timestamp() + SESSION_TTL
    return token


def valid_session(token):
    if not token:
        return False
    exp = SESSIONS.get(token)
    if not exp:
        return False
    if datetime.now().timestamp() > exp:
        SESSIONS.pop(token, None)
        return False
    return True


def prune_sessions():
    """Remove tokens expirados para evitar crescimento ilimitado da memoria."""
    now = datetime.now().timestamp()
    for tok in [t for t, exp in SESSIONS.items() if now > exp]:
        SESSIONS.pop(tok, None)


def _expected_password_hash():
    """
    Senha esperada como hash SHA-256.

    Ordem de prioridade:
      1. Variavel de ambiente BARBER_ADMIN_PASSWORD (recomendado em producao).
      2. Campo "password_sha256" em config.json (senha ja com hash).
      3. Campo "password" em config.json (texto puro - apenas para uso local).
    """
    env_pw = os.environ.get("BARBER_ADMIN_PASSWORD")
    if env_pw:
        return hashlib.sha256(env_pw.encode("utf-8")).hexdigest()
    cfg = CONFIG["admin"]
    if cfg.get("password_sha256"):
        return str(cfg["password_sha256"]).lower()
    return hashlib.sha256(str(cfg.get("password", "")).encode("utf-8")).hexdigest()


def check_admin_credentials(username, password):
    cfg = CONFIG["admin"]
    expected_user = os.environ.get("BARBER_ADMIN_USER", cfg["username"])
    u_ok = hmac.compare_digest(str(username or ""), str(expected_user))
    given_hash = hashlib.sha256(str(password or "").encode("utf-8")).hexdigest()
    p_ok = hmac.compare_digest(given_hash, _expected_password_hash())
    return u_ok and p_ok


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "BarbeariaHTTP"
    sys_version = ""  # nao expor a versao do Python no header Server

    # ---- cabecalhos de seguranca ----
    def _send_security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        )

    # ---- utilitarios de resposta ----
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            return {}
        if length <= 0:
            return {}
        if length > MAX_BODY_BYTES:
            # Corpo grande demais: nao le para nao consumir memoria.
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def _bearer_token(self):
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip()
        return None

    def log_message(self, fmt, *args):
        # Nunca grave query strings nos logs: elas podem conter telefone ou
        # outros dados pessoais. Mantem apenas o caminho da rota.
        safe_args = tuple(
            urlparse(str(arg)).path if isinstance(arg, str) and arg.startswith("/") else arg
            for arg in args
        )
        print("[%s] %s" % (self.log_date_time_string(), fmt % safe_args))

    def _client_ip(self):
        """Usa o IP informado pelo proxy somente quando o peer e localhost.

        O Caddy configura X-Real-IP com o endereco remoto real. Ignoramos esse
        cabecalho em qualquer conexao que nao venha do proxy local.
        """
        peer = self.client_address[0] if self.client_address else "?"
        if peer in ("127.0.0.1", "::1"):
            forwarded = self.headers.get("X-Real-IP", "").strip()
            if forwarded and len(forwarded) <= 64 and "\n" not in forwarded:
                return forwarded
        return peer

    # ---- estaticos ----
    def _serve_static(self, path):
        if path in ("/", ""):
            rel = "index.html"
        elif path == "/admin" or path == "/admin/":
            rel = "admin.html"
        else:
            rel = path.lstrip("/")

        # Evita path traversal: o caminho resolvido tem que estar DENTRO de STATIC_DIR.
        # Usa commonpath (em vez de startswith) para nao aceitar pastas irmas
        # como ".../static.bak" que compartilham o prefixo do nome.
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        try:
            inside = os.path.commonpath([STATIC_DIR, full]) == STATIC_DIR
        except ValueError:
            inside = False
        if not inside:
            self._send_json({"error": "Caminho inválido"}, 403)
            return

        if not os.path.isfile(full):
            self._send_json({"error": "Não encontrado"}, 404)
            return

        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }.get(os.path.splitext(full)[1], "application/octet-stream")

        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # Sempre revalida: evita que o navegador renderize uma mistura de
        # HTML/JS/CSS antigos em cache (causava tela em branco no admin).
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(data)

    # ---- GET ----
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if not path.startswith("/api/"):
            self._serve_static(path)
            return

        if path == "/api/config":
            self._send_json({
                "business_name": CONFIG["business_name"],
                "whatsapp": CONFIG["whatsapp"],
                "currency": CONFIG.get("currency", "R$"),
                "services": CONFIG["services"],
                "direct_services": CONFIG["direct_services"],
                "booking_cutoff_minutes": CONFIG.get("booking_cutoff_minutes", 30),
            })
            return

        if path == "/api/days":
            self._send_json({"days": selectable_days()})
            return

        if path == "/api/availability":
            date_str = (qs.get("date") or [""])[0]
            self._availability(date_str)
            return

        if path == "/api/my-appointments":
            # Telefone sozinho nao comprova identidade. A consulta sera
            # reabilitada quando houver verificacao por SMS/WhatsApp.
            self._send_json({
                "error": "A consulta online está temporariamente indisponível. Fale com o barbeiro pelo WhatsApp."
            }, 410)
            return

        if path == "/api/admin/appointments":
            if not valid_session(self._bearer_token()):
                self._send_json({"error": "Não autorizado"}, 401)
                return
            date_str = (qs.get("date") or [""])[0]
            self._admin_appointments(date_str)
            return

        if path == "/api/admin/slots":
            if not valid_session(self._bearer_token()):
                self._send_json({"error": "Não autorizado"}, 401)
                return
            date_str = (qs.get("date") or [""])[0]
            self._admin_slots(date_str)
            return

        if path == "/api/admin/notes":
            if not valid_session(self._bearer_token()):
                self._send_json({"error": "Não autorizado"}, 401)
                return
            date_str = (qs.get("date") or [""])[0]
            self._admin_get_note(date_str)
            return

        self._send_json({"error": "Rota não encontrada"}, 404)

    # ---- POST ----
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        data = self._read_json()

        if path == "/api/appointments":
            self._create_appointment(data)
            return

        if path == "/api/admin/login":
            self._admin_login(data)
            return

        if path == "/api/admin/blocks":
            if not valid_session(self._bearer_token()):
                self._send_json({"error": "Não autorizado"}, 401)
                return
            self._admin_block(data)
            return

        if path == "/api/admin/notes":
            if not valid_session(self._bearer_token()):
                self._send_json({"error": "Não autorizado"}, 401)
                return
            self._admin_save_note(data)
            return

        self._send_json({"error": "Rota não encontrada"}, 404)

    # ---- DELETE ----
    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        m = re.match(r"^/api/appointments/(\d+)$", path)
        if m:
            # Impede cancelamento autenticado apenas com telefone e ID sequencial.
            self._send_json({
                "error": "O cancelamento online está temporariamente indisponível. Fale com o barbeiro pelo WhatsApp."
            }, 410)
            return

        m = re.match(r"^/api/admin/appointments/(\d+)$", path)
        if m:
            if not valid_session(self._bearer_token()):
                self._send_json({"error": "Não autorizado"}, 401)
                return
            self._admin_cancel(int(m.group(1)))
            return

        if path == "/api/admin/blocks":
            if not valid_session(self._bearer_token()):
                self._send_json({"error": "Não autorizado"}, 401)
                return
            data = self._read_json()
            self._admin_unblock(data)
            return

        self._send_json({"error": "Rota não encontrada"}, 404)

    # ------------------------------------------------------------------
    # Endpoints
    # ------------------------------------------------------------------
    def _availability(self, date_str):
        if not is_valid_booking_date(date_str):
            self._send_json({"error": "Data inválida ou fora do período permitido"}, 400)
            return
        conn = get_db()
        rows = conn.execute(
            "SELECT time FROM appointments WHERE date = ?", (date_str,)
        ).fetchall()
        booked = {r["time"] for r in rows}
        blocked = blocked_set(conn, date_str)
        conn.close()

        slots = []
        for t in all_slots():
            slots.append({
                "time": t,
                "booked": t in booked,
                "blocked": t in blocked,
                "past": slot_is_past(date_str, t),
                "too_soon": slot_within_cutoff(date_str, t),
            })
        self._send_json({"date": date_str, "slots": slots})

    def _create_appointment(self, data):
        name = sanitize_text(data.get("name"), MAX_NAME_LEN)
        phone = normalize_phone(data.get("phone"))
        service = (data.get("service") or "").strip()
        sobrancelha = bool(data.get("sobrancelha"))
        confirm_week = bool(data.get("confirm_week"))
        date_str = (data.get("date") or "").strip()
        time_str = (data.get("time") or "").strip()

        # Validacoes
        if not name or len(name) < 2:
            self._send_json({"error": "Informe um nome válido."}, 400)
            return
        if len(phone) < 10 or len(phone) > 11:
            self._send_json({"error": "Telefone inválido. Use DDD + número."}, 400)
            return
        svc_obj = get_service(service)
        if svc_obj is None:
            self._send_json({"error": "Serviço inválido."}, 400)
            return
        if service in CONFIG["direct_services"]:
            self._send_json({"error": "Este serviço deve ser combinado direto com o barbeiro."}, 400)
            return

        # Adicional opcional de sobrancelha (so para servicos que permitem).
        if sobrancelha:
            if not svc_obj.get("addon_sobrancelha"):
                self._send_json({"error": "Este serviço não permite adicionar sobrancelha."}, 400)
                return
            service = service + " + Sobrancelha"

        if not is_valid_booking_date(date_str):
            self._send_json({"error": "Data fora do período permitido (terça a sábado, até 30 dias)."}, 400)
            return
        if time_str not in all_slots():
            self._send_json({"error": "Horário inválido."}, 400)
            return
        if slot_is_past(date_str, time_str):
            self._send_json({"error": "Este horário já passou."}, 400)
            return
        if slot_within_cutoff(date_str, time_str):
            cutoff = CONFIG.get("booking_cutoff_minutes", 30)
            self._send_json({
                "error": "O tempo limite para marcar este horário pelo site foi "
                         "atingido (menos de %d minutos de antecedência). "
                         "Combine direto com o barbeiro pelo WhatsApp." % cutoff,
                "code": "cutoff",
            }, 403)
            return

        week_limit = CONFIG.get("week_booking_limit", 1)

        # Insercao com trava: a constraint UNIQUE(date,time) garante que
        # dois clientes nao reservem o mesmo horario, mesmo simultaneamente.
        with _db_lock:
            conn = get_db()

            # Horario bloqueado pelo admin: indisponivel para qualquer cliente.
            if time_str in blocked_set(conn, date_str):
                conn.close()
                self._send_json({
                    "error": "Este horário não está disponível. Escolha outro.",
                    "code": "blocked",
                }, 409)
                return

            # Regra: o cliente ja tem marcacao na semana. Em vez de bloquear,
            # avisamos (code "week_limit") para o site pedir confirmacao. Se ele
            # confirmar (confirm_week=true), a marcacao prossegue normalmente.
            if (week_limit and not confirm_week
                    and client_week_count(conn, phone, date_str) >= week_limit):
                conn.close()
                self._send_json({
                    "error": "Você já tem um horário marcado nesta semana.",
                    "code": "week_limit",
                }, 409)
                return

            try:
                cur = conn.execute(
                    """INSERT INTO appointments (phone, service, date, time, created_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (phone, service, date_str, time_str, datetime.now().isoformat(timespec="seconds")),
                )
                appt_id = cur.lastrowid
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json({"error": "Ops! Este horário acabou de ser ocupado. Escolha outro."}, 409)
                return
            # Registra/atualiza o cliente (telefone = identidade; nome = rotulo).
            upsert_client(conn, phone, name)
            conn.commit()
            conn.close()

        notify_booking(name, phone, service, date_str, time_str)
        self._send_json({
            "ok": True,
            "appointment": {
                "id": appt_id, "name": name, "phone": phone,
                "service": service, "date": date_str, "time": time_str,
            },
        }, 201)

    def _my_appointments(self, phone):
        # A busca usa SOMENTE o telefone (identidade do cliente). O nome digitado
        # nao influencia: quem entrou como "João" acha o mesmo que "João Silva".
        if len(phone) < 10:
            self._send_json({"appointments": []})
            return
        conn = get_db()
        rows = conn.execute(
            """SELECT a.id, a.phone, a.service, a.date, a.time,
                      COALESCE(c.name, '') AS name
               FROM appointments a
               LEFT JOIN clients c ON c.phone = a.phone
               WHERE a.phone = ?
               ORDER BY a.date, a.time""",
            (phone,),
        ).fetchall()
        conn.close()

        today = date.today().isoformat()
        out = []
        weeks = set()
        for r in rows:
            # Semanas ja ocupadas (considera de hoje em diante) para bloqueio no site
            if r["date"] >= today:
                weeks.add(week_bounds(r["date"])[0])
            # Mostra apenas futuros/atuais
            if r["date"] < today:
                continue
            h = hours_until(r["date"], r["time"])
            out.append({
                "id": r["id"], "name": r["name"], "phone": r["phone"],
                "service": r["service"], "date": r["date"], "time": r["time"],
                "can_cancel": h >= CONFIG["cancel_min_hours"],
                "hours_until": round(h, 2),
            })
        self._send_json({
            "appointments": out,
            "booked_weeks": sorted(weeks),
            "week_limit": CONFIG.get("week_booking_limit", 1),
        })

    def _client_cancel(self, appt_id, data):
        phone = normalize_phone(data.get("phone"))
        conn = get_db()
        row = conn.execute("SELECT * FROM appointments WHERE id = ?", (appt_id,)).fetchone()
        if not row:
            conn.close()
            self._send_json({"error": "Marcação não encontrada."}, 404)
            return
        # Dono = telefone. O nome nao e mais usado para conferir a posse.
        if row["phone"] != phone:
            conn.close()
            self._send_json({"error": "Esta marcação não pertence a este cliente."}, 403)
            return
        # Regra das 2 horas
        if hours_until(row["date"], row["time"]) < CONFIG["cancel_min_hours"]:
            conn.close()
            self._send_json({
                "error": "Para desmarcar com menos de %d horas de antecedência, "
                         "entre em contato diretamente com o barbeiro." % CONFIG["cancel_min_hours"],
                "code": "too_late",
            }, 403)
            return
        cname_row = conn.execute(
            "SELECT name FROM clients WHERE phone = ?", (row["phone"],)
        ).fetchone()
        cname = cname_row["name"] if cname_row else ""
        conn.execute("DELETE FROM appointments WHERE id = ?", (appt_id,))
        conn.commit()
        conn.close()
        notify_cancel(cname, row["phone"], row["service"], row["date"], row["time"], by_admin=False)
        self._send_json({"ok": True})

    def _admin_login(self, data):
        ip = self._client_ip()
        if login_rate_limited(ip):
            self._send_json({
                "error": "Muitas tentativas de login. Tente novamente em alguns minutos.",
            }, 429)
            return
        if check_admin_credentials(data.get("username"), data.get("password")):
            prune_sessions()
            self._send_json({"ok": True, "token": create_session()})
        else:
            record_login_failure(ip)
            self._send_json({"error": "Usuário ou senha incorretos."}, 401)

    def _admin_appointments(self, date_str):
        # O nome exibido vem da tabela clients (rotulo atual do telefone).
        base = (
            "SELECT a.id, COALESCE(c.name, '') AS name, a.phone, a.service, "
            "       a.date, a.time, a.created_at "
            "FROM appointments a LEFT JOIN clients c ON c.phone = a.phone "
        )
        conn = get_db()
        if date_str:
            try:
                date.fromisoformat(date_str)
            except ValueError:
                conn.close()
                self._send_json({"error": "Data inválida."}, 400)
                return
            rows = conn.execute(
                base + "WHERE a.date = ? ORDER BY a.time", (date_str,)
            ).fetchall()
        else:
            rows = conn.execute(base + "ORDER BY a.date, a.time").fetchall()
        conn.close()
        out = [dict(r) for r in rows]
        self._send_json({"appointments": out, "today": date.today().isoformat()})

    def _admin_slots(self, date_str):
        """Lista todos os horarios de um dia com seu estado (marcado/bloqueado/livre)."""
        try:
            date.fromisoformat(date_str)
        except (ValueError, TypeError):
            self._send_json({"error": "Data inválida."}, 400)
            return
        conn = get_db()
        rows = conn.execute(
            "SELECT a.id, COALESCE(c.name, '') AS name, a.phone, a.service, a.time "
            "FROM appointments a LEFT JOIN clients c ON c.phone = a.phone "
            "WHERE a.date = ?",
            (date_str,),
        ).fetchall()
        blocked = blocked_set(conn, date_str)
        conn.close()
        by_time = {r["time"]: r for r in rows}

        slots = []
        for t in all_slots():
            appt = by_time.get(t)
            slots.append({
                "time": t,
                "blocked": t in blocked,
                "past": slot_is_past(date_str, t),
                "appointment": ({
                    "id": appt["id"],
                    "name": appt["name"],
                    "phone": appt["phone"],
                    "service": appt["service"],
                } if appt else None),
            })
        self._send_json({"date": date_str, "slots": slots})

    def _admin_block(self, data):
        """Bloqueia um horario (date, time) para que nenhum cliente possa marcar."""
        date_str = (data.get("date") or "").strip()
        time_str = (data.get("time") or "").strip()
        try:
            date.fromisoformat(date_str)
        except (ValueError, TypeError):
            self._send_json({"error": "Data inválida."}, 400)
            return
        if time_str not in all_slots():
            self._send_json({"error": "Horário inválido."}, 400)
            return
        with _db_lock:
            conn = get_db()
            # Nao deixa bloquear um horario que ja tem cliente marcado.
            taken = conn.execute(
                "SELECT 1 FROM appointments WHERE date = ? AND time = ?",
                (date_str, time_str),
            ).fetchone()
            if taken:
                conn.close()
                self._send_json({
                    "error": "Este horário já tem um cliente marcado. "
                             "Desmarque o cliente antes de bloquear.",
                }, 409)
                return
            try:
                conn.execute(
                    "INSERT INTO blocked_slots (date, time, created_at) VALUES (?, ?, ?)",
                    (date_str, time_str, datetime.now().isoformat(timespec="seconds")),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                pass  # ja estava bloqueado
            conn.close()
        self._send_json({"ok": True})

    def _admin_unblock(self, data):
        """Remove o bloqueio de um horario (date, time)."""
        date_str = (data.get("date") or "").strip()
        time_str = (data.get("time") or "").strip()
        conn = get_db()
        conn.execute(
            "DELETE FROM blocked_slots WHERE date = ? AND time = ?",
            (date_str, time_str),
        )
        conn.commit()
        conn.close()
        self._send_json({"ok": True})

    def _admin_get_note(self, date_str):
        """Retorna a observacao salva para um dia (string vazia se nao houver)."""
        try:
            date.fromisoformat(date_str)
        except (ValueError, TypeError):
            self._send_json({"error": "Data inválida."}, 400)
            return
        conn = get_db()
        row = conn.execute(
            "SELECT note FROM day_notes WHERE date = ?", (date_str,)
        ).fetchone()
        conn.close()
        self._send_json({"date": date_str, "note": row["note"] if row else ""})

    def _admin_save_note(self, data):
        """Salva (ou apaga, se vazio) a observacao de um dia."""
        date_str = (data.get("date") or "").strip()
        try:
            date.fromisoformat(date_str)
        except (ValueError, TypeError):
            self._send_json({"error": "Data inválida."}, 400)
            return
        # Preserva quebras de linha; remove apenas o byte nulo e limita o tamanho.
        note = (data.get("note") or "").replace("\x00", "")[:MAX_NOTE_LEN]
        conn = get_db()
        if note.strip():
            conn.execute(
                "INSERT OR REPLACE INTO day_notes (date, note, updated_at) VALUES (?, ?, ?)",
                (date_str, note, datetime.now().isoformat(timespec="seconds")),
            )
        else:
            conn.execute("DELETE FROM day_notes WHERE date = ?", (date_str,))
        conn.commit()
        conn.close()
        self._send_json({"ok": True})

    def _admin_cancel(self, appt_id):
        conn = get_db()
        row = conn.execute(
            "SELECT a.phone, a.service, a.date, a.time, COALESCE(c.name, '') AS name "
            "FROM appointments a LEFT JOIN clients c ON c.phone = a.phone "
            "WHERE a.id = ?",
            (appt_id,),
        ).fetchone()
        if not row:
            conn.close()
            self._send_json({"error": "Marcação não encontrada."}, 404)
            return
        conn.execute("DELETE FROM appointments WHERE id = ?", (appt_id,))
        conn.commit()
        conn.close()
        notify_cancel(row["name"], row["phone"], row["service"], row["date"], row["time"], by_admin=True)
        self._send_json({"ok": True})


def _warn_insecure_defaults():
    """Avisa o operador sobre configuracoes inseguras conhecidas."""
    using_plaintext = not (os.environ.get("BARBER_ADMIN_PASSWORD")
                           or CONFIG["admin"].get("password_sha256"))
    if using_plaintext and CONFIG["admin"].get("password") == "admin123":
        print("!" * 52)
        print(" AVISO: a senha de admin ainda e a padrao (admin123).")
        print(" Defina BARBER_ADMIN_PASSWORD ou 'password_sha256' no config.")
        print("!" * 52)


def main():
    init_db()
    # Plataformas como Railway definem a porta pela variavel de ambiente PORT
    # e exigem escutar em 0.0.0.0 (nao apenas localhost). Se PORT existir,
    # assumimos que estamos nesse tipo de ambiente.
    if os.environ.get("PORT"):
        port = int(os.environ["PORT"])
        host = "0.0.0.0"
    else:
        port = CONFIG.get("port", 8000)
        # Por padrao escuta apenas no localhost. Para expor na rede, defina
        # "host": "0.0.0.0" no config.json (ciente de que isso expoe o painel).
        host = CONFIG.get("host", "127.0.0.1")
    _warn_insecure_defaults()
    server = ThreadingHTTPServer((host, port), Handler)
    print("=" * 52)
    print(" %s - servidor iniciado" % CONFIG["business_name"])
    print(" Cliente:  http://localhost:%d" % port)
    print(" Admin:    http://localhost:%d/admin" % port)
    print(" Escutando em %s:%d" % (host, port))
    print(" (Ctrl+C para parar)")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando...")
        server.shutdown()


if __name__ == "__main__":
    main()
