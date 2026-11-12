#!/usr/bin/env bash
# Pravo potrdilo Let's Encrypt za javno domeno (vsebniki morajo že teči, vrata 80 dostopna z interneta).
# Uporaba:  ./skripte/certifikat-letsencrypt.sh domena.si ime@posta.si
# Obnova:   isti ukaz enkrat na mesec, npr. v cron:
#   0 4 1 * * cd /pot/do/RPS8 && ./skripte/certifikat-letsencrypt.sh domena.si ime@posta.si >> backup/certbot.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

DOMENA="${1:?Uporaba: $0 domena.si ime@posta.si}"
EMAIL="${2:?Uporaba: $0 domena.si ime@posta.si}"
mkdir -p nginx/letsencrypt nginx/certbot-www nginx/certs

# Certbot preveri domeno prek http://DOMENA/.well-known/acme-challenge/ (Nginx streže nginx/certbot-www).
docker run --rm \
  -v "$PWD/nginx/certbot-www:/var/www/certbot" \
  -v "$PWD/nginx/letsencrypt:/etc/letsencrypt" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMENA" --email "$EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring

# Kopiranje v vsebniku: datoteke certbota so last uporabnika root, zato tako ne potrebujemo sudo.
docker run --rm \
  -v "$PWD/nginx/letsencrypt:/etc/letsencrypt:ro" \
  -v "$PWD/nginx/certs:/certs" \
  --entrypoint sh certbot/certbot -c \
  "cp -L /etc/letsencrypt/live/$DOMENA/fullchain.pem /certs/fullchain.pem && cp -L /etc/letsencrypt/live/$DOMENA/privkey.pem /certs/privkey.pem && chmod 600 /certs/privkey.pem"

docker compose exec nginx nginx -s reload
echo "Potrdilo za $DOMENA je nameščeno. Preverite: https://$DOMENA"
