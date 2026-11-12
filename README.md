# Šolski IS – podpora šolskemu delu na daljavo

Projekt pri predmetu RPS – Računalniški produkti in storitve.

## Skupina
| Član | Vloga |
|------|-------|
| Jernej Robnik | Vzdrževalec IS |
| Vid Strmčnik | Razvijalec |
| Lan Plazar | Razvijalec |

Mentor: Andraž Pušnik

## Kaj je v repozitoriju
Repozitorij ima dva dela, ki si delita oblikovanje (`css/style.css`) in pravila za e-pošto (`js/email.js`):

| Del | Kje | Za kaj |
|-----|-----|--------|
| **Aplikacija** (Node.js 24, Express 5, EJS, MariaDB 11.8, Nginx, Docker) | `aplikacija/`, `baza/`, `nginx/`, `skripte/`, `docker-compose.yml` | prava aplikacija na strežniku |
| **Prototip** (HTML, CSS, JavaScript, podatki v brskalniku) | `index.html`, `js/app.js`, `js/podatki.js` | hiter predogled na GitHub Pages |

## Zagon aplikacije (Docker)
Potrebujete Docker z ukazom `docker compose`.

```bash
cp .env.example .env                      # nato v .env vpišite močna gesla
./skripte/certifikat-samopodpisan.sh      # začasno potrdilo za HTTPS
docker compose up -d --build              # baza, aplikacija, nginx
docker compose logs -f aplikacija         # počakajte na »Šolski IS posluša na vratih 3000«
```

Aplikacija je na `https://localhost` (brskalnik opozori na samopodpisano potrdilo). Ob prvem zagonu se ustvari shema baze (`baza/01_shema.sql`), aplikacija pa vnese testne podatke: 10 predmetov, 20 učiteljev, 100 učencev.

| Račun | E-pošta | Geslo |
|-------|---------|-------|
| Administrator | admin@sc-celje.si | `ADMIN_GESLO` iz `.env` |
| Učitelj (primer) | ana.horvat@sc-celje.si | `TESTNO_GESLO` iz `.env` |
| Učenec (primer) | ana.novak@dijak.sc-celje.si | `TESTNO_GESLO` iz `.env` |

Javna domena in pravo potrdilo: `./skripte/certifikat-letsencrypt.sh domena.si ime@posta.si`. Varnostna kopija: `./skripte/backup.sh`. Podrobnosti so v `docs/dokumentacija-word/04_Tehnicna_dokumentacija.docx`.

Testi pravil preverjanja (brez baze): `cd aplikacija && npm test`.

## Šolski e-poštni naslovi
| Vloga | Domena |
|-------|--------|
| Učenec (dijak) | `@dijak.sc-celje.si` |
| Učitelj, administrator | `@sc-celje.si` |

Domena se preverja na treh mestih: v brskalniku, na strežniku (`js/email.js`, isti modul) in v bazi (omejitev `CHECK` v `baza/01_shema.sql`). V obrazcih je domena vnaprej določena glede na vlogo; naslov se predlaga iz imena in priimka (Žiga Kovač → `ziga.kovac`).

## Varnost (povzetek)
- Gesla zgoščena z bcrypt; seja v podpisanem piškotku (`httpOnly`, `SameSite=Lax`, `Secure` prek HTTPS).
- Avtorizacija po vlogi in po predmetu pri vsaki poti; tuj predmet ali datoteka vrne 403.
- Žeton CSRF v vsakem obrazcu, omejitev poskusov prijave, poizvedbe z vezanimi parametri, ubežan izpis v EJS.
- Datoteke so v Docker volumnu izven javne mape; prenos samo prek `/datoteka/...` s preverjanjem pravic.
- Skrivnosti so v `.env`, ki ni v repozitoriju (`.gitignore`).

## Struktura
```
aplikacija/app.js          poti, avtorizacija, poslovna logika
aplikacija/pravila.js      preverjanje vnosov (uporablja js/email.js)
aplikacija/seed.js         testni podatki ob prvem zagonu
aplikacija/views/          predloge EJS (layout.ejs in pogledi po vlogah)
aplikacija/test/           testi pravil (npm test)
baza/01_shema.sql          shema baze (6 tabel)
nginx/nginx.conf           reverse proxy, HTTPS, varnostne glave
skripte/                   potrdila in varnostne kopije
css/style.css              skupno oblikovanje (aplikacija in prototip)
js/email.js                skupna pravila za šolske e-poštne naslove
index.html, js/app.js      prototip za GitHub Pages
docs/                      dokumentacija (Word) in skice
```

## Povezave
- Aplikacija (strežnik): *vpišite javni naslov, ko je strežnik postavljen*
- Prototip (GitHub Pages): https://www.rps-plazar-jernej.com (domena je v datoteki `CNAME`). Podatki prototipa so samo v brskalniku (localStorage); demo računi imajo geslo `geslo123`.

GitHub Pages streže samo statične datoteke, zato na tej domeni teče prototip, ne aplikacija z Express in MariaDB.
