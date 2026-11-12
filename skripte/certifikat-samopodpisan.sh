#!/usr/bin/env bash
# Začasno samopodpisano potrdilo, da Nginx sploh zažene (brskalnik bo prikazal opozorilo).
# Uporaba:  ./skripte/certifikat-samopodpisan.sh            (za localhost)
#           ./skripte/certifikat-samopodpisan.sh domena.si  (za izbrano ime)
#           ./skripte/certifikat-samopodpisan.sh --prepisi  (zamenja obstoječe potrdilo)
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash na Windows sicer pokvari »/CN=...«
cd "$(dirname "$0")/.."

PREPISI=0
IME=localhost
for arg in "$@"; do
  if [ "$arg" = "--prepisi" ]; then PREPISI=1; else IME="$arg"; fi
done

mkdir -p nginx/certs nginx/certbot-www
if [ -f nginx/certs/fullchain.pem ] && [ "$PREPISI" -eq 0 ]; then
  echo "Potrdilo že obstaja (nginx/certs). Za novo dodajte --prepisi."
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
  -subj "/CN=${IME}" -addext "subjectAltName=DNS:${IME}"
chmod 600 nginx/certs/privkey.pem
echo "Samopodpisano potrdilo za ${IME} je v nginx/certs (velja 30 dni)."
