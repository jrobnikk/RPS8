#!/usr/bin/env bash
# Varnostna kopija baze in naloženih datotek v mapo backup/. Kopije, starejše od 14 dni, se izbrišejo.
# Uporaba:  ./skripte/backup.sh
# Dnevno ob 2.30 (crontab -e):
#   30 2 * * * cd /pot/do/RPS8 && ./skripte/backup.sh >> backup/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a
BAZA="${MARIADB_DATABASE:-sola_is}"
CAS="$(date +%F_%H%M)"
mkdir -p backup

docker compose exec -T -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" baza \
  mariadb-dump -u root --single-transaction --routines --default-character-set=utf8mb4 "$BAZA" \
  | gzip > "backup/${BAZA}_${CAS}.sql.gz"

docker compose exec -T aplikacija tar czf - -C /data/datoteke . > "backup/datoteke_${CAS}.tar.gz"

find backup -name '*.gz' -mtime +14 -delete
echo "$(date '+%F %T') Varnostna kopija: backup/${BAZA}_${CAS}.sql.gz in backup/datoteke_${CAS}.tar.gz"

# OBNOVA (najprej ustavite aplikacijo: docker compose stop aplikacija)
#   gunzip -c backup/sola_is_DATUM.sql.gz | docker compose exec -T -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" baza mariadb -u root sola_is
#   docker compose run --rm --no-deps -T aplikacija tar xzf - -C /data/datoteke < backup/datoteke_DATUM.tar.gz
#   docker compose start aplikacija
