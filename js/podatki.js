/*
 * Podatkovni sloj prototipa
 * -------------------------
 * Tabele so enake kot v ER diagramu (docs/dokumentacija-word/02_...):
 *   uporabnik, predmet, ucitelj_predmet, vpis, gradivo, oddaja
 *
 * V prototipu se podatki hranijo v localStorage tega brskalnika. Funkcije, ki
 * spreminjajo podatke, preverijo pravice in vnose tako, kot bi jih strežnik
 * (npr. učitelj ne more izbrisati gradiva predmeta, ki ga ne poučuje).
 * V pravi aplikaciji ta pravila izvaja strežnik, gesla pa zgosti z bcrypt.
 */
(function () {
  'use strict';

  var E = window.SolskiEmail;
  var VERZIJA = 2;
  var KLJUC_PODATKI = 'solski-is:podatki:v' + VERZIJA;
  var KLJUC_SEJA = 'solski-is:seja:v' + VERZIJA;
  var DEMO_GESLO = 'geslo123';

  var DATOTEKE = {
    koncnice: ['pdf', 'doc', 'docx', 'odt', 'txt', 'zip', 'png', 'jpg', 'py', 'js', 'java', 'cs', 'php', 'sql'],
    najvec: 10 * 1024 * 1024
  };

  var IME_VZOREC = /^\p{L}[\p{L}' -]*$/u;

  /* ---------- pomožne funkcije ---------- */

  // Samo za demo: FNV-1a. Ni varna zgostitev! Na strežniku uporabite bcrypt.
  function zgosti(geslo) {
    var s = 'solski-is:' + geslo;
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 'demo$' + ('0000000' + h.toString(16)).slice(-8);
  }

  function nakljucno(seme) { // mulberry32 – ponovljivi testni podatki
    return function () {
      seme |= 0; seme = (seme + 0x6D2B79F5) | 0;
      var t = Math.imul(seme ^ (seme >>> 15), 1 | seme);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function koncnica(ime) {
    var i = String(ime || '').lastIndexOf('.');
    return i > 0 ? ime.slice(i + 1).toLowerCase() : '';
  }

  function cisto(besedilo) {
    return String(besedilo == null ? '' : besedilo).trim().replace(/\s+/g, ' ');
  }

  /** »Priimek Ime – Naslov naloge.končnica« brez znakov, ki v imenih datotek niso dovoljeni. */
  function imeOddaje(uporabnik, naslov, konc) {
    var varen = String(naslov).replace(/[\\/]/g, '-').replace(/[:*?"<>|]/g, '');
    var osnova = cisto(uporabnik.priimek + ' ' + uporabnik.ime + ' – ' + varen);
    return osnova + (konc ? '.' + konc : '');
  }

  function primerjaj(a, b) { return a.localeCompare(b, 'sl'); }
  function poImenu(a, b) { return primerjaj(a.priimek, b.priimek) || primerjaj(a.ime, b.ime); }
  function napaka(besedilo, polje) { return { ok: false, napaka: besedilo, polje: polje }; }

  /* ---------- testni podatki (10 predmetov, 20 učiteljev, 100 učencev) ---------- */

  var PREDMETI = [
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

  var UCITELJI = [
    ['Ana', 'Horvat'], ['Luka', 'Kovač'], ['Maja', 'Krajnc'], ['Jan', 'Zupan'], ['Mojca', 'Potočnik'],
    ['Tomaž', 'Kos'], ['Nina', 'Golob'], ['Marko', 'Vidmar'], ['Petra', 'Kolar'], ['Andrej', 'Mlakar'],
    ['Barbara', 'Turk'], ['Gregor', 'Bizjak'], ['Simona', 'Kralj'], ['Matej', 'Hribar'], ['Tanja', 'Rozman'],
    ['Boštjan', 'Kovačič'], ['Urška', 'Petek'], ['Rok', 'Žagar'], ['Katja', 'Medved'], ['Blaž', 'Kotnik']
  ];
  // Glavni predmet vsakega učitelja (vsak predmet ima vsaj 2 učitelja) ...
  var GLAVNI = [1, 0, 2, 6, 3, 5, 7, 8, 9, 4, 0, 1, 2, 6, 7, 9, 3, 8, 5, 4];
  // ... in nekateri učitelji poučujejo še drug predmet (relacija M:N).
  var DODATNI = { 0: 4, 1: 5, 3: 9, 6: 9, 13: 8 };

  var IMENA_UCENCEV = ['Ana', 'Luka', 'Maja', 'Jan', 'Eva', 'Nik', 'Zala', 'Žiga', 'Lara', 'Tim', 'Sara', 'Jakob',
    'Neža', 'Filip', 'Ema', 'Miha', 'Tjaša', 'Gal', 'Klara', 'Vid', 'Lana', 'Aljaž', 'Pia', 'Tilen', 'Hana',
    'Enej', 'Julija', 'Matic', 'Taja', 'Lovro'];
  var PRIIMKI_UCENCEV = ['Novak', 'Kranjc', 'Zupančič', 'Vidic', 'Kavčič', 'Ribič', 'Jereb', 'Pavlič', 'Logar',
    'Sever', 'Hočevar', 'Erjavec', 'Breznik', 'Kokalj', 'Lesjak', 'Knez', 'Dolenc', 'Rupnik', 'Pirc', 'Ferk',
    'Jelen', 'Lah', 'Ocvirk', 'Šket', 'Jug'];

  var GRADIVA = [
    [0, 'Prešeren – izbrane pesmi', 'pdf'], [0, 'Navodila za esej', 'docx'],
    [1, 'Vaje 1 – enačbe', 'pdf'], [1, 'Formule', 'pdf'], [1, 'Rešitve kontrolne naloge', 'pdf'],
    [2, 'Seznam besedišča', 'docx'], [2, 'Essay structure', 'pdf'],
    [3, 'Glagoli s predponami', 'pdf'],
    [4, 'Navodila za laboratorijsko vajo', 'pdf'], [4, 'Ohmov zakon – povzetek', 'pdf'],
    [5, 'Časovni trak 20. stoletja', 'png'],
    [6, 'Navodila za projekt', 'docx'], [6, 'Primeri zank v C#', 'zip'],
    [7, 'Primeri SQL', 'sql'], [7, 'Normalizacija – vaje', 'pdf'],
    [8, 'Vaje iz podomrežij', 'pdf'],
    [9, 'Flexbox in grid', 'pdf'], [9, 'Predloga projekta', 'zip']
  ];

  var NALOGE = [
    [1, 'Domača naloga 1', 'pdf', 6], [6, 'Projekt', 'docx', 4], [2, 'Essay', 'docx', 3],
    [9, 'Osebna spletna stran', 'zip', 4], [7, 'ER diagram', 'png', 3], [0, 'Esej', 'docx', 2]
  ];

  function datum(dan, mesec, ura, minuta) {
    return new Date(2026, mesec - 1, dan, ura || 10, minuta || 0).toISOString();
  }

  function seme() {
    var rnd = nakljucno(20260901);
    var d = {
      verzija: VERZIJA,
      zaporedje: { uporabnik: 0, predmet: 0, gradivo: 0, oddaja: 0 },
      uporabnik: [], predmet: [], ucitelj_predmet: [], vpis: [], gradivo: [], oddaja: []
    };
    function id(t) { d.zaporedje[t] += 1; return d.zaporedje[t]; }
    var hash = zgosti(DEMO_GESLO);

    PREDMETI.forEach(function (p) { d.predmet.push({ id: id('predmet'), naziv: p[0], opis: p[1] }); });
    var pid = function (i) { return d.predmet[i].id; };

    d.uporabnik.push({ id: id('uporabnik'), ime: 'Administrator', priimek: 'Sistema', email: 'admin@' + E.DOMENA_ZAPOSLENI, geslo_hash: hash, vloga: 'admin' });

    var ucitelji = UCITELJI.map(function (u, i) {
      var upo = { id: id('uporabnik'), ime: u[0], priimek: u[1], email: E.predlagaj(u[0], u[1], 'ucitelj'), geslo_hash: hash, vloga: 'ucitelj' };
      d.uporabnik.push(upo);
      d.ucitelj_predmet.push({ uporabnik_id: upo.id, predmet_id: pid(GLAVNI[i]) });
      if (DODATNI[i] != null) d.ucitelj_predmet.push({ uporabnik_id: upo.id, predmet_id: pid(DODATNI[i]) });
      return upo;
    });

    var zasedeni = {};
    var ucenci = [];
    var dodaj = function (ime, priimek, predmeti) {
      var lokalni = E.lokalniIzImena(ime, priimek);
      var upo = { id: id('uporabnik'), ime: ime, priimek: priimek, email: lokalni + '@' + E.DOMENA_DIJAK, geslo_hash: hash, vloga: 'ucenec' };
      zasedeni[ime + ' ' + priimek] = true;
      d.uporabnik.push(upo);
      predmeti.forEach(function (i) { d.vpis.push({ uporabnik_id: upo.id, predmet_id: pid(i) }); });
      ucenci.push(upo);
    };
    dodaj('Ana', 'Novak', [1, 2, 6]); // demo učenka
    while (ucenci.length < 100) {
      var ime = IMENA_UCENCEV[Math.floor(rnd() * IMENA_UCENCEV.length)];
      var priimek = PRIIMKI_UCENCEV[Math.floor(rnd() * PRIIMKI_UCENCEV.length)];
      if (zasedeni[ime + ' ' + priimek]) continue;
      var izbor = [];
      while (izbor.length < 3) {
        var p = Math.floor(rnd() * PREDMETI.length);
        if (izbor.indexOf(p) < 0) izbor.push(p);
      }
      dodaj(ime, priimek, izbor);
    }

    GRADIVA.forEach(function (g, i) {
      var predmetId = pid(g[0]);
      var avtor = d.ucitelj_predmet.filter(function (v) { return v.predmet_id === predmetId; })[0];
      d.gradivo.push({
        id: id('gradivo'), predmet_id: predmetId, nalozil_id: avtor ? avtor.uporabnik_id : null,
        naslov: g[1], pot_datoteke: g[1] + '.' + g[2], velikost: Math.round((40 + rnd() * 2400) * 1024),
        datum_nalozitve: datum(8 + (i % 20), 9 + (i % 2), 9 + (i % 6), (i * 7) % 60)
      });
    });

    NALOGE.forEach(function (n, ni) {
      var predmetId = pid(n[0]);
      var vpisani = d.vpis.filter(function (v) { return v.predmet_id === predmetId; }).map(function (v) { return v.uporabnik_id; });
      vpisani.slice(0, n[3]).forEach(function (uid, k) {
        var u = d.uporabnik.filter(function (x) { return x.id === uid; })[0];
        d.oddaja.push({
          id: id('oddaja'), ucenec_id: uid, predmet_id: predmetId, naslov_naloge: n[1],
          pot_datoteke: imeOddaje(u, n[1], n[2]), velikost: Math.round((80 + rnd() * 1800) * 1024),
          datum_oddaje: datum(10 + ni * 2 + (k % 2), 10, 13 + k, (k * 17) % 60)
        });
      });
    });

    return d;
  }

  /* ---------- shranjevanje ---------- */

  var hramba = (function () {
    try {
      var t = '__solski_is__';
      window.localStorage.setItem(t, t);
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch (e) { return null; }
  })();

  function preberi(kljuc) {
    if (!hramba) return null;
    try { return hramba.getItem(kljuc); } catch (e) { return null; }
  }
  function zapisi(kljuc, vrednost) {
    if (!hramba) return;
    try {
      if (vrednost == null) hramba.removeItem(kljuc); else hramba.setItem(kljuc, vrednost);
    } catch (e) { /* poln ali onemogočen localStorage: prototip deluje naprej v pomnilniku */ }
  }

  function nalozi() {
    var s = preberi(KLJUC_PODATKI);
    if (s) {
      try {
        var d = JSON.parse(s);
        if (d && d.verzija === VERZIJA) return d;
      } catch (e) { /* pokvarjeni podatki – začnemo znova */ }
    }
    return seme();
  }

  var db = nalozi();
  var poslusalci = [];

  function shrani() {
    zapisi(KLJUC_PODATKI, JSON.stringify(db));
    poslusalci.forEach(function (fn) { fn(); });
  }

  /* ---------- poizvedbe ---------- */

  function najdi(tabela, id) {
    for (var i = 0; i < db[tabela].length; i++) if (db[tabela][i].id === id) return db[tabela][i];
    return null;
  }

  function uporabniki(vloga) {
    return db.uporabnik.filter(function (u) { return u.vloga === vloga; }).sort(poImenu);
  }
  function predmeti() { return db.predmet.slice().sort(function (a, b) { return a.id - b.id; }); }

  function idjiPredmetov(tabela, uid) {
    return db[tabela].filter(function (v) { return v.uporabnik_id === uid; }).map(function (v) { return v.predmet_id; });
  }
  function predmetiUporabnika(uid) {
    var u = najdi('uporabnik', uid);
    if (!u || u.vloga === 'admin') return [];
    var ids = idjiPredmetov(u.vloga === 'ucitelj' ? 'ucitelj_predmet' : 'vpis', uid);
    return predmeti().filter(function (p) { return ids.indexOf(p.id) >= 0; });
  }
  function uporabnikiPredmeta(tabela, pid) {
    var ids = db[tabela].filter(function (v) { return v.predmet_id === pid; }).map(function (v) { return v.uporabnik_id; });
    return db.uporabnik.filter(function (u) { return ids.indexOf(u.id) >= 0; }).sort(poImenu);
  }
  function poucuje(uid, pid) {
    return db.ucitelj_predmet.some(function (v) { return v.uporabnik_id === uid && v.predmet_id === pid; });
  }
  function obiskuje(uid, pid) {
    return db.vpis.some(function (v) { return v.uporabnik_id === uid && v.predmet_id === pid; });
  }
  function gradivaPredmeta(pid) {
    return db.gradivo.filter(function (g) { return g.predmet_id === pid; })
      .sort(function (a, b) { return b.datum_nalozitve.localeCompare(a.datum_nalozitve); });
  }
  function oddajePredmeta(pid) {
    return db.oddaja.filter(function (o) { return o.predmet_id === pid; })
      .sort(function (a, b) { return b.datum_oddaje.localeCompare(a.datum_oddaje); });
  }
  function oddajeUcenca(uid) {
    return db.oddaja.filter(function (o) { return o.ucenec_id === uid; })
      .sort(function (a, b) { return b.datum_oddaje.localeCompare(a.datum_oddaje); });
  }
  function poEmailu(email) {
    var e = E.normaliziraj(email);
    return db.uporabnik.filter(function (u) { return u.email === e; })[0] || null;
  }

  /* ---------- preverjanje vnosov ---------- */

  function preveriIme(vrednost, oznaka, polje) {
    var v = cisto(vrednost);
    if (!v) return napaka('Vpišite ' + oznaka + '.', polje);
    if (v.length > 50) return napaka(oznaka.charAt(0).toUpperCase() + oznaka.slice(1) + ' je predolgo (največ 50 znakov).', polje);
    if (!IME_VZOREC.test(v)) return napaka('Uporabite samo črke, presledek, vezaj ali opuščaj.', polje);
    return { ok: true, vrednost: v };
  }

  function preveriGeslo(geslo, obvezno) {
    if (!geslo) return obvezno ? napaka('Vpišite geslo.', 'geslo') : { ok: true };
    if (geslo.length < 8) return napaka('Geslo mora imeti najmanj 8 znakov.', 'geslo');
    if (geslo.length > 72) return napaka('Geslo je predolgo (največ 72 znakov).', 'geslo'); // omejitev bcrypt
    return { ok: true };
  }

  function preveriNaslov(naslov, polje) {
    var v = cisto(naslov);
    if (!v) return napaka('Vpišite naslov.', polje || 'naslov');
    if (v.length > 150) return napaka('Naslov je predolg (največ 150 znakov).', polje || 'naslov');
    return { ok: true, vrednost: v };
  }

  function preveriDatoteko(dat) {
    if (!dat) return napaka('Izberite datoteko.', 'datoteka');
    var k = koncnica(dat.ime);
    if (DATOTEKE.koncnice.indexOf(k) < 0) {
      return napaka('Končnica ».' + (k || '?') + '« ni dovoljena. Dovoljene: ' + DATOTEKE.koncnice.join(', ') + '.', 'datoteka');
    }
    if (!dat.velikost) return napaka('Datoteka je prazna.', 'datoteka');
    if (dat.velikost > DATOTEKE.najvec) return napaka('Datoteka je večja od 10 MB.', 'datoteka');
    return { ok: true, koncnica: k };
  }

  /* ---------- spremembe: predmeti ---------- */

  function shraniPredmet(vnos) {
    var naziv = cisto(vnos.naziv);
    var opis = cisto(vnos.opis);
    if (!naziv) return napaka('Vpišite naziv predmeta.', 'naziv');
    if (naziv.length > 100) return napaka('Naziv je predolg (največ 100 znakov).', 'naziv');
    if (opis.length > 500) return napaka('Opis je predolg (največ 500 znakov).', 'opis');
    var podvojen = db.predmet.filter(function (p) {
      return p.id !== vnos.id && p.naziv.toLocaleLowerCase('sl') === naziv.toLocaleLowerCase('sl');
    })[0];
    if (podvojen) return napaka('Predmet »' + podvojen.naziv + '« že obstaja.', 'naziv');

    var p;
    if (vnos.id) {
      p = najdi('predmet', vnos.id);
      if (!p) return napaka('Predmet ne obstaja več.');
      p.naziv = naziv; p.opis = opis;
    } else {
      db.zaporedje.predmet += 1;
      p = { id: db.zaporedje.predmet, naziv: naziv, opis: opis };
      db.predmet.push(p);
    }
    shrani();
    return { ok: true, predmet: p };
  }

  function poslediceBrisanjaPredmeta(pid) {
    var vpisani = db.vpis.filter(function (v) { return v.predmet_id === pid; }).map(function (v) { return v.uporabnik_id; });
    var podDve = vpisani.filter(function (uid) { return idjiPredmetov('vpis', uid).length - 1 < 2; }).length;
    return {
      ucitelji: db.ucitelj_predmet.filter(function (v) { return v.predmet_id === pid; }).length,
      vpisi: vpisani.length,
      gradiva: db.gradivo.filter(function (g) { return g.predmet_id === pid; }).length,
      oddaje: db.oddaja.filter(function (o) { return o.predmet_id === pid; }).length,
      ucenciPodDve: podDve
    };
  }

  function izbrisiPredmet(pid) {
    // ON DELETE CASCADE: ucitelj_predmet, vpis, gradivo, oddaja
    var ni = function (v) { return v.predmet_id !== pid; };
    db.predmet = db.predmet.filter(function (p) { return p.id !== pid; });
    db.ucitelj_predmet = db.ucitelj_predmet.filter(ni);
    db.vpis = db.vpis.filter(ni);
    db.gradivo = db.gradivo.filter(ni);
    db.oddaja = db.oddaja.filter(ni);
    shrani();
    return { ok: true };
  }

  /* ---------- spremembe: uporabniki ---------- */

  function shraniUporabnika(vnos) {
    var ime = preveriIme(vnos.ime, 'ime', 'ime'); if (!ime.ok) return ime;
    var priimek = preveriIme(vnos.priimek, 'priimek', 'priimek'); if (!priimek.ok) return priimek;
    var obstojec = vnos.id ? najdi('uporabnik', vnos.id) : null;
    if (vnos.id && !obstojec) return napaka('Uporabnik ne obstaja več.');
    var vloga = obstojec ? obstojec.vloga : vnos.vloga;

    var em = E.preveri(vnos.email, vloga);
    if (!em.ok) return napaka(em.napaka, 'email');
    var zaseden = db.uporabnik.some(function (u) { return u.email === em.email && u.id !== vnos.id; });
    if (zaseden) return napaka('E-poštni naslov je že zaseden.', 'email');

    var g = preveriGeslo(vnos.geslo, !obstojec); if (!g.ok) return g;

    var u = obstojec;
    if (!u) {
      db.zaporedje.uporabnik += 1;
      u = { id: db.zaporedje.uporabnik, vloga: vloga };
      db.uporabnik.push(u);
    }
    u.ime = ime.vrednost; u.priimek = priimek.vrednost; u.email = em.email;
    if (vnos.geslo) u.geslo_hash = zgosti(vnos.geslo);
    shrani();
    return { ok: true, uporabnik: u };
  }

  function poslediceBrisanjaUporabnika(uid) {
    return {
      predmeti: db.ucitelj_predmet.concat(db.vpis).filter(function (v) { return v.uporabnik_id === uid; }).length,
      oddaje: db.oddaja.filter(function (o) { return o.ucenec_id === uid; }).length,
      gradiva: db.gradivo.filter(function (g) { return g.nalozil_id === uid; }).length
    };
  }

  function izbrisiUporabnika(uid) {
    var ni = function (v) { return v.uporabnik_id !== uid; };
    db.uporabnik = db.uporabnik.filter(function (u) { return u.id !== uid; });
    db.ucitelj_predmet = db.ucitelj_predmet.filter(ni);
    db.vpis = db.vpis.filter(ni);
    db.oddaja = db.oddaja.filter(function (o) { return o.ucenec_id !== uid; });
    db.gradivo.forEach(function (g) { if (g.nalozil_id === uid) g.nalozil_id = null; }); // ON DELETE SET NULL
    if (Number(preberi(KLJUC_SEJA)) === uid) zapisi(KLJUC_SEJA, null);
    shrani();
    return { ok: true };
  }

  /* ---------- dodelitve ---------- */

  function nastaviPredmete(uid, predmetIds) {
    var u = najdi('uporabnik', uid);
    if (!u || u.vloga === 'admin') return napaka('Uporabnik ne obstaja ali nima predmetov.');
    var veljavni = predmetIds.filter(function (pid, i) { return najdi('predmet', pid) && predmetIds.indexOf(pid) === i; });
    if (u.vloga === 'ucenec' && veljavni.length < 2) return napaka('Učenec mora obiskovati najmanj 2 predmeta.', 'predmeti');
    var tabela = u.vloga === 'ucitelj' ? 'ucitelj_predmet' : 'vpis';
    db[tabela] = db[tabela].filter(function (v) { return v.uporabnik_id !== uid; })
      .concat(veljavni.map(function (pid) { return { uporabnik_id: uid, predmet_id: pid }; }));
    shrani();
    return { ok: true };
  }

  /* ---------- gradiva ---------- */

  function dodajGradivo(uciteljId, pid, naslov, dat) {
    if (!poucuje(uciteljId, pid)) return napaka('Gradivo lahko naložite samo pri predmetih, ki jih poučujete.');
    var n = preveriNaslov(naslov); if (!n.ok) return n;
    var f = preveriDatoteko(dat); if (!f.ok) return f;
    db.zaporedje.gradivo += 1;
    var g = {
      id: db.zaporedje.gradivo, predmet_id: pid, nalozil_id: uciteljId, naslov: n.vrednost,
      pot_datoteke: dat.ime, velikost: dat.velikost, datum_nalozitve: new Date().toISOString()
    };
    db.gradivo.push(g);
    shrani();
    return { ok: true, gradivo: g };
  }

  function izbrisiGradivo(uciteljId, gid) {
    var g = najdi('gradivo', gid);
    if (!g) return napaka('Gradivo ne obstaja več.');
    if (!poucuje(uciteljId, g.predmet_id)) return napaka('Nimate pravic za brisanje tega gradiva (403).');
    db.gradivo = db.gradivo.filter(function (x) { return x.id !== gid; });
    shrani();
    return { ok: true };
  }

  /* ---------- oddaje ---------- */

  function obstojecaOddaja(ucenecId, pid, naslov) {
    var n = cisto(naslov).toLocaleLowerCase('sl');
    return db.oddaja.filter(function (o) {
      return o.ucenec_id === ucenecId && o.predmet_id === pid && o.naslov_naloge.toLocaleLowerCase('sl') === n;
    })[0] || null;
  }

  /** Če naloga že obstaja in povozi ni true, vrne { ok:false, obstaja:true } (zahteva L5). */
  function oddajNalogo(ucenecId, pid, naslov, dat, povozi) {
    var u = najdi('uporabnik', ucenecId);
    if (!u || u.vloga !== 'ucenec') return napaka('Naloge lahko oddajajo samo učenci.');
    if (!obiskuje(ucenecId, pid)) return napaka('Nalogo lahko oddate samo pri predmetih, ki jih obiskujete.', 'predmet');
    var n = preveriNaslov(naslov, 'naslov'); if (!n.ok) return n;
    var f = preveriDatoteko(dat); if (!f.ok) return f;

    var staro = obstojecaOddaja(ucenecId, pid, n.vrednost);
    if (staro && !povozi) return { ok: false, obstaja: true, oddaja: staro };

    var o = staro;
    if (!o) {
      db.zaporedje.oddaja += 1;
      o = { id: db.zaporedje.oddaja, ucenec_id: ucenecId, predmet_id: pid, naslov_naloge: n.vrednost };
      db.oddaja.push(o);
    }
    o.pot_datoteke = imeOddaje(u, o.naslov_naloge, f.koncnica);
    o.velikost = dat.velikost;
    o.datum_oddaje = new Date().toISOString();
    shrani();
    return { ok: true, oddaja: o, povozeno: !!staro };
  }

  /* ---------- seja ---------- */

  function trenutni() {
    var id = Number(preberi(KLJUC_SEJA));
    return id ? najdi('uporabnik', id) : null;
  }

  function prijava(email, geslo) {
    var e = E.normaliziraj(email);
    if (!e) return napaka('Vpišite e-poštni naslov.', 'email');
    if (!E.vrstaRacuna(e)) {
      return napaka('Prijava je mogoča samo s šolskim naslovom (@' + E.DOMENA_DIJAK + ' ali @' + E.DOMENA_ZAPOSLENI + ').', 'email');
    }
    if (!geslo) return napaka('Vpišite geslo.', 'geslo');
    var u = poEmailu(e);
    if (!u || u.geslo_hash !== zgosti(geslo)) return napaka('E-poštni naslov ali geslo ni pravilno.', 'geslo');
    zapisi(KLJUC_SEJA, String(u.id));
    return { ok: true, uporabnik: u };
  }

  function odjava() { zapisi(KLJUC_SEJA, null); }

  function registriraj(vnos) {
    return shraniUporabnika({ ime: vnos.ime, priimek: vnos.priimek, email: vnos.email, geslo: vnos.geslo, vloga: 'ucenec' });
  }

  /* ---------- posnetek za »Razveljavi« in ponastavitev ---------- */

  function posnetek() { return JSON.stringify(db); }
  function obnovi(p) { db = JSON.parse(p); shrani(); }
  function ponastavi() { db = seme(); shrani(); }

  window.Podatki = {
    DATOTEKE: DATOTEKE,
    DEMO_GESLO: DEMO_GESLO,
    DEMO_RACUNI: {
      admin: 'admin@' + E.DOMENA_ZAPOSLENI,
      ucitelj: 'ana.horvat@' + E.DOMENA_ZAPOSLENI,
      ucenec: 'ana.novak@' + E.DOMENA_DIJAK
    },
    trajnaHramba: !!hramba,
    obNapisu: function (fn) { poslusalci.push(fn); },
    // poizvedbe
    uporabnik: function (id) { return najdi('uporabnik', id); },
    predmet: function (id) { return najdi('predmet', id); },
    gradivo: function (id) { return najdi('gradivo', id); },
    oddaja: function (id) { return najdi('oddaja', id); },
    uporabniki: uporabniki,
    predmeti: predmeti,
    predmetiUporabnika: predmetiUporabnika,
    uciteljiPredmeta: function (pid) { return uporabnikiPredmeta('ucitelj_predmet', pid); },
    ucenciPredmeta: function (pid) { return uporabnikiPredmeta('vpis', pid); },
    poucuje: poucuje,
    obiskuje: obiskuje,
    gradivaPredmeta: gradivaPredmeta,
    oddajePredmeta: oddajePredmeta,
    oddajeUcenca: oddajeUcenca,
    poEmailu: poEmailu,
    obstojecaOddaja: obstojecaOddaja,
    // preverjanje
    preveriDatoteko: preveriDatoteko,
    preveriGeslo: preveriGeslo,
    imeOddaje: imeOddaje,
    koncnica: koncnica,
    // spremembe
    shraniPredmet: shraniPredmet,
    poslediceBrisanjaPredmeta: poslediceBrisanjaPredmeta,
    izbrisiPredmet: izbrisiPredmet,
    shraniUporabnika: shraniUporabnika,
    poslediceBrisanjaUporabnika: poslediceBrisanjaUporabnika,
    izbrisiUporabnika: izbrisiUporabnika,
    nastaviPredmete: nastaviPredmete,
    dodajGradivo: dodajGradivo,
    izbrisiGradivo: izbrisiGradivo,
    oddajNalogo: oddajNalogo,
    // seja
    trenutni: trenutni,
    prijava: prijava,
    odjava: odjava,
    registriraj: registriraj,
    // drugo
    posnetek: posnetek,
    obnovi: obnovi,
    ponastavi: ponastavi
  };
})();
