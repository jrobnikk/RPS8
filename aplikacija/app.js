'use strict';
/*
 * Šolski IS – strežnik (Node.js, Express 5, EJS, MariaDB)
 * ------------------------------------------------------
 * Poti so enake kot v tehnični dokumentaciji, poglavje 8.
 * Varnost: bcrypt, avtorizacija po vlogi IN po predmetu pri vsaki poti, poizvedbe z vezanimi
 * parametri, EJS ubeži izpis, žeton CSRF v vsakem obrazcu, omejitev poskusov prijave,
 * datoteke izven javne mape (prenos samo prek /datoteka/... s preverjanjem pravic).
 */
const path = require('node:path');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { pool, cakajNaBazo, transakcija } = require('./baza');
const P = require('./pravila');
const { napolniCeJePrazno } = require('./seed');
const { VLOGE, DOMOV, datum, datumUra, polnoIme, inicialke, emailHtml, predmetiIzNiza, napakaZa } = require('./pomocniki');

const E = P.email;
const PORT = Number(process.env.PORT) || 3000;
const PRODUKCIJA = process.env.NODE_ENV === 'production';
const KOREN_DATOTEK = path.resolve(process.env.DATOTEKE || path.join(__dirname, 'datoteke'));
const MAPA = {
  gradiva: path.join(KOREN_DATOTEK, 'gradiva'),
  oddaje: path.join(KOREN_DATOTEK, 'oddaje'),
  zacasno: path.join(KOREN_DATOTEK, 'zacasno')
};
const BCRYPT_KROGI = 10;
const NA_STRAN = 20;

const SKRIVNOST = process.env.SEJA_SKRIVNOST || '';
if (SKRIVNOST.length < 32) {
  console.error('Napaka: SEJA_SKRIVNOST v .env mora imeti vsaj 32 znakov.');
  process.exit(1);
}
// Primerjava gesla poteka tudi za neobstoječe račune, da čas odgovora ne izda, ali račun obstaja.
const LAZNA_ZGOSTITEV = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_KROGI);

const app = express();
app.set('trust proxy', 1); // pred aplikacijo je Nginx (X-Forwarded-Proto, X-Forwarded-For)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

/* ===================================================================
   Pomožne funkcije
   =================================================================== */

const q = (sql, param) => pool.query(sql, param).then((r) => r[0]);
const ena = (sql, param) => q(sql, param).then((v) => v[0] || null);

function sporoci(req, besedilo, vrsta) {
  req.session.sporocila = (req.session.sporocila || []).concat([{ vrsta: vrsta || 'ok', besedilo }]);
}

function stranNapake(res, status, naslov, besedilo) {
  res.status(status);
  res.izris('napaka', { naslov, besedilo, status });
}

/** Absolutna pot znotraj mape; vrže napako, če bi ime vodilo izven nje. */
function varnaPot(mapa, ...deli) {
  const pot = path.resolve(mapa, ...deli.map(String));
  if (!pot.startsWith(mapa + path.sep)) throw new Error('Neveljavna pot datoteke.');
  return pot;
}
const mapaOddaj = (predmetId, ucenecId) => varnaPot(MAPA.oddaje, String(predmetId), String(ucenecId));
const odstrani = (pot) => (pot ? fsp.rm(pot, { force: true }).catch(() => {}) : Promise.resolve());

const poucuje = async (uid, pid) => !!pid && !!(await ena('SELECT 1 AS da FROM ucitelj_predmet WHERE uporabnik_id = ? AND predmet_id = ?', [uid, pid]));
const obiskuje = async (uid, pid) => !!pid && !!(await ena('SELECT 1 AS da FROM vpis WHERE uporabnik_id = ? AND predmet_id = ?', [uid, pid]));
const predmetiUcitelja = (uid) => q('SELECT p.id, p.naziv FROM predmet p JOIN ucitelj_predmet x ON x.predmet_id = p.id WHERE x.uporabnik_id = ? ORDER BY p.naziv', [uid]);
const predmetiUcenca = (uid) => q('SELECT p.id, p.naziv FROM predmet p JOIN vpis x ON x.predmet_id = p.id WHERE x.uporabnik_id = ? ORDER BY p.naziv', [uid]);

/* ---------- omejitev poskusov prijave (v pomnilniku) ---------- */

const omejitev = (() => {
  const OKNO = 15 * 60 * 1000;
  const NAJVEC_IP = 20;
  const NAJVEC_RACUN = 5;
  const poskusi = new Map();
  const sveze = (k) => (poskusi.get(k) || []).filter((t) => Date.now() - t < OKNO);
  setInterval(() => { for (const k of poskusi.keys()) if (!sveze(k).length) poskusi.delete(k); }, OKNO).unref();
  return {
    blokiran: (ip, email) => sveze('ip:' + ip).length >= NAJVEC_IP || (!!email && sveze('e:' + email).length >= NAJVEC_RACUN),
    neuspeh: (ip, email) => ['ip:' + ip, 'e:' + email].forEach((k) => poskusi.set(k, sveze(k).concat([Date.now()]))),
    uspeh: (email) => poskusi.delete('e:' + email)
  };
})();

/* ---------- nalaganje datotek (najprej v začasno mapo, nato premik po preverjanju) ---------- */

const naloziEno = multer({
  dest: MAPA.zacasno,
  limits: { fileSize: P.NAJVEC_BAJTOV, files: 1, fields: 20 }
}).single('datoteka');

/** Sprejme obrazec z datoteko. Vrne null ali sporočilo o napaki. */
function sprejmiDatoteko(req, res) {
  return new Promise((resolve) => {
    naloziEno(req, res, (err) => {
      if (!err) return resolve(null);
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return resolve('Datoteka je večja od 10 MB.');
      if (err instanceof multer.MulterError) return resolve('Obrazca ni bilo mogoče prebrati (' + err.code + ').');
      resolve('Nalaganje ni uspelo.');
    });
  });
}

/* ---------- žeton CSRF ---------- */

function veljavenCsrf(req) {
  const poslan = Buffer.from(String((req.body && req.body._csrf) || ''));
  const pravi = Buffer.from(String(req.session.csrf || ''));
  return pravi.length > 0 && poslan.length === pravi.length && crypto.timingSafeEqual(poslan, pravi);
}

/* ===================================================================
   Vmesna programska oprema (middleware)
   =================================================================== */

app.use(express.static(path.join(__dirname, 'public'), { maxAge: PRODUKCIJA ? '1h' : 0 }));
app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 300 }));
app.use(cookieSession({
  name: 'seja',
  keys: [SKRIVNOST],
  maxAge: 8 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax'
  // »secure« cookie-session nastavi sam, ko je zahteva prišla prek HTTPS (trust proxy)
}));

app.use(async (req, res, next) => {
  const seja = req.session;
  if (!seja.csrf) seja.csrf = crypto.randomBytes(24).toString('hex');

  req.uporabnik = null;
  if (seja.uid) {
    req.uporabnik = await ena('SELECT id, ime, priimek, email, vloga FROM uporabnik WHERE id = ?', [seja.uid]);
    if (!req.uporabnik) seja.uid = null;
  }

  const L = res.locals;
  L.uporabnik = req.uporabnik;
  L.csrf = seja.csrf;
  L.pot = req.path;
  L.VLOGE = VLOGE;
  L.DOMOV = DOMOV;
  L.E = E;
  L.P = P;
  L.datum = datum;
  L.datumUra = datumUra;
  L.polnoIme = polnoIme;
  L.inicialke = inicialke;
  L.emailHtml = emailHtml;
  L.napakaZa = napakaZa;
  L.stevci = null;
  if (req.uporabnik && req.uporabnik.vloga === 'admin') {
    L.stevci = await ena(`SELECT (SELECT COUNT(*) FROM predmet) AS predmeti,
      (SELECT COUNT(*) FROM uporabnik WHERE vloga = 'ucitelj') AS ucitelji,
      (SELECT COUNT(*) FROM uporabnik WHERE vloga = 'ucenec') AS ucenci`);
  }

  // Izris pogleda znotraj skupne postavitve (views/layout.ejs).
  res.izris = (pogled, podatki) => {
    const sporocila = seja.sporocila || [];
    seja.sporocila = undefined;
    res.render(pogled, podatki || {}, (err, vsebina) => {
      if (err) return next(err);
      res.render('layout', Object.assign({}, podatki, { vsebina, sporocila }));
    });
  };
  next();
});

// CSRF: vsak POST mora poslati žeton. Obrazci z datoteko ga preverijo po branju (multer).
app.use((req, res, next) => {
  if (req.method !== 'POST' || req.is('multipart/form-data')) return next();
  if (!veljavenCsrf(req)) return stranNapake(res, 403, 'Obrazec je potekel', 'Osvežite stran in poskusite znova.');
  next();
});

function zahtevaj(vloga) {
  return (req, res, next) => {
    if (!req.uporabnik) {
      if (req.method === 'GET') req.session.namen = req.originalUrl;
      sporoci(req, 'Za ogled te strani se prijavite.');
      return res.redirect('/prijava');
    }
    if (vloga && req.uporabnik.vloga !== vloga) {
      return stranNapake(res, 403, 'Nimate dostopa do te strani',
        'Stran je namenjena vlogi »' + VLOGE[vloga] + '«. Prijavljeni ste kot ' + polnoIme(req.uporabnik) + '.');
    }
    next();
  };
}

/* ===================================================================
   Prijava, registracija, odjava
   =================================================================== */

app.get('/', (req, res) => res.redirect(req.uporabnik ? DOMOV[req.uporabnik.vloga] : '/prijava'));

app.get('/prijava', (req, res) => {
  if (req.uporabnik) return res.redirect(DOMOV[req.uporabnik.vloga]);
  res.izris('prijava', { naslov: 'Prijava', email: E.normaliziraj(req.query.email), napaka: null });
});

app.post('/prijava', async (req, res) => {
  const email = E.normaliziraj(req.body.email);
  const geslo = String(req.body.geslo || '');
  const ponovi = (status, napaka) => { res.status(status); res.izris('prijava', { naslov: 'Prijava', email, napaka }); };

  if (omejitev.blokiran(req.ip, email)) {
    return ponovi(429, { napaka: 'Preveč neuspešnih poskusov. Poskusite znova čez 15 minut.', polje: 'geslo' });
  }
  if (!email) return ponovi(400, { napaka: 'Vpišite e-poštni naslov.', polje: 'email' });
  if (!E.vrstaRacuna(email)) {
    return ponovi(400, { napaka: 'Prijava je mogoča samo s šolskim naslovom (@' + E.DOMENA_DIJAK + ' ali @' + E.DOMENA_ZAPOSLENI + ').', polje: 'email' });
  }
  if (!geslo) return ponovi(400, { napaka: 'Vpišite geslo.', polje: 'geslo' });

  const u = await ena('SELECT id, ime, vloga, geslo_hash FROM uporabnik WHERE email = ?', [email]);
  const pravilno = await bcrypt.compare(geslo, u ? u.geslo_hash : LAZNA_ZGOSTITEV);
  if (!u || !pravilno) {
    omejitev.neuspeh(req.ip, email);
    return ponovi(401, { napaka: 'E-poštni naslov ali geslo ni pravilno.', polje: 'geslo' });
  }

  omejitev.uspeh(email);
  const namen = req.session.namen;
  req.session = { uid: u.id, csrf: crypto.randomBytes(24).toString('hex') }; // nova seja po prijavi
  sporoci(req, 'Pozdravljeni, ' + (u.vloga === 'admin' ? 'administrator' : u.ime) + '.');
  const cilj = typeof namen === 'string' && namen.startsWith('/' + u.vloga + '/') ? namen : DOMOV[u.vloga];
  res.redirect(cilj);
});

app.get('/registracija', (req, res) => {
  if (req.uporabnik) return res.redirect(DOMOV[req.uporabnik.vloga]);
  res.izris('registracija', { naslov: 'Registracija', vnos: {}, napaka: null });
});

app.post('/registracija', async (req, res) => {
  const vnos = {
    ime: req.body.ime, priimek: req.body.priimek, email: P.emailIzObrazca(req.body, 'ucenec'),
    geslo: req.body.geslo, geslo2: req.body.geslo2
  };
  const ponovi = (napaka) => {
    res.status(400);
    res.izris('registracija', { naslov: 'Registracija', vnos: { ime: vnos.ime, priimek: vnos.priimek, email: vnos.email }, napaka });
  };
  const r = P.preveriUporabnika(vnos, 'ucenec', { novo: true });
  if (!r.ok) return ponovi(r);
  try {
    await q('INSERT INTO uporabnik (ime, priimek, email, geslo_hash, vloga) VALUES (?, ?, ?, ?, ?)',
      [r.ime, r.priimek, r.email, await bcrypt.hash(r.geslo, BCRYPT_KROGI), 'ucenec']);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return ponovi({ napaka: 'E-poštni naslov je že zaseden.', polje: 'email' });
    throw e;
  }
  sporoci(req, 'Račun ' + r.email + ' je ustvarjen. Prijavite se z novim geslom.');
  res.redirect('/prijava?email=' + encodeURIComponent(r.email));
});

app.post('/odjava', (req, res) => {
  req.session = null;
  res.redirect('/prijava');
});

/* ===================================================================
   Administrator: predmeti
   =================================================================== */

app.use('/admin', zahtevaj('admin'));

async function prikaziPredmete(req, res, dodatno) {
  const iskanje = P.cisto(req.query.q).slice(0, 100);
  const vzorec = P.likeVzorec(iskanje);
  const predmeti = await q(`
    SELECT p.id, p.naziv, p.opis,
      (SELECT GROUP_CONCAT(CONCAT(u.ime, ' ', u.priimek) ORDER BY u.priimek, u.ime SEPARATOR ', ')
         FROM ucitelj_predmet x JOIN uporabnik u ON u.id = x.uporabnik_id WHERE x.predmet_id = p.id) AS ucitelji,
      (SELECT COUNT(*) FROM vpis v WHERE v.predmet_id = p.id) AS st_ucencev,
      (SELECT COUNT(*) FROM gradivo g WHERE g.predmet_id = p.id) AS st_gradiv,
      (SELECT COUNT(*) FROM oddaja o WHERE o.predmet_id = p.id) AS st_oddaj
    FROM predmet p
    WHERE ? = '' OR p.naziv LIKE ? OR p.opis LIKE ?
    ORDER BY p.naziv`, [iskanje, vzorec, vzorec]);
  res.izris('admin/predmeti', Object.assign({ naslov: 'Predmeti', predmeti, iskanje, vnos: {}, napaka: null }, dodatno));
}

app.get('/admin/predmeti', (req, res) => prikaziPredmete(req, res));

app.post('/admin/predmeti', async (req, res) => {
  const r = P.preveriPredmet(req.body);
  const napaka = async (n) => { res.status(400); await prikaziPredmete(req, res, { vnos: req.body, napaka: n }); };
  if (!r.ok) return napaka(r);
  try {
    await q('INSERT INTO predmet (naziv, opis) VALUES (?, ?)', [r.naziv, r.opis || null]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return napaka({ napaka: 'Predmet »' + r.naziv + '« že obstaja.', polje: 'naziv' });
    throw e;
  }
  sporoci(req, 'Predmet ' + r.naziv + ' je dodan. Učitelje mu dodelite na strani Dodelitve.');
  res.redirect('/admin/predmeti');
});

app.get('/admin/predmeti/:id/uredi', async (req, res) => {
  const p = await ena('SELECT id, naziv, opis FROM predmet WHERE id = ?', [P.cel(req.params.id)]);
  if (!p) return stranNapake(res, 404, 'Predmet ne obstaja', 'Morda ga je nekdo izbrisal.');
  res.izris('admin/predmet-uredi', { naslov: 'Uredi predmet', predmet: p, vnos: p, napaka: null });
});

app.post('/admin/predmeti/:id', async (req, res) => {
  const p = await ena('SELECT id, naziv, opis FROM predmet WHERE id = ?', [P.cel(req.params.id)]);
  if (!p) return stranNapake(res, 404, 'Predmet ne obstaja', 'Morda ga je nekdo izbrisal.');
  const r = P.preveriPredmet(req.body);
  const napaka = (n) => { res.status(400); res.izris('admin/predmet-uredi', { naslov: 'Uredi predmet', predmet: p, vnos: req.body, napaka: n }); };
  if (!r.ok) return napaka(r);
  try {
    await q('UPDATE predmet SET naziv = ?, opis = ? WHERE id = ?', [r.naziv, r.opis || null, p.id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return napaka({ napaka: 'Predmet »' + r.naziv + '« že obstaja.', polje: 'naziv' });
    throw e;
  }
  sporoci(req, 'Predmet ' + r.naziv + ' je posodobljen.');
  res.redirect('/admin/predmeti');
});

/** Stran za potrditev brisanja (deluje tudi brez JavaScripta). */
function potrdiBrisanje(res, o) {
  res.izris('potrdi', { naslov: o.naslov, opis: o.opis || [], opozorilo: o.opozorilo || '', akcija: o.akcija, gumb: o.gumb, nazaj: o.nazaj });
}

app.get('/admin/predmeti/:id/izbrisi', async (req, res) => {
  const p = await ena(`SELECT p.id, p.naziv,
      (SELECT COUNT(*) FROM ucitelj_predmet x WHERE x.predmet_id = p.id) AS ucitelji,
      (SELECT COUNT(*) FROM vpis v WHERE v.predmet_id = p.id) AS vpisi,
      (SELECT COUNT(*) FROM gradivo g WHERE g.predmet_id = p.id) AS gradiva,
      (SELECT COUNT(*) FROM oddaja o WHERE o.predmet_id = p.id) AS oddaje,
      (SELECT COUNT(*) FROM vpis v WHERE v.predmet_id = p.id
         AND (SELECT COUNT(*) FROM vpis v2 WHERE v2.uporabnik_id = v.uporabnik_id) <= 2) AS pod_dve
    FROM predmet p WHERE p.id = ?`, [P.cel(req.params.id)]);
  if (!p) return stranNapake(res, 404, 'Predmet ne obstaja', 'Morda ga je nekdo že izbrisal.');
  const n = (k) => Number(p[k]);
  const opis = [
    n('ucitelji') && P.st(n('ucitelji'), P.OBLIKE.dodelitev) + ' učiteljev',
    n('vpisi') && P.st(n('vpisi'), P.OBLIKE.vpis) + ' učencev',
    n('gradiva') && P.st(n('gradiva'), P.OBLIKE.gradivo) + ' z datotekami',
    n('oddaje') && P.st(n('oddaje'), P.OBLIKE.oddaja) + ' nalog z datotekami'
  ].filter(Boolean);
  potrdiBrisanje(res, {
    naslov: 'Izbrišem predmet ' + p.naziv + '?',
    opis: opis.length ? ['Skupaj s predmetom se izbriše tudi:'].concat(opis.map((x) => '• ' + x)) : ['Predmet nima dodelitev, gradiv ali oddaj.'],
    opozorilo: n('pod_dve') ? 'Po brisanju bo imelo ' + P.st(n('pod_dve'), P.OBLIKE.ucenec) + ' manj kot 2 predmeta.' : '',
    akcija: '/admin/predmeti/' + p.id + '/izbrisi', gumb: 'Izbriši predmet', nazaj: '/admin/predmeti'
  });
});

app.post('/admin/predmeti/:id/izbrisi', async (req, res) => {
  const p = await ena('SELECT id, naziv FROM predmet WHERE id = ?', [P.cel(req.params.id)]);
  if (!p) return stranNapake(res, 404, 'Predmet ne obstaja', 'Morda ga je nekdo že izbrisal.');
  const gradiva = await q('SELECT pot_datoteke FROM gradivo WHERE predmet_id = ?', [p.id]);
  const { pod_dve: podDve } = await ena(`SELECT COUNT(*) AS pod_dve FROM vpis v
    WHERE v.predmet_id = ? AND (SELECT COUNT(*) FROM vpis v2 WHERE v2.uporabnik_id = v.uporabnik_id) <= 2`, [p.id]);
  await q('DELETE FROM predmet WHERE id = ?', [p.id]); // CASCADE: dodelitve, vpisi, gradiva, oddaje
  await Promise.all(gradiva.map((g) => odstrani(varnaPot(MAPA.gradiva, g.pot_datoteke))));
  await fsp.rm(varnaPot(MAPA.oddaje, String(p.id)), { recursive: true, force: true });
  sporoci(req, 'Predmet ' + p.naziv + ' je izbrisan.');
  if (Number(podDve) > 0) {
    sporoci(req, 'Po brisanju ima ' + P.st(Number(podDve), P.OBLIKE.ucenec) + ' manj kot 2 predmeta. Popravite jim dodelitve.', 'opozorilo');
  }
  res.redirect('/admin/predmeti');
});

/* ===================================================================
   Administrator: učitelji in učenci
   =================================================================== */

const SKUPINE = {
  ucitelji: { vloga: 'ucitelj', veznik: 'ucitelj_predmet', naslov: 'Učitelji', ednina: 'učitelja', oblike: P.OBLIKE.ucitelj },
  ucenci: { vloga: 'ucenec', veznik: 'vpis', naslov: 'Učenci', ednina: 'učenca', oblike: P.OBLIKE.ucenec }
};

for (const [skupina, S] of Object.entries(SKUPINE)) {
  const osnova = '/admin/' + skupina;

  const prikazi = async (req, res, dodatno) => {
    const iskanje = P.cisto(req.query.q).slice(0, 100);
    const v = P.likeVzorec(iskanje);
    const pogoj = `u.vloga = ? AND (? = '' OR u.email LIKE ? OR CONCAT(u.ime, ' ', u.priimek) LIKE ? OR CONCAT(u.priimek, ' ', u.ime) LIKE ?)`;
    const param = [S.vloga, iskanje, v, v, v];
    const { skupaj } = await ena('SELECT COUNT(*) AS skupaj FROM uporabnik u WHERE ' + pogoj, param);
    const s = P.strani(P.cel(req.query.stran), Number(skupaj), NA_STRAN);
    const osebe = await q(`
      SELECT u.id, u.ime, u.priimek, u.email,
        (SELECT GROUP_CONCAT(CONCAT(p.id, ':', p.naziv) ORDER BY p.naziv SEPARATOR '\\n')
           FROM ${S.veznik} x JOIN predmet p ON p.id = x.predmet_id WHERE x.uporabnik_id = u.id) AS predmeti
      FROM uporabnik u WHERE ${pogoj}
      ORDER BY u.priimek, u.ime LIMIT ? OFFSET ?`, param.concat([NA_STRAN, s.odmik]));
    osebe.forEach((o) => { o.predmeti = predmetiIzNiza(o.predmeti); });
    res.izris('admin/uporabniki', Object.assign({
      naslov: S.naslov, skupina, S, osebe, iskanje, skupaj: Number(skupaj), strani: s, vnos: {}, napaka: null
    }, dodatno));
  };

  app.get(osnova, (req, res) => prikazi(req, res));

  app.post(osnova, async (req, res) => {
    const vnos = { ime: req.body.ime, priimek: req.body.priimek, email: P.emailIzObrazca(req.body, S.vloga), geslo: req.body.geslo };
    const napaka = async (n) => { res.status(400); await prikazi(req, res, { vnos, napaka: n }); };
    const r = P.preveriUporabnika(vnos, S.vloga, { novo: true });
    if (!r.ok) return napaka(r);
    let id;
    try {
      id = (await q('INSERT INTO uporabnik (ime, priimek, email, geslo_hash, vloga) VALUES (?, ?, ?, ?, ?)',
        [r.ime, r.priimek, r.email, await bcrypt.hash(r.geslo, BCRYPT_KROGI), S.vloga])).insertId;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return napaka({ napaka: 'E-poštni naslov je že zaseden.', polje: 'email' });
      throw e;
    }
    sporoci(req, r.ime + ' ' + r.priimek + ' je dodan. ' + (S.vloga === 'ucenec' ? 'Dodelite mu vsaj 2 predmeta.' : 'Dodelite mu predmete.'));
    res.redirect('/admin/dodelitve?vrsta=' + S.vloga + '&id=' + id);
  });

  const najdi = (id) => ena('SELECT id, ime, priimek, email, vloga FROM uporabnik WHERE id = ? AND vloga = ?', [P.cel(id), S.vloga]);

  app.get(osnova + '/:id/uredi', async (req, res) => {
    const o = await najdi(req.params.id);
    if (!o) return stranNapake(res, 404, 'Uporabnik ne obstaja', 'Morda ga je nekdo izbrisal.');
    res.izris('admin/uporabnik-uredi', { naslov: 'Uredi ' + S.ednina, skupina, S, oseba: o, vnos: o, napaka: null });
  });

  app.post(osnova + '/:id', async (req, res) => {
    const o = await najdi(req.params.id);
    if (!o) return stranNapake(res, 404, 'Uporabnik ne obstaja', 'Morda ga je nekdo izbrisal.');
    const vnos = { ime: req.body.ime, priimek: req.body.priimek, email: P.emailIzObrazca(req.body, S.vloga), geslo: req.body.geslo };
    const napaka = (n) => { res.status(400); res.izris('admin/uporabnik-uredi', { naslov: 'Uredi ' + S.ednina, skupina, S, oseba: o, vnos, napaka: n }); };
    const r = P.preveriUporabnika(vnos, S.vloga, { novo: false });
    if (!r.ok) return napaka(r);
    try {
      if (r.geslo) {
        await q('UPDATE uporabnik SET ime = ?, priimek = ?, email = ?, geslo_hash = ? WHERE id = ?',
          [r.ime, r.priimek, r.email, await bcrypt.hash(r.geslo, BCRYPT_KROGI), o.id]);
      } else {
        await q('UPDATE uporabnik SET ime = ?, priimek = ?, email = ? WHERE id = ?', [r.ime, r.priimek, r.email, o.id]);
      }
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return napaka({ napaka: 'E-poštni naslov je že zaseden.', polje: 'email' });
      throw e;
    }
    sporoci(req, 'Podatki za ' + r.ime + ' ' + r.priimek + ' so shranjeni.');
    res.redirect(osnova);
  });

  app.get(osnova + '/:id/izbrisi', async (req, res) => {
    const o = await najdi(req.params.id);
    if (!o) return stranNapake(res, 404, 'Uporabnik ne obstaja', 'Morda ga je nekdo že izbrisal.');
    const st = await ena(`SELECT (SELECT COUNT(*) FROM ${S.veznik} WHERE uporabnik_id = ?) AS predmeti,
        (SELECT COUNT(*) FROM oddaja WHERE ucenec_id = ?) AS oddaje,
        (SELECT COUNT(*) FROM gradivo WHERE nalozil_id = ?) AS gradiva`, [o.id, o.id, o.id]);
    const opis = ['Račun ' + o.email + ' bo izbrisan.'];
    if (Number(st.predmeti)) opis.push('Odstranijo se tudi ' + (S.vloga === 'ucitelj' ? 'dodelitve predmetov' : 'vpisi v predmete') + ' (' + st.predmeti + ').');
    if (Number(st.oddaje)) opis.push('Izbrišejo se oddane naloge z datotekami (' + st.oddaje + ').');
    if (Number(st.gradiva)) opis.push('Naložena gradiva (' + st.gradiva + ') ostanejo na voljo brez avtorja.');
    potrdiBrisanje(res, {
      naslov: 'Izbrišem ' + S.ednina + ' ' + o.ime + ' ' + o.priimek + '?', opis,
      akcija: osnova + '/' + o.id + '/izbrisi', gumb: 'Izbriši ' + S.ednina, nazaj: osnova
    });
  });

  app.post(osnova + '/:id/izbrisi', async (req, res) => {
    const o = await najdi(req.params.id);
    if (!o) return stranNapake(res, 404, 'Uporabnik ne obstaja', 'Morda ga je nekdo že izbrisal.');
    const oddaje = await q('SELECT predmet_id, pot_datoteke FROM oddaja WHERE ucenec_id = ?', [o.id]);
    await q('DELETE FROM uporabnik WHERE id = ?', [o.id]); // CASCADE: dodelitve, vpisi, oddaje; gradiva: SET NULL
    await Promise.all(oddaje.map((x) => odstrani(varnaPot(mapaOddaj(x.predmet_id, o.id), x.pot_datoteke))));
    sporoci(req, o.ime + ' ' + o.priimek + ' je izbrisan.');
    res.redirect(osnova);
  });
}

/* ===================================================================
   Administrator: dodelitve predmetov (M:N)
   =================================================================== */

async function prikaziDodelitve(req, res, vrsta, id, dodatno) {
  const S = vrsta === 'ucenec' ? SKUPINE.ucenci : SKUPINE.ucitelji;
  const osebe = await q(`SELECT u.id, u.ime, u.priimek, u.email,
      (SELECT COUNT(*) FROM ${S.veznik} x WHERE x.uporabnik_id = u.id) AS st_predmetov
    FROM uporabnik u WHERE u.vloga = ? ORDER BY u.priimek, u.ime`, [S.vloga]);
  const oseba = osebe.find((o) => o.id === id) || osebe[0] || null;
  const predmeti = await q(`SELECT p.id, p.naziv,
      (SELECT GROUP_CONCAT(u.priimek ORDER BY u.priimek SEPARATOR ', ')
         FROM ucitelj_predmet x JOIN uporabnik u ON u.id = x.uporabnik_id WHERE x.predmet_id = p.id) AS ucitelji,
      (SELECT COUNT(*) FROM ucitelj_predmet x WHERE x.predmet_id = p.id) AS st_uciteljev
    FROM predmet p ORDER BY p.naziv`);
  const izbrani = oseba
    ? (await q(`SELECT predmet_id FROM ${S.veznik} WHERE uporabnik_id = ?`, [oseba.id])).map((x) => x.predmet_id)
    : [];
  res.izris('admin/dodelitve', Object.assign({ naslov: 'Dodelitve', vrsta: S.vloga, S, osebe, oseba, predmeti, izbrani, napaka: null }, dodatno));
}

app.get('/admin/dodelitve', (req, res) =>
  prikaziDodelitve(req, res, req.query.vrsta === 'ucenec' ? 'ucenec' : 'ucitelj', P.cel(req.query.id)));

app.post('/admin/dodelitve', async (req, res) => {
  const o = await ena(`SELECT id, ime, priimek, vloga FROM uporabnik WHERE id = ? AND vloga IN ('ucitelj', 'ucenec')`, [P.cel(req.body.uporabnik_id)]);
  if (!o) return stranNapake(res, 404, 'Uporabnik ne obstaja', 'Morda ga je nekdo izbrisal.');
  const ids = P.idjiPredmetov(req.body.predmet);
  const obstojeci = ids.length ? (await q('SELECT id FROM predmet WHERE id IN (?)', [ids])).map((x) => x.id) : [];
  if (o.vloga === 'ucenec' && obstojeci.length < 2) {
    res.status(400);
    return prikaziDodelitve(req, res, o.vloga, o.id, {
      izbraniObrazec: obstojeci, napaka: { napaka: 'Učenec mora obiskovati najmanj 2 predmeta.', polje: 'predmeti' }
    });
  }
  const veznik = o.vloga === 'ucitelj' ? 'ucitelj_predmet' : 'vpis';
  await transakcija(async (c) => {
    await c.query(`DELETE FROM ${veznik} WHERE uporabnik_id = ?`, [o.id]);
    if (obstojeci.length) await c.query(`INSERT INTO ${veznik} (uporabnik_id, predmet_id) VALUES ?`, [obstojeci.map((pid) => [o.id, pid])]);
  });
  sporoci(req, 'Dodelitve za ' + o.ime + ' ' + o.priimek + ' so shranjene.');
  res.redirect('/admin/dodelitve?vrsta=' + o.vloga + '&id=' + o.id);
});

/* ===================================================================
   Učitelj: gradiva in oddane naloge (samo predmeti, ki jih poučuje)
   =================================================================== */

app.use('/ucitelj', zahtevaj('ucitelj'));

/** Izbrani predmet iz ?predmet= ali prvi predmet učitelja. Tujega predmeta ne odpre (403). */
async function izberiPredmetUcitelja(req, res, pot) {
  const moji = await predmetiUcitelja(req.uporabnik.id);
  const zahtevan = P.cel(req.query.predmet || req.body && req.body.predmet);
  if (zahtevan && !moji.some((p) => p.id === zahtevan)) {
    stranNapake(res, 403, 'Tega predmeta ne poučujete', 'Gradiva in oddaje lahko urejate samo pri svojih predmetih.');
    return null;
  }
  return { moji, predmet: moji.find((p) => p.id === zahtevan) || moji[0] || null, pot };
}

async function prikaziGradiva(req, res, izbor, dodatno) {
  const { moji, predmet } = izbor;
  const stevila = moji.length ? await q('SELECT predmet_id, COUNT(*) AS n FROM gradivo WHERE predmet_id IN (?) GROUP BY predmet_id', [moji.map((p) => p.id)]) : [];
  const gradiva = predmet ? await q(`SELECT g.id, g.naslov, g.pot_datoteke, g.datum_nalozitve, u.ime, u.priimek
      FROM gradivo g LEFT JOIN uporabnik u ON u.id = g.nalozil_id
      WHERE g.predmet_id = ? ORDER BY g.datum_nalozitve DESC, g.id DESC`, [predmet.id]) : [];
  res.izris('ucitelj/gradiva', Object.assign({
    naslov: 'Gradiva', moji, predmet, gradiva, vnos: {}, napaka: null,
    stevila: Object.fromEntries(stevila.map((s) => [s.predmet_id, Number(s.n)]))
  }, dodatno));
}

app.get('/ucitelj/gradiva', async (req, res) => {
  const izbor = await izberiPredmetUcitelja(req, res, '/ucitelj/gradiva');
  if (izbor) await prikaziGradiva(req, res, izbor);
});

app.post('/ucitelj/gradiva', async (req, res) => {
  const napakaNalaganja = await sprejmiDatoteko(req, res);
  const zacasna = req.file && req.file.path;
  try {
    if (!veljavenCsrf(req)) return stranNapake(res, 403, 'Obrazec je potekel', 'Osvežite stran in poskusite znova.');
    const izbor = await izberiPredmetUcitelja(req, res, '/ucitelj/gradiva');
    if (!izbor) return;
    if (!P.cel(req.body.predmet) || !izbor.predmet || !(await poucuje(req.uporabnik.id, izbor.predmet.id))) {
      return stranNapake(res, 403, 'Tega predmeta ne poučujete', 'Gradiva lahko nalagate samo pri svojih predmetih.');
    }
    const napaka = (n) => { res.status(400); return prikaziGradiva(req, res, izbor, { vnos: req.body, napaka: n }); };
    if (napakaNalaganja) return napaka({ napaka: napakaNalaganja, polje: 'datoteka' });
    const n = P.preveriNaslov(req.body.naslov);
    if (!n.ok) return napaka(n);
    const f = P.preveriDatoteko(req.file);
    if (!f.ok) return napaka(f);

    const ime = crypto.randomUUID() + '.' + f.koncnica; // na disku naključno ime, nikoli ime od uporabnika
    const cilj = varnaPot(MAPA.gradiva, ime);
    await fsp.rename(zacasna, cilj);
    try {
      await q('INSERT INTO gradivo (predmet_id, nalozil_id, naslov, pot_datoteke) VALUES (?, ?, ?, ?)',
        [izbor.predmet.id, req.uporabnik.id, n.vrednost, ime]);
    } catch (e) {
      await odstrani(cilj);
      throw e;
    }
    sporoci(req, 'Gradivo ' + n.vrednost + ' je naloženo.');
    res.redirect('/ucitelj/gradiva?predmet=' + izbor.predmet.id);
  } finally {
    await odstrani(zacasna); // po uspešnem premiku datoteke tu ni več
  }
});

app.get('/ucitelj/gradiva/:id/izbrisi', async (req, res) => {
  const g = await ena('SELECT g.id, g.predmet_id, g.naslov, p.naziv FROM gradivo g JOIN predmet p ON p.id = g.predmet_id WHERE g.id = ?', [P.cel(req.params.id)]);
  if (!g) return stranNapake(res, 404, 'Gradivo ne obstaja', 'Morda ga je nekdo že izbrisal.');
  if (!(await poucuje(req.uporabnik.id, g.predmet_id))) {
    return stranNapake(res, 403, 'Tega gradiva ne morete izbrisati', 'Brišete lahko samo gradiva predmetov, ki jih poučujete.');
  }
  potrdiBrisanje(res, {
    naslov: 'Izbrišem gradivo ' + g.naslov + '?', opis: ['Učenci predmeta ' + g.naziv + ' gradiva ne bodo več videli.'],
    akcija: '/ucitelj/gradiva/' + g.id + '/izbrisi', gumb: 'Izbriši gradivo', nazaj: '/ucitelj/gradiva?predmet=' + g.predmet_id
  });
});

app.post('/ucitelj/gradiva/:id/izbrisi', async (req, res) => {
  const g = await ena('SELECT id, predmet_id, naslov, pot_datoteke FROM gradivo WHERE id = ?', [P.cel(req.params.id)]);
  if (!g) return stranNapake(res, 404, 'Gradivo ne obstaja', 'Morda ga je nekdo že izbrisal.');
  if (!(await poucuje(req.uporabnik.id, g.predmet_id))) {
    return stranNapake(res, 403, 'Tega gradiva ne morete izbrisati', 'Brišete lahko samo gradiva predmetov, ki jih poučujete.');
  }
  await q('DELETE FROM gradivo WHERE id = ?', [g.id]);
  await odstrani(varnaPot(MAPA.gradiva, g.pot_datoteke));
  sporoci(req, 'Gradivo ' + g.naslov + ' je izbrisano.');
  res.redirect('/ucitelj/gradiva?predmet=' + g.predmet_id);
});

app.get('/ucitelj/oddaje', async (req, res) => {
  const izbor = await izberiPredmetUcitelja(req, res, '/ucitelj/oddaje');
  if (!izbor) return;
  const { moji, predmet } = izbor;
  const stevila = moji.length ? await q('SELECT predmet_id, COUNT(*) AS n FROM oddaja WHERE predmet_id IN (?) GROUP BY predmet_id', [moji.map((p) => p.id)]) : [];
  const oddaje = predmet ? await q(`SELECT o.id, o.naslov_naloge, o.pot_datoteke, o.datum_oddaje, u.ime, u.priimek
      FROM oddaja o JOIN uporabnik u ON u.id = o.ucenec_id
      WHERE o.predmet_id = ? ORDER BY o.datum_oddaje DESC, o.id DESC`, [predmet.id]) : [];
  const vpisanih = predmet ? Number((await ena('SELECT COUNT(*) AS n FROM vpis WHERE predmet_id = ?', [predmet.id])).n) : 0;
  res.izris('ucitelj/oddaje', {
    naslov: 'Oddane naloge', moji, predmet, oddaje, vpisanih,
    stevila: Object.fromEntries(stevila.map((s) => [s.predmet_id, Number(s.n)]))
  });
});

/* ===================================================================
   Učenec: profil, predmeti, gradiva, oddaja nalog
   =================================================================== */

app.use('/ucenec', zahtevaj('ucenec'));

app.get('/ucenec/profil', (req, res) => {
  res.izris('ucenec/profil', { naslov: 'Moj profil', vnos: req.uporabnik, napaka: null });
});

app.post('/ucenec/profil', async (req, res) => {
  const u = req.uporabnik;
  const vnos = { ime: req.body.ime, priimek: req.body.priimek, email: P.emailIzObrazca(req.body, 'ucenec'), geslo: req.body.geslo, geslo2: req.body.geslo2 };
  const napaka = (n) => { res.status(400); res.izris('ucenec/profil', { naslov: 'Moj profil', vnos, napaka: n }); };
  const r = P.preveriUporabnika(vnos, 'ucenec', { novo: false });
  if (!r.ok) return napaka(r);
  try {
    if (r.geslo) {
      await q('UPDATE uporabnik SET ime = ?, priimek = ?, email = ?, geslo_hash = ? WHERE id = ?',
        [r.ime, r.priimek, r.email, await bcrypt.hash(r.geslo, BCRYPT_KROGI), u.id]);
    } else {
      await q('UPDATE uporabnik SET ime = ?, priimek = ?, email = ? WHERE id = ?', [r.ime, r.priimek, r.email, u.id]);
    }
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return napaka({ napaka: 'E-poštni naslov je že zaseden.', polje: 'email' });
    throw e;
  }
  sporoci(req, 'Profil je shranjen.' + (r.geslo ? ' Geslo je spremenjeno.' : ''));
  res.redirect('/ucenec/profil');
});

async function prikaziPredmeteUcenca(req, res, dodatno) {
  const predmeti = await q(`SELECT p.id, p.naziv, p.opis,
      (SELECT GROUP_CONCAT(CONCAT(u.ime, ' ', u.priimek) ORDER BY u.priimek SEPARATOR ', ')
         FROM ucitelj_predmet x JOIN uporabnik u ON u.id = x.uporabnik_id WHERE x.predmet_id = p.id) AS ucitelji
    FROM predmet p ORDER BY p.naziv`);
  const izbrani = (await q('SELECT predmet_id FROM vpis WHERE uporabnik_id = ?', [req.uporabnik.id])).map((x) => x.predmet_id);
  res.izris('ucenec/predmeti', Object.assign({ naslov: 'Moji predmeti', predmeti, izbrani, napaka: null }, dodatno));
}

app.get('/ucenec/predmeti', (req, res) => prikaziPredmeteUcenca(req, res));

app.post('/ucenec/predmeti', async (req, res) => {
  const ids = P.idjiPredmetov(req.body.predmet);
  const obstojeci = ids.length ? (await q('SELECT id FROM predmet WHERE id IN (?)', [ids])).map((x) => x.id) : [];
  if (obstojeci.length < 2) {
    res.status(400);
    return prikaziPredmeteUcenca(req, res, { izbraniObrazec: obstojeci, napaka: { napaka: 'Izbrati morate najmanj 2 predmeta.', polje: 'predmeti' } });
  }
  await transakcija(async (c) => {
    await c.query('DELETE FROM vpis WHERE uporabnik_id = ?', [req.uporabnik.id]);
    await c.query('INSERT INTO vpis (uporabnik_id, predmet_id) VALUES ?', [obstojeci.map((pid) => [req.uporabnik.id, pid])]);
  });
  sporoci(req, 'Vaši predmeti so shranjeni.');
  res.redirect('/ucenec/predmeti');
});

app.get('/ucenec/gradiva', async (req, res) => {
  const moji = await predmetiUcenca(req.uporabnik.id);
  const gradiva = await q(`SELECT g.id, g.predmet_id, g.naslov, g.pot_datoteke, g.datum_nalozitve
      FROM gradivo g JOIN vpis v ON v.predmet_id = g.predmet_id AND v.uporabnik_id = ?
      ORDER BY g.datum_nalozitve DESC, g.id DESC`, [req.uporabnik.id]);
  moji.forEach((p) => { p.gradiva = gradiva.filter((g) => g.predmet_id === p.id); });
  res.izris('ucenec/gradiva', { naslov: 'Gradiva', moji });
});

async function prikaziOddajo(req, res, dodatno) {
  const moji = await predmetiUcenca(req.uporabnik.id);
  const oddaje = await q(`SELECT o.id, o.predmet_id, o.naslov_naloge, o.pot_datoteke, o.datum_oddaje, p.naziv
      FROM oddaja o JOIN predmet p ON p.id = o.predmet_id
      WHERE o.ucenec_id = ? ORDER BY o.datum_oddaje DESC, o.id DESC`, [req.uporabnik.id]);
  res.izris('ucenec/oddaja', Object.assign({ naslov: 'Oddaja nalog', moji, oddaje, vnos: { predmet: P.cel(req.query.predmet) }, napaka: null }, dodatno));
}

app.get('/ucenec/oddaja', (req, res) => prikaziOddajo(req, res));

/** Shrani datoteko kot »Priimek Ime – Naslov.končnica« v mapo oddaje/<predmet>/<učenec>. */
async function shraniOddajo(u, predmetId, naslov, zacasna, konc, staro) {
  const mapa = mapaOddaj(predmetId, u.id);
  await fsp.mkdir(mapa, { recursive: true });
  const ime = P.imeOddaje(u.priimek, u.ime, naslov, konc);
  const cilj = varnaPot(mapa, ime);
  await fsp.rename(zacasna, cilj); // če ima nova datoteka isto ime, rename prepiše staro
  if (staro && staro.pot_datoteke !== ime) await odstrani(varnaPot(mapa, staro.pot_datoteke));
  return ime;
}

app.post('/ucenec/oddaja', async (req, res) => {
  const napakaNalaganja = await sprejmiDatoteko(req, res);
  let zacasna = req.file && req.file.path;
  try {
    if (!veljavenCsrf(req)) return stranNapake(res, 403, 'Obrazec je potekel', 'Osvežite stran in poskusite znova.');
    const u = req.uporabnik;
    const predmetId = P.cel(req.body.predmet);
    const napaka = (n) => { res.status(400); return prikaziOddajo(req, res, { vnos: req.body, napaka: n }); };
    if (!(await obiskuje(u.id, predmetId))) return napaka({ napaka: 'Nalogo lahko oddate samo pri predmetih, ki jih obiskujete.', polje: 'predmet' });
    if (napakaNalaganja) return napaka({ napaka: napakaNalaganja, polje: 'datoteka' });
    const n = P.preveriNaslov(req.body.naslov);
    if (!n.ok) return napaka(n);
    const f = P.preveriDatoteko(req.file);
    if (!f.ok) return napaka(f);

    const staro = await ena('SELECT id, naslov_naloge, pot_datoteke, datum_oddaje FROM oddaja WHERE ucenec_id = ? AND predmet_id = ? AND naslov_naloge = ?',
      [u.id, predmetId, n.vrednost]);
    if (staro) {
      // Zahteva L5: nova datoteka čaka v začasni mapi, stara se zamenja šele po potrditvi.
      const prejsnja = req.session.cakajoca;
      if (prejsnja) await odstrani(varnaPot(MAPA.zacasno, prejsnja.zacasno));
      req.session.cakajoca = { zacasno: path.basename(zacasna), oddajaId: staro.id, koncnica: f.koncnica, cas: Date.now() };
      zacasna = null; // ne briši, čaka na potrditev
      return res.redirect('/ucenec/oddaja/potrdi');
    }

    const ime = await shraniOddajo(u, predmetId, n.vrednost, zacasna, f.koncnica, null);
    zacasna = null;
    await q('INSERT INTO oddaja (ucenec_id, predmet_id, naslov_naloge, pot_datoteke) VALUES (?, ?, ?, ?)', [u.id, predmetId, n.vrednost, ime]);
    sporoci(req, 'Naloga je oddana kot ' + ime + '.');
    res.redirect('/ucenec/oddaja');
  } finally {
    await odstrani(zacasna);
  }
});

const ROK_POTRDITVE = 30 * 60 * 1000;

/** Čakajoča ponovna oddaja iz seje (ali null, če je ni ali je potekla). */
async function cakajocaOddaja(req) {
  const c = req.session.cakajoca;
  if (!c) return null;
  const veljavna = /^[a-f0-9]{32}$/.test(c.zacasno || '') && Date.now() - c.cas < ROK_POTRDITVE;
  const oddaja = veljavna ? await ena(`SELECT o.id, o.predmet_id, o.naslov_naloge, o.pot_datoteke, o.datum_oddaje, p.naziv
      FROM oddaja o JOIN predmet p ON p.id = o.predmet_id WHERE o.id = ? AND o.ucenec_id = ?`, [c.oddajaId, req.uporabnik.id]) : null;
  if (!oddaja) {
    if (/^[a-f0-9]{32}$/.test(c.zacasno || '')) await odstrani(varnaPot(MAPA.zacasno, c.zacasno));
    req.session.cakajoca = undefined;
    return null;
  }
  return { c, oddaja };
}

app.get('/ucenec/oddaja/potrdi', async (req, res) => {
  const cak = await cakajocaOddaja(req);
  if (!cak) return res.redirect('/ucenec/oddaja');
  const u = req.uporabnik;
  res.izris('ucenec/potrdi', {
    naslov: 'Naloga je že oddana', oddaja: cak.oddaja,
    novoIme: P.imeOddaje(u.priimek, u.ime, cak.oddaja.naslov_naloge, cak.c.koncnica)
  });
});

app.post('/ucenec/oddaja/potrdi', async (req, res) => {
  const cak = await cakajocaOddaja(req);
  if (!cak) {
    sporoci(req, 'Potrditev je potekla. Nalogo oddajte znova.', 'napaka');
    return res.redirect('/ucenec/oddaja');
  }
  const { c, oddaja } = cak;
  const zacasna = varnaPot(MAPA.zacasno, c.zacasno);
  req.session.cakajoca = undefined;
  if (req.body.odlocitev !== 'da') {
    await odstrani(zacasna);
    sporoci(req, 'Oddaja je preklicana. Prejšnja datoteka ostane.');
    return res.redirect('/ucenec/oddaja');
  }
  const ime = await shraniOddajo(req.uporabnik, oddaja.predmet_id, oddaja.naslov_naloge, zacasna, c.koncnica, oddaja);
  await q('UPDATE oddaja SET pot_datoteke = ?, datum_oddaje = CURRENT_TIMESTAMP WHERE id = ?', [ime, oddaja.id]);
  sporoci(req, 'Naloga je znova oddana. Prejšnja datoteka je povožena.');
  res.redirect('/ucenec/oddaja');
});

/* ===================================================================
   Prenos datotek s preverjanjem pravic (zahteva N6)
   =================================================================== */

app.use('/datoteka', zahtevaj(null));

function poslji(res, pot, ime) {
  res.download(pot, ime, { dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) stranNapake(res, 404, 'Datoteke ni mogoče najti', 'Datoteka manjka na strežniku.');
  });
}

app.get('/datoteka/gradivo/:id', async (req, res) => {
  const g = await ena('SELECT id, predmet_id, naslov, pot_datoteke FROM gradivo WHERE id = ?', [P.cel(req.params.id)]);
  if (!g) return stranNapake(res, 404, 'Gradivo ne obstaja', 'Morda ga je učitelj izbrisal.');
  const u = req.uporabnik;
  const dovoljeno = u.vloga === 'admin'
    || (u.vloga === 'ucitelj' && await poucuje(u.id, g.predmet_id))
    || (u.vloga === 'ucenec' && await obiskuje(u.id, g.predmet_id));
  if (!dovoljeno) return stranNapake(res, 403, 'Nimate dostopa do tega gradiva', 'Gradiva so na voljo samo pri predmetih, ki jih obiskujete ali poučujete.');
  poslji(res, varnaPot(MAPA.gradiva, g.pot_datoteke), g.naslov + '.' + P.koncnica(g.pot_datoteke));
});

app.get('/datoteka/oddaja/:id', async (req, res) => {
  const o = await ena('SELECT id, ucenec_id, predmet_id, pot_datoteke FROM oddaja WHERE id = ?', [P.cel(req.params.id)]);
  if (!o) return stranNapake(res, 404, 'Oddaja ne obstaja', 'Morda je bila izbrisana.');
  const u = req.uporabnik;
  const dovoljeno = (u.vloga === 'ucenec' && o.ucenec_id === u.id) || (u.vloga === 'ucitelj' && await poucuje(u.id, o.predmet_id));
  if (!dovoljeno) return stranNapake(res, 403, 'Nimate dostopa do te oddaje', 'Oddajo vidita samo učenec, ki jo je oddal, in učitelj predmeta.');
  poslji(res, varnaPot(mapaOddaj(o.predmet_id, o.ucenec_id), o.pot_datoteke), o.pot_datoteke);
});

/* ===================================================================
   Napake
   =================================================================== */

app.use((req, res) => stranNapake(res, 404, 'Strani ni mogoče najti', 'Naslov ' + req.path + ' ne obstaja.'));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  if (err.type === 'entity.too.large' || err.type === 'parameters.too.many') {
    return res.izris ? stranNapake(res, 413, 'Obrazec je prevelik', 'Skrajšajte vnos in poskusite znova.') : res.status(413).end();
  }
  if (!res.izris) return res.status(500).type('text').send('Napaka strežnika. Poskusite znova čez nekaj trenutkov.');
  stranNapake(res, 500, 'Napaka strežnika', 'Prišlo je do nepričakovane napake. Poskusite znova.');
});

/* ===================================================================
   Zagon
   =================================================================== */

/** Briše začasne datoteke, starejše od »starost« ms (nepotrjene ponovne oddaje). */
async function pocistiZacasno(starost) {
  const imena = await fsp.readdir(MAPA.zacasno).catch(() => []);
  await Promise.all(imena.map(async (ime) => {
    const pot = path.join(MAPA.zacasno, ime);
    const info = await fsp.stat(pot).catch(() => null);
    if (info && Date.now() - info.mtimeMs > starost) await odstrani(pot);
  }));
}

async function zagon() {
  for (const mapa of Object.values(MAPA)) await fsp.mkdir(mapa, { recursive: true });
  await pocistiZacasno(ROK_POTRDITVE);
  setInterval(() => pocistiZacasno(ROK_POTRDITVE), 15 * 60 * 1000).unref();
  await cakajNaBazo();
  await napolniCeJePrazno(pool, { gradiva: MAPA.gradiva, oddaje: MAPA.oddaje });
  const streznik = app.listen(PORT, () => console.log('Šolski IS posluša na vratih ' + PORT));
  const ustavi = () => streznik.close(() => pool.end().finally(() => process.exit(0)));
  process.on('SIGTERM', ustavi);
  process.on('SIGINT', ustavi);
}

zagon().catch((e) => {
  console.error('Zagon ni uspel:', e.message);
  process.exit(1);
});
