#!/usr/bin/env bash
#
# Backup diário do banco do Ziah Cortes (dados dos clientes).
#
# Usa o backup NATIVO do SQLite (via Python da biblioteca padrão), que copia o
# banco de forma consistente mesmo com o site rodando — diferente de um "cp"
# simples, que pode perder dados que estão no arquivo WAL.
#
# Uso manual:   sudo bash /opt/ziah/deploy/backup_db.sh
# Automático:   agendado pelo cron (veja deploy/ziah-backup.cron e o DEPLOY.md).
#
set -euo pipefail

DB="${ZIAH_DB:-/opt/ziah/appointments.db}"      # banco de origem
DEST_DIR="${ZIAH_BACKUP_DIR:-/var/backups/ziah}" # onde guardar os backups
KEEP="${ZIAH_BACKUP_KEEP:-14}"                    # quantos backups manter

if [[ ! -f "$DB" ]]; then
  echo "$(date '+%F %T') ERRO: banco não encontrado em $DB" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
STAMP="$(date +%F_%H%M)"
OUT="$DEST_DIR/appointments-$STAMP.db"

# Cópia consistente do SQLite (lida corretamente com o WAL).
python3 - "$DB" "$OUT" <<'PY'
import sqlite3, sys
src, dest = sys.argv[1], sys.argv[2]
s = sqlite3.connect(src)
d = sqlite3.connect(dest)
with d:
    s.backup(d)
d.close(); s.close()
PY

gzip -f "$OUT"

# Rotação: mantém apenas os $KEEP backups mais recentes.
ls -1t "$DEST_DIR"/appointments-*.db.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date '+%F %T') backup ok: $OUT.gz (mantendo os últimos $KEEP)"
