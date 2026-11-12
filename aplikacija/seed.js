'use strict';
/*
 * Testni podatki: 1 administrator, 10 predmetov, 20 učiteljev, 100 učencev, nekaj gradiv in oddaj.
 * Aplikacija jih vnese sama ob prvem zagonu, ko je tabela uporabnik prazna.
 * Ročni zagon (samo na prazni bazi): docker compose exec aplikacija node seed.js
 *
 * Gesla: administrator ima ADMIN_GESLO, vsi testni učitelji in učenci TESTNO_GESLO (iz .env).
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const P = require('./pravila');

const E = P.email;

const PREDMETI = [
  ['Slovenščina', 'Jezik in književnost'],
  ['Matematika', 'Algebra, geometrija, analiza'],
  ['Angleščina', 'Prvi tuji jezik'],
  ['Nemščina', 'Drugi tuji jezik'],
  ['Fizika', 'Mehanika, elektrika, valovanje'],
  ['Zgodovina', 'Od antike do sodobnosti'],
  ['Programiranje', 'C#, algoritmi, podatkovne strukture'],
  ['Podatkovne baze', 'Modeliranje, SQL, normalizacija'],
  ['Računalniška omrežja', 'TCP/IP, usmerjanje, varnost'],
  ['Spletne tehnologije', 'HTML, CSS, JavaScript']
];

const UCITELJI = [
  ['Ana', 'Horvat'], ['Luka', 'Kovač'], ['Maja', 'Krajnc'], ['Jan', 'Zupan'], ['Mojca', 'Potočnik'],
  ['Tomaž', 'Kos'], ['Nina', 'Golob'], ['Marko', 'Vidmar'], ['Petra', 'Kolar'], ['Andrej', 'Mlakar'],
  ['Barbara', 'Turk'], ['Gregor', 'Bizjak'], ['Simona', 'Kralj'], ['Matej', 'Hribar'], ['Tanja', 'Rozman'],
  ['Boštjan', 'Kovačič'], ['Urška', 'Petek'], ['Rok', 'Žagar'], ['Katja', 'Medved'], ['Blaž', 'Kotnik']
];
// Glavni predmet vsakega učitelja (vsak predmet ima vsaj 2 učitelja) ...
const GLAVNI = [1, 0, 2, 6, 3, 5, 7, 8, 9, 4, 0, 1, 2, 6, 7, 9, 3, 8, 5, 4];
// ... nekateri učitelji poučujejo še drug predmet (relacija M:N v obe smeri).
const DODATNI = { 0: 4, 1: 5, 3: 9, 6: 9, 13: 8 };

const IMENA = ['Ana', 'Luka', 'Maja', 'Jan', 'Eva', 'Nik', 'Zala', 'Žiga', 'Lara', 'Tim', 'Sara', 'Jakob',
  'Neža', 'Filip', 'Ema', 'Miha', 'Tjaša', 'Gal', 'Klara', 'Vid', 'Lana', 'Aljaž', 'Pia', 'Tilen', 'Hana',
  'Enej', 'Julija', 'Matic', 'Taja', 'Lovro'];
const PRIIMKI = ['Novak', 'Kranjc', 'Zupančič', 'Vidic', 'Kavčič', 'Ribič', 'Jereb', 'Pavlič', 'Logar',
  'Sever', 'Hočevar', 'Erjavec', 'Breznik', 'Kokalj', 'Lesjak', 'Knez', 'Dolenc', 'Rupnik', 'Pirc', 'Ferk',
  'Jelen', 'Lah', 'Ocvirk', 'Šket', 'Jug'];

const GRADIVA = [
  [0, 'Navodila za esej'], [1, 'Vaje 1 – enačbe'], [1, 'Formule'], [2, 'Seznam besedišča'],
  [4, 'Navodila za laboratorijsko vajo'], [6, 'Navodila za projekt'], [7, 'Primeri SQL'], [9, 'Flexbox in grid']
];
const NALOGE = [[1, 'Domača naloga 1', 5], [6, 'Projekt', 4], [9, 'Osebna spletna stran', 3]];

function nakljucno(seme) { // mulberry32: vedno isti »naključni« podatki
  return function () {
    seme |= 0; seme = (seme + 0x6D2B79F5) | 0;
    let t = Math.imul(seme ^ (seme >>> 15), 1 | seme);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ucenci() {
  const rnd = nakljucno(20260901);
  const seznam = [{ ime: 'Ana', priimek: 'Novak', predmeti: [1, 2, 6] }]; // demo učenka
  const zasedeni = new Set(['Ana Novak']);
  while (seznam.length < 100) {
    const ime = IMENA[Math.floor(rnd() * IMENA.length)];
    const priimek = PRIIMKI[Math.floor(rnd() * PRIIMKI.length)];
    if (zasedeni.has(ime + ' ' + priimek)) continue;
    const izbor = [];
    while (izbor.length < 3) {
      const p = Math.floor(rnd() * PREDMETI.length);
      if (izbor.indexOf(p) < 0) izbor.push(p);
    }
    zasedeni.add(ime + ' ' + priimek);
    seznam.push({ ime, priimek, predmeti: izbor });
  }
  return seznam;
}

/**
 * Vnese testne podatke, če je baza prazna. Vrne true, če je podatke vnesla.
 * mape = { gradiva, oddaje } – mapi za datoteke na disku.
 */
async function napolniCeJePrazno(pool, mape) {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM uporabnik');
  if (Number(n) > 0) return false;

  const adminGeslo = process.env.ADMIN_GESLO || '';
  const testnoGeslo = process.env.TESTNO_GESLO || '';
  if (adminGeslo.length < 8) throw new Error('ADMIN_GESLO v .env mora imeti vsaj 8 znakov.');
  if (testnoGeslo.length < 8) throw new Error('TESTNO_GESLO v .env mora imeti vsaj 8 znakov.');

  console.log('Baza je prazna, vnašam testne podatke ...');
  const hashAdmin = await bcrypt.hash(adminGeslo, 10);
  const hashTest = await bcrypt.hash(testnoGeslo, 10); // isto geslo za vse testne račune = ena zgostitev

  const povezava = await pool.getConnection();
  const zapisane = [];
  const zapisi = async (pot, vsebina) => {
    await fs.mkdir(path.dirname(pot), { recursive: true });
    await fs.writeFile(pot, vsebina, 'utf8');
    zapisane.push(pot);
  };

  try {
    await povezava.beginTransaction();
    const q = (sql, param) => povezava.query(sql, param).then((r) => r[0]);

    const predmetId = [];
    for (const [naziv, opis] of PREDMETI) {
      predmetId.push((await q('INSERT INTO predmet (naziv, opis) VALUES (?, ?)', [naziv, opis])).insertId);
    }

    await q('INSERT INTO uporabnik (ime, priimek, email, geslo_hash, vloga) VALUES (?, ?, ?, ?, ?)',
      ['Administrator', 'Sistema', 'admin@' + E.DOMENA_ZAPOSLENI, hashAdmin, 'admin']);

    const prviUcitelj = {};
    for (let i = 0; i < UCITELJI.length; i++) {
      const [ime, priimek] = UCITELJI[i];
      const id = (await q('INSERT INTO uporabnik (ime, priimek, email, geslo_hash, vloga) VALUES (?, ?, ?, ?, ?)',
        [ime, priimek, E.predlagaj(ime, priimek, 'ucitelj'), hashTest, 'ucitelj'])).insertId;
      const predmeti = [GLAVNI[i]].concat(DODATNI[i] != null ? [DODATNI[i]] : []);
      for (const p of predmeti) {
        await q('INSERT INTO ucitelj_predmet (uporabnik_id, predmet_id) VALUES (?, ?)', [id, predmetId[p]]);
        if (prviUcitelj[p] == null) prviUcitelj[p] = id;
      }
    }

    const vpisani = {};
    const emaili = new Set();
    for (const u of ucenci()) {
      let lokalni = E.lokalniIzImena(u.ime, u.priimek);
      for (let k = 2; emaili.has(lokalni); k++) lokalni = E.lokalniIzImena(u.ime, u.priimek) + k;
      emaili.add(lokalni);
      const id = (await q('INSERT INTO uporabnik (ime, priimek, email, geslo_hash, vloga) VALUES (?, ?, ?, ?, ?)',
        [u.ime, u.priimek, lokalni + '@' + E.DOMENA_DIJAK, hashTest, 'ucenec'])).insertId;
      for (const p of u.predmeti) {
        await q('INSERT INTO vpis (uporabnik_id, predmet_id) VALUES (?, ?)', [id, predmetId[p]]);
        (vpisani[p] = vpisani[p] || []).push({ id, ime: u.ime, priimek: u.priimek });
      }
    }

    for (let i = 0; i < GRADIVA.length; i++) {
      const [p, naslov] = GRADIVA[i];
      const ime = crypto.randomUUID() + '.txt';
      await zapisi(path.join(mape.gradiva, ime), `${PREDMETI[p][0]}: ${naslov}\n\nTestno gradivo, ustvarjeno ob prvem zagonu.\n`);
      await q('INSERT INTO gradivo (predmet_id, nalozil_id, naslov, pot_datoteke, datum_nalozitve) VALUES (?, ?, ?, ?, ?)',
        [predmetId[p], prviUcitelj[p], naslov, ime, new Date(Date.UTC(2026, 8, 8 + i * 3, 8, 15))]);
    }

    for (let i = 0; i < NALOGE.length; i++) {
      const [p, naslov, koliko] = NALOGE[i];
      const izbrani = (vpisani[p] || []).slice(0, koliko);
      for (let k = 0; k < izbrani.length; k++) {
        const u = izbrani[k];
        const ime = P.imeOddaje(u.priimek, u.ime, naslov, 'txt');
        await zapisi(path.join(mape.oddaje, String(predmetId[p]), String(u.id), ime), `${naslov}\n\nTestna oddaja: ${u.ime} ${u.priimek}\n`);
        await q('INSERT INTO oddaja (ucenec_id, predmet_id, naslov_naloge, pot_datoteke, datum_oddaje) VALUES (?, ?, ?, ?, ?)',
          [u.id, predmetId[p], naslov, ime, new Date(Date.UTC(2026, 9, 10 + i * 2, 12 + k, (k * 17) % 60))]);
      }
    }

    await povezava.commit();
  } catch (e) {
    await povezava.rollback();
    for (const pot of zapisane) await fs.rm(pot, { force: true });
    throw e;
  } finally {
    povezava.release();
  }
  console.log('Vneseno: 10 predmetov, 20 učiteljev, 100 učencev, 8 gradiv in nekaj oddaj.');
  return true;
}

module.exports = { napolniCeJePrazno };

// Ročni zagon: node seed.js
if (require.main === module) {
  const { pool, cakajNaBazo } = require('./baza');
  const koren = path.resolve(process.env.DATOTEKE || path.join(__dirname, 'datoteke'));
  cakajNaBazo()
    .then(() => napolniCeJePrazno(pool, { gradiva: path.join(koren, 'gradiva'), oddaje: path.join(koren, 'oddaje') }))
    .then((vneseno) => console.log(vneseno ? 'Končano.' : 'Baza že vsebuje uporabnike, nič nisem spremenil.'))
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
