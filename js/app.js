/*
 * Šolski IS – uporabniški vmesnik prototipa
 * -----------------------------------------
 * Poti so enake kot v tehnični dokumentaciji (poglavje 8), npr. #/admin/predmeti.
 * Vsa besedila uporabnikov se pred izpisom ubežijo (funkcija h), da ni XSS.
 */
(function () {
  'use strict';

  var P = window.Podatki;
  var E = window.SolskiEmail;

  /* ================================================================
     Pomožne funkcije
     ================================================================ */

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const h = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (z) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]
  ));
  const iskalno = (s) => E.brezSumnikov(s).toLowerCase();
  const manjGibanja = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fDatum = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const fUra = new Intl.DateTimeFormat('sl-SI', { hour: '2-digit', minute: '2-digit' });
  const fDecimalno = new Intl.NumberFormat('sl-SI', { maximumFractionDigits: 1 });
  const datum = (iso) => fDatum.format(new Date(iso));
  const datumUra = (iso) => datum(iso) + ', ' + fUra.format(new Date(iso));

  function velikost(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
    return fDecimalno.format(b / 1024 / 1024) + ' MB';
  }

  // Slovenske oblike: 1 predmet, 2 predmeta, 3 predmeti, 5 predmetov
  function sklon(n) {
    const o = n % 100;
    return o === 1 ? 0 : o === 2 ? 1 : (o === 3 || o === 4) ? 2 : 3;
  }
  const st = (n, oblike) => n + ' ' + oblike[sklon(n)];
  const OBLIKE = {
    predmet: ['predmet', 'predmeta', 'predmeti', 'predmetov'],
    ucitelj: ['učitelj', 'učitelja', 'učitelji', 'učiteljev'],
    ucenec: ['učenec', 'učenca', 'učenci', 'učencev'],
    gradivo: ['gradivo', 'gradivi', 'gradiva', 'gradiv'],
    oddaja: ['oddaja', 'oddaji', 'oddaje', 'oddaj'],
    zadetek: ['zadetek', 'zadetka', 'zadetki', 'zadetkov'],
    vpis: ['vpis', 'vpisa', 'vpisi', 'vpisov'],
    dodelitev: ['dodelitev', 'dodelitvi', 'dodelitve', 'dodelitev'],
    znak: ['znak', 'znaka', 'znaki', 'znakov']
  };
  function izbraniPredmeti(n) {
    return ['Izbran je ', 'Izbrana sta ', 'Izbrani so ', 'Izbranih je '][sklon(n)] + st(n, OBLIKE.predmet) + '.';
  }

  const VLOGE = { admin: 'Administrator', ucitelj: 'Učitelj', ucenec: 'Učenec' };
  const polnoIme = (u) => (u.vloga === 'admin' ? 'Administrator' : u.ime + ' ' + u.priimek);
  const obrnjenoIme = (u) => u.priimek + ' ' + u.ime;
  const inicialke = (u) => (u.vloga === 'admin' ? 'A' : (u.ime[0] || '') + (u.priimek[0] || '')).toUpperCase();

  // Vsak predmet ima svojo barvo »ovitka zvezka«, ki je enaka v vseh pogledih.
  const ODTENKI = [352, 214, 28, 268, 46, 12, 152, 232, 186, 312];
  const odtenek = (id) => (ODTENKI[(id - 1) % ODTENKI.length] + Math.floor((id - 1) / ODTENKI.length) * 23) % 360;
  const znacka = (p) => '<span class="predmet" style="--h:' + odtenek(p.id) + '">' + h(p.naziv) + '</span>';

  let stevecId = 0;
  const novId = (p) => p + '-' + (++stevecId);

  /* ---------- ikone (inline SVG, brez zunanjih knjižnic) ---------- */

  const ZNAK = '<svg class="znak-slika" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">' +
    '<rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="var(--list)" stroke="var(--crnilo)" stroke-width="1.6"/>' +
    '<path d="M2.5 9h19M2.5 15h19M10.5 2.5v19M16 2.5v19" stroke="var(--crnilo)" stroke-opacity=".3" stroke-width="1"/>' +
    '<path d="M6.5 2.5v19" stroke="var(--rdece)" stroke-width="1.6"/></svg>';
  const IKONA = {
    meni: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    isci: '<svg class="iskalnik-ikona" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    luna: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    sonce: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    zapri: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* ================================================================
     Datoteke v pomnilniku (samo za to sejo; prototip nima strežnika)
     ================================================================ */

  const datoteke = new Map();

  function prenesi(ime, kljuc) {
    const f = datoteke.get(kljuc);
    const blob = f || new Blob([
      'Šolski IS – prototip\n\n' +
      'To je nadomestna datoteka za »' + ime + '«.\n' +
      'V pravi aplikaciji strežnik najprej preveri pravice uporabnika in šele nato pošlje datoteko.\n'
    ], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f ? ime : ime + '.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (!f) obvestilo('Prototip ne hrani datotek, zato se prenese nadomestna datoteka .txt.');
  }

  /* ================================================================
     Obvestila (toast)
     ================================================================ */

  function obvestilo(besedilo, moznosti = {}) {
    const vrsta = moznosti.vrsta || 'ok';
    const el = document.createElement('div');
    el.className = 'obvestilo obvestilo-' + vrsta;
    el.innerHTML = '<p>' + h(besedilo) + '</p>' +
      (moznosti.akcija ? '<button type="button" class="obvestilo-akcija">' + h(moznosti.akcija.oznaka) + '</button>' : '') +
      '<button type="button" class="obvestilo-zapri" aria-label="Zapri obvestilo">' + IKONA.zapri + '</button>';
    const zapri = () => {
      el.classList.add('odhaja');
      setTimeout(() => el.remove(), manjGibanja() ? 0 : 180);
    };
    if (moznosti.akcija) {
      $('.obvestilo-akcija', el).addEventListener('click', () => { zapri(); moznosti.akcija.fn(); });
    }
    $('.obvestilo-zapri', el).addEventListener('click', zapri);
    const seznam = $('#obvestila');
    seznam.append(el);
    while (seznam.children.length > 3) seznam.firstElementChild.remove();
    setTimeout(zapri, moznosti.akcija ? 9000 : 5000);
  }

  /* ================================================================
     Dialog (<dialog>: ujame fokus, zapre se z Esc)
     ================================================================ */

  function odpriDialog(o) {
    const d = $('#dialog');
    if (d.open) d.close();
    const prej = document.activeElement;
    d.className = 'dialog' + (o.nevarno ? ' dialog-nevarno' : '');
    d.innerHTML =
      '<form class="dialog-obrazec" novalidate>' +
        '<h2 class="dialog-naslov" id="dialog-naslov">' + h(o.naslov) + '</h2>' +
        '<div class="dialog-telo">' + (o.telo || '') + '</div>' +
        '<p class="obrazec-napaka" role="alert" hidden></p>' +
        '<div class="dialog-gumbi">' +
          '<button type="button" class="gumb" data-preklici>' + h(o.preklici || 'Prekliči') + '</button>' +
          '<button type="submit" class="gumb ' + (o.nevarno ? 'gumb-nevarno' : 'gumb-glavni') + '">' + h(o.potrdi || 'Shrani') + '</button>' +
        '</div>' +
      '</form>';

    return new Promise((resolve) => {
      const obrazec = $('form', d);
      let koncano = false;
      let dolNaOzadju = false;
      const zakljuci = (vrednost) => {
        if (koncano) return;
        koncano = true;
        d.close();
        resolve(vrednost);
        if (prej && prej.focus && document.contains(prej)) prej.focus();
      };
      obrazec.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = o.obOddaji ? o.obOddaji(obrazec) : true;
        if (r === false) return;
        zakljuci(r === undefined ? true : r);
      });
      $('[data-preklici]', d).addEventListener('click', () => zakljuci(null));
      d.oncancel = (e) => { e.preventDefault(); zakljuci(null); };
      d.onmousedown = (e) => { dolNaOzadju = e.target === d; };
      d.onclick = (e) => { if (e.target === d && dolNaOzadju) zakljuci(null); };
      d.showModal();
      if (o.obOdprtju) o.obOdprtju(obrazec);
      const prvi = o.nevarno ? $('[data-preklici]', d) : $('input:not([type=hidden]), select, textarea', obrazec);
      (prvi || $('button[type=submit]', d)).focus();
    });
  }

  /* ================================================================
     Polja obrazcev in napake
     ================================================================ */

  function polje(o) {
    const id = novId('f-' + o.ime);
    return '<div class="polje" data-polje="' + o.ime + '">' +
      '<label for="' + id + '">' + h(o.oznaka) + (o.neobvezno ? ' <span class="neobvezno">(neobvezno)</span>' : '') + '</label>' +
      (o.vrsta === 'besedilo'
        ? '<textarea id="' + id + '" name="' + o.ime + '" rows="3" aria-describedby="' + id + '-n ' + id + '-e" ' + (o.atributi || '') + '>' + h(o.vrednost) + '</textarea>'
        : '<input id="' + id + '" name="' + o.ime + '" type="' + (o.tip || 'text') + '" value="' + h(o.vrednost) + '" aria-describedby="' + id + '-n ' + id + '-e" ' + (o.atributi || '') + '>') +
      '<p class="polje-namig" id="' + id + '-n">' + (o.namig || '') + '</p>' +
      '<p class="polje-napaka" id="' + id + '-e" hidden></p>' +
    '</div>';
  }

  function poljeGeslo(o) {
    const id = novId('f-' + o.ime);
    return '<div class="polje" data-polje="' + o.ime + '">' +
      '<label for="' + id + '">' + h(o.oznaka) + (o.neobvezno ? ' <span class="neobvezno">(neobvezno)</span>' : '') + '</label>' +
      '<div class="geslo-vnos">' +
        '<input id="' + id + '" name="' + o.ime + '" type="password" autocomplete="' + (o.auto || 'new-password') + '" aria-describedby="' + id + '-n ' + id + '-e" maxlength="72">' +
        '<button type="button" class="prikazi-geslo" aria-controls="' + id + '" aria-pressed="false">Pokaži</button>' +
      '</div>' +
      '<p class="polje-namig" id="' + id + '-n">' + (o.namig || '') + '</p>' +
      '<p class="polje-napaka" id="' + id + '-e" hidden></p>' +
    '</div>';
  }

  /** Polje za e-pošto z vnaprej določeno šolsko domeno glede na vlogo. */
  function poljeEmail(o) {
    const id = novId('f-email');
    const domena = E.domenaZaVlogo(o.vloga);
    const lokalni = o.vrednost ? E.razdeli(o.vrednost).lokalni : '';
    const namig = o.vloga === 'ucenec'
      ? 'Vpišite del pred @. Dijaški naslov se vedno konča z @' + domena + '.'
      : 'Vpišite del pred @. Naslov zaposlenega se vedno konča z @' + domena + '.';
    return '<div class="polje" data-polje="email" data-vloga="' + o.vloga + '">' +
      '<label for="' + id + '">' + h(o.oznaka || 'E-poštni naslov') + '</label>' +
      '<div class="email-vnos">' +
        '<input id="' + id + '" name="email_lokalni" type="text" value="' + h(lokalni) + '" placeholder="ime.priimek" ' +
          'autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="email" maxlength="80" ' +
          'aria-describedby="' + id + '-d ' + id + '-n ' + id + '-e">' +
        '<span class="email-domena" id="' + id + '-d">@' + domena + '</span>' +
      '</div>' +
      '<p class="polje-namig" id="' + id + '-n">' + namig + '</p>' +
      '<p class="polje-napaka" id="' + id + '-e" hidden></p>' +
    '</div>';
  }

  function poljeDatoteka() {
    const id = novId('f-dat');
    const konc = P.DATOTEKE.koncnice;
    return '<div class="polje" data-polje="datoteka">' +
      '<span class="oznaka" id="' + id + '-o">Datoteka</span>' +
      '<div class="spusti">' +
        '<input type="file" id="' + id + '" name="datoteka" accept="' + konc.map((k) => '.' + k).join(',') + '" ' +
          'aria-labelledby="' + id + '-o" aria-describedby="' + id + '-n ' + id + '-e">' +
        '<span class="spusti-besedilo"><strong>Izberite datoteko</strong> ali jo povlecite sem</span>' +
        '<span class="spusti-izbrano" hidden></span>' +
      '</div>' +
      '<p class="polje-namig" id="' + id + '-n">Do 10 MB. Dovoljene končnice: ' + konc.join(', ') + '.</p>' +
      '<p class="polje-napaka" id="' + id + '-e" hidden></p>' +
    '</div>';
  }

  /** E-poštni naslov, ki se lahko prelomi samo pred @, domena pa ostane cela. */
  const emailHtml = (e) => { const d = E.razdeli(e); return d.domena === null ? h(e) : h(d.lokalni) + '<wbr><span class="brez-preloma">@' + h(d.domena) + '</span>'; };

  /** Besedilo z e-poštnimi domenami, ki se ne prelomijo pri vezaju (@sc-celje.si). */
  const zDomenami = (besedilo) => h(besedilo).replace(/@[a-z0-9.-]+[a-z0-9]/g, (m) => '<span class="brez-preloma">' + m + '</span>');

  function pocisti(obrazec) {
    $$('.polje-napaka', obrazec).forEach((p) => { p.hidden = true; p.textContent = ''; });
    $$('[aria-invalid]', obrazec).forEach((v) => v.removeAttribute('aria-invalid'));
    const s = $('.obrazec-napaka', obrazec);
    if (s) { s.hidden = true; s.textContent = ''; }
  }

  function pokaziNapako(obrazec, ime, besedilo) {
    const ovoj = ime && $('[data-polje="' + ime + '"]', obrazec);
    if (!ovoj) {
      const s = $('.obrazec-napaka', obrazec);
      if (s) { s.textContent = besedilo; s.hidden = false; } else obvestilo(besedilo, { vrsta: 'napaka' });
      return;
    }
    const p = $('.polje-napaka', ovoj);
    p.innerHTML = zDomenami(besedilo);
    p.hidden = false;
    const vnos = $('input, select, textarea', ovoj);
    if (vnos) { vnos.setAttribute('aria-invalid', 'true'); vnos.focus(); }
  }

  function emailIzObrazca(obrazec) {
    const ovoj = $('[data-polje="email"]', obrazec);
    const v = $('input', ovoj).value.trim().toLowerCase();
    // Če je uporabnik vpisal celoten naslov z drugo domeno, ga pošljemo takega, da preverjanje javi pravo napako.
    return v.includes('@') ? v : v + '@' + E.domenaZaVlogo(ovoj.dataset.vloga);
  }

  /** Samodejni predlog naslova iz imena in priimka, opozorila o napačni domeni in zasedenosti. */
  function veziEmail(obrazec, izjemaId) {
    const ovoj = $('[data-polje="email"]', obrazec);
    if (!ovoj) return;
    const vnos = $('input', ovoj);
    const napakaEl = $('.polje-napaka', ovoj);
    const vloga = ovoj.dataset.vloga;
    const domena = E.domenaZaVlogo(vloga);
    const ime = obrazec.elements.ime;
    const priimek = obrazec.elements.priimek;
    let rocno = !!vnos.value;

    const nastavi = (besedilo) => {
      napakaEl.innerHTML = besedilo ? zDomenami(besedilo) : '';
      napakaEl.hidden = !besedilo;
      if (besedilo) vnos.setAttribute('aria-invalid', 'true'); else vnos.removeAttribute('aria-invalid');
    };
    const zasedenost = () => {
      if (!vnos.value || vnos.value.includes('@')) return null;
      const drug = P.poEmailu(vnos.value + '@' + domena);
      return drug && drug.id !== izjemaId
        ? 'Naslov ' + vnos.value + '@' + domena + ' je že zaseden. Dodajte številko, npr. ' + vnos.value + '2.'
        : null;
    };
    const odreziDomeno = () => {
      const d = E.razdeli(vnos.value);
      if (d.domena !== null && (d.domena === '' || domena.startsWith(d.domena))) vnos.value = d.lokalni;
    };

    vnos.addEventListener('input', () => {
      rocno = vnos.value !== '';
      const d = E.razdeli(vnos.value);
      if (d.domena === null) return nastavi(zasedenost());
      if (d.domena === domena) { vnos.value = d.lokalni; return nastavi(zasedenost()); }
      if (domena.startsWith(d.domena)) return nastavi(null);
      nastavi(E.preveri(vnos.value, vloga).napaka);
    });
    vnos.addEventListener('blur', () => { odreziDomeno(); if (!napakaEl.hidden) return; nastavi(zasedenost()); });

    const samodejno = () => {
      if (rocno) return;
      vnos.value = E.lokalniIzImena(ime.value, priimek.value);
      nastavi(zasedenost());
    };
    if (ime) ime.addEventListener('input', samodejno);
    if (priimek) priimek.addEventListener('input', samodejno);
  }

  function veziDatoteko(obrazec, obSpremembi) {
    const ovoj = $('[data-polje="datoteka"]', obrazec);
    const vnos = $('input[type=file]', ovoj);
    const cona = $('.spusti', ovoj);
    const besedilo = $('.spusti-besedilo', ovoj);
    const izbrano = $('.spusti-izbrano', ovoj);
    const napakaEl = $('.polje-napaka', ovoj);

    const posodobi = () => {
      const f = vnos.files[0];
      napakaEl.hidden = true;
      vnos.removeAttribute('aria-invalid');
      cona.classList.toggle('ima', !!f);
      besedilo.hidden = !!f;
      izbrano.hidden = !f;
      if (f) {
        izbrano.innerHTML = '<strong>' + h(f.name) + '</strong> <span>' + velikost(f.size) + '</span> <span class="spusti-zamenjaj">Zamenjaj</span>';
        const r = P.preveriDatoteko({ ime: f.name, velikost: f.size });
        if (!r.ok) { napakaEl.textContent = r.napaka; napakaEl.hidden = false; vnos.setAttribute('aria-invalid', 'true'); }
      }
      if (obSpremembi) obSpremembi(f || null);
    };
    vnos.addEventListener('change', posodobi);
    ['dragenter', 'dragover'].forEach((t) => cona.addEventListener(t, () => cona.classList.add('vlecem')));
    ['dragleave', 'drop'].forEach((t) => cona.addEventListener(t, () => cona.classList.remove('vlecem')));
    return {
      datoteka: () => vnos.files[0] || null,
      pocisti: () => { vnos.value = ''; posodobi(); }
    };
  }

  /* ================================================================
     Gradniki strani
     ================================================================ */

  function glavaStrani(naslov, podnaslov, dejanje) {
    return '<div class="stran-glava">' +
      '<div><h1>' + h(naslov) + '</h1>' + (podnaslov ? '<p class="podnaslov">' + podnaslov + '</p>' : '') + '</div>' +
      (dejanje || '') +
    '</div>';
  }

  function orodja(placeholder, oznaka) {
    const id = novId('isci');
    return '<div class="orodja">' +
      '<div class="iskalnik">' +
        '<label class="sr-only" for="' + id + '">' + h(oznaka) + '</label>' + IKONA.isci +
        '<input id="' + id + '" type="search" data-iskanje placeholder="' + h(placeholder) + '" autocomplete="off">' +
        '<kbd class="bliznjica" title="Bližnjica za iskanje">/</kbd>' +
      '</div>' +
      '<p class="stevilo-zadetkov" aria-live="polite"></p>' +
    '</div>';
  }

  function dejanja(id, opis, moznosti = {}) {
    return '<div class="dejanja-gumbi">' +
      (moznosti.prenesi ? '<button type="button" class="gumb gumb-tih" data-akcija="prenesi" data-id="' + id + '" aria-label="Prenesi ' + h(opis) + '">Prenesi</button>' : '') +
      (moznosti.brezUrejanja ? '' : '<button type="button" class="gumb gumb-tih" data-akcija="uredi" data-id="' + id + '" aria-label="Uredi ' + h(opis) + '">Uredi</button>') +
      (moznosti.brezBrisanja ? '' : '<button type="button" class="gumb gumb-tih nevarno" data-akcija="izbrisi" data-id="' + id + '" aria-label="Izbriši ' + h(opis) + '">Izbriši</button>') +
    '</div>';
  }

  function prazno(naslov, besedilo, dejanje, nivo) {
    const n = nivo || 'h2';
    return '<div class="prazno"><' + n + '>' + h(naslov) + '</' + n + '><p>' + besedilo + '</p>' + (dejanje || '') + '</div>';
  }

  function oznaciVrstico(koren, id) {
    requestAnimationFrame(() => {
      const tr = $('tr[data-id="' + id + '"]', koren);
      if (!tr) return;
      tr.classList.remove('sveze');
      void tr.offsetWidth;
      tr.classList.add('sveze');
      tr.scrollIntoView({ block: 'nearest', behavior: manjGibanja() ? 'auto' : 'smooth' });
    });
  }

  /**
   * Tabela z iskanjem, razvrščanjem in strani.
   * stolpci: [{ kljuc, oznaka, celica(v), razvrsti?(v), razred? }]
   */
  function tabela(ovoj, o) {
    const s = { q: '', kljuc: o.razvrsti ? o.razvrsti[0] : null, smer: o.razvrsti ? o.razvrsti[1] : 1, stran: 1 };
    ovoj.innerHTML =
      '<div class="tabela-ovoj"><table class="tabela"><caption class="sr-only">' + h(o.napis) + '</caption>' +
      '<thead></thead><tbody></tbody></table></div>' +
      '<nav class="strani" aria-label="Strani tabele" hidden></nav>';
    const thead = $('thead', ovoj);
    const tbody = $('tbody', ovoj);
    const strani = $('.strani', ovoj);

    function izrisi() {
      const vse = o.vrstice();
      const q = iskalno(s.q.trim());
      let vidne = q ? vse.filter((v) => iskalno(o.iskanje(v)).includes(q)) : vse.slice();
      const stolpec = o.stolpci.find((c) => c.kljuc === s.kljuc);
      if (stolpec && stolpec.razvrsti) {
        vidne.sort((a, b) => {
          const x = stolpec.razvrsti(a), y = stolpec.razvrsti(b);
          return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'sl')) * s.smer;
        });
      }
      const naStran = o.naStran || vidne.length || 1;
      const vseStrani = Math.max(1, Math.ceil(vidne.length / naStran));
      s.stran = Math.min(s.stran, vseStrani);
      const odsek = vidne.slice((s.stran - 1) * naStran, s.stran * naStran);

      thead.innerHTML = '<tr>' + o.stolpci.map((c) => {
        if (!c.razvrsti) return '<th scope="col" class="' + (c.razred || '') + '">' + c.oznaka + '</th>';
        const aktiven = c.kljuc === s.kljuc;
        const aria = aktiven ? (s.smer === 1 ? 'ascending' : 'descending') : 'none';
        return '<th scope="col" class="' + (c.razred || '') + '" aria-sort="' + aria + '">' +
          '<button type="button" class="razvrsti" data-kljuc="' + c.kljuc + '">' + c.oznaka +
          '<span class="razvrsti-smer" aria-hidden="true">' + (aktiven ? (s.smer === 1 ? '▲' : '▼') : '') + '</span></button></th>';
      }).join('') + '</tr>';

      tbody.innerHTML = odsek.length
        ? odsek.map((v) => '<tr data-id="' + v.id + '">' + o.stolpci.map((c) =>
            '<td class="' + (c.razred || '') + '" data-oznaka="' + h(c.oznakaMobilno !== undefined ? c.oznakaMobilno : c.oznaka) + '">' + c.celica(v) + '</td>').join('') + '</tr>').join('')
        : '<tr class="vrstica-prazna"><td colspan="' + o.stolpci.length + '">' +
            (q ? 'Ni zadetkov za »' + h(s.q.trim()) + '«.' : (o.prazno || 'Ni zapisov.')) + '</td></tr>';

      strani.hidden = vseStrani <= 1;
      strani.innerHTML = vseStrani <= 1 ? '' :
        '<button type="button" class="gumb" data-stran="' + (s.stran - 1) + '"' + (s.stran === 1 ? ' disabled' : '') + '>Prejšnja</button>' +
        '<span>Stran ' + s.stran + ' od ' + vseStrani + '</span>' +
        '<button type="button" class="gumb" data-stran="' + (s.stran + 1) + '"' + (s.stran === vseStrani ? ' disabled' : '') + '>Naslednja</button>';

      if (o.obStevilu) o.obStevilu(vidne.length, vse.length, !!q);
    }

    thead.addEventListener('click', (e) => {
      const g = e.target.closest('[data-kljuc]');
      if (!g) return;
      if (s.kljuc === g.dataset.kljuc) s.smer *= -1; else { s.kljuc = g.dataset.kljuc; s.smer = 1; }
      izrisi();
      $('[data-kljuc="' + s.kljuc + '"]', thead).focus();
    });
    strani.addEventListener('click', (e) => {
      const g = e.target.closest('[data-stran]');
      if (!g || g.disabled) return;
      s.stran = Number(g.dataset.stran);
      izrisi();
      ovoj.scrollIntoView({ block: 'start', behavior: manjGibanja() ? 'auto' : 'smooth' });
    });

    izrisi();
    return { izrisi, isci: (q) => { s.q = q; s.stran = 1; izrisi(); } };
  }

  function veziIskanje(stran, tbl) {
    const vnos = $('[data-iskanje]', stran);
    if (vnos) vnos.addEventListener('input', () => tbl.isci(vnos.value));
  }

  function stevec(stran, oblike) {
    return (n, vse, iskanje) => {
      const el = $('.stevilo-zadetkov', stran);
      if (el) el.textContent = iskanje ? st(n, OBLIKE.zadetek) + ' od ' + vse : st(vse, oblike);
    };
  }

  /* ================================================================
     Usmerjanje (hash) in avtorizacija po vlogah
     ================================================================ */

  const MENI = {
    admin: [
      ['/admin/predmeti', 'Predmeti', () => P.predmeti().length],
      ['/admin/ucitelji', 'Učitelji', () => P.uporabniki('ucitelj').length],
      ['/admin/ucenci', 'Učenci', () => P.uporabniki('ucenec').length],
      ['/admin/dodelitve', 'Dodelitve']
    ],
    ucitelj: [['/ucitelj/gradiva', 'Gradiva'], ['/ucitelj/oddaje', 'Oddane naloge']],
    ucenec: [['/ucenec/predmeti', 'Moji predmeti'], ['/ucenec/gradiva', 'Gradiva'], ['/ucenec/oddaja', 'Oddaja nalog'], ['/ucenec/profil', 'Profil']]
  };
  const DOMOV = { admin: '/admin/predmeti', ucitelj: '/ucitelj/gradiva', ucenec: '/ucenec/predmeti' };

  // Stari naslovi iz HTML/CSS prototipa (#a-predmeti ...) še vedno delujejo.
  const STARE_POTI = {
    prijava: '/prijava', registracija: '/registracija', dok: '/dokumentacija',
    'a-predmeti': '/admin/predmeti', 'a-ucitelji': '/admin/ucitelji', 'a-ucenci': '/admin/ucenci', 'a-dodelitve': '/admin/dodelitve',
    't-gradiva': '/ucitelj/gradiva', 't-oddaje': '/ucitelj/oddaje',
    'u-profil': '/ucenec/profil', 'u-predmeti': '/ucenec/predmeti', 'u-gradiva': '/ucenec/gradiva', 'u-oddaja': '/ucenec/oddaja'
  };

  let POTI = {};
  let namen = null;
  let prviIzris = true;

  function preberiPot() {
    const surovo = decodeURIComponent(location.hash.slice(1));
    if (STARE_POTI[surovo]) return { pot: STARE_POTI[surovo], param: new URLSearchParams(), staro: true };
    if (!surovo.startsWith('/')) return { pot: '', param: new URLSearchParams() };
    const i = surovo.indexOf('?');
    const pot = (i < 0 ? surovo : surovo.slice(0, i)).replace(/\/+$/, '');
    return { pot: pot || '', param: new URLSearchParams(i < 0 ? '' : surovo.slice(i + 1)) };
  }

  function pojdi(pot, zamenjaj) {
    const cilj = '#' + pot;
    if (location.hash === cilj) izrisi();
    else if (zamenjaj) location.replace(cilj);
    else location.hash = pot;
  }

  function izrisi() {
    const { pot, param, staro } = preberiPot();
    const u = P.trenutni();
    document.body.classList.remove('meni-odprt');
    if (staro) return pojdi(pot, true);
    if (!pot) return pojdi(u ? DOMOV[u.vloga] : '/prijava', true);

    const r = POTI[pot];
    if (r && !r.javno && !u) {
      namen = location.hash;
      obvestilo('Za ogled te strani se prijavite.');
      return pojdi('/prijava', true);
    }
    if (r && r.samoOdjavljen && u) return pojdi(DOMOV[u.vloga], true);

    // Stran najprej pripnemo v dokument, da pogledi lahko iščejo elemente po id.
    const koren = $('#vsebina');
    const stran = document.createElement('div');
    stran.className = 'stran';
    koren.replaceChildren(stran);
    izrisiGlavo(u, pot);
    document.body.dataset.pot = pot;
    let naslov;

    if (!r) {
      naslov = 'Strani ni mogoče najti';
      stran.innerHTML = '<div class="okvir">' + prazno(naslov, 'Naslov »' + h(location.hash) + '« ne obstaja.',
        '<a class="gumb gumb-glavni" href="#/">Na začetno stran</a>', 'h1') + '</div>';
    } else if (r.vloga && u.vloga !== r.vloga) {
      naslov = 'Nimate dostopa';
      stran.innerHTML = '<div class="okvir">' + prazno('Nimate dostopa do te strani',
        'Stran je namenjena vlogi »' + VLOGE[r.vloga] + '«. Prijavljeni ste kot ' + h(polnoIme(u)) + ' (' + VLOGE[u.vloga].toLowerCase() + '). ' +
        'V pravi aplikaciji strežnik v tem primeru vrne napako 403.',
        '<a class="gumb gumb-glavni" href="#' + DOMOV[u.vloga] + '">Na mojo začetno stran</a>', 'h1') + '</div>';
    } else {
      naslov = r.naslov;
      r.pogled(stran, param, u);
    }

    document.title = naslov + ' – Šolski IS';

    if (!prviIzris) {
      window.scrollTo(0, 0);
      const h1 = $('h1', stran);
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
    prviIzris = false;
  }

  /* ================================================================
     Glava, noga, tema
     ================================================================ */

  function tema() {
    return document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function izrisiGlavo(u, pot) {
    const meni = u ? MENI[u.vloga] : [];
    const temno = tema() === 'dark';
    const povezava = (p, oznaka, stevilo) => '<a href="#' + p + '"' + (p === pot ? ' aria-current="page"' : '') + '>' +
      '<span>' + oznaka + '</span>' + (stevilo ? '<span class="stevec">' + stevilo() + '</span>' : '') + '</a>';

    $('#glava').innerHTML =
      '<div class="glava-vrstica okvir">' +
        '<a class="znak" href="#/">' + ZNAK + '<span>Šolski IS</span></a>' +
        '<span class="prototip" title="Podatki se hranijo samo v tem brskalniku">Prototip</span>' +
        (u ? '<button type="button" class="gumb gumb-tih meni-gumb" aria-expanded="false" aria-controls="glavni-meni">' + IKONA.meni + '<span>Meni</span></button>' : '') +
        '<nav class="meni' + (u ? '' : ' meni-javen') + '" id="glavni-meni" aria-label="Glavni meni">' +
          meni.map((m) => povezava(m[0], m[1], m[2])).join('') +
          povezava('/dokumentacija', 'Dokumentacija') +
        '</nav>' +
        '<div class="glava-desno">' +
          '<button type="button" class="gumb gumb-ikona" data-tema aria-label="' + (temno ? 'Vklopi svetli način' : 'Vklopi temni način') + '" title="' + (temno ? 'Svetli način' : 'Temni način') + '">' +
            (temno ? IKONA.sonce : IKONA.luna) + '</button>' +
          (u ? uporabniskiMeni(u)
             : (pot !== '/prijava' ? '<a class="gumb" href="#/prijava">Prijava</a>' : '')) +
        '</div>' +
      '</div>';
  }

  function uporabniskiMeni(u) {
    return '<details class="uporabnik">' +
      '<summary aria-label="Uporabniški meni: ' + h(polnoIme(u)) + '">' +
        '<span class="avatar" aria-hidden="true">' + h(inicialke(u)) + '</span>' +
        '<span class="uporabnik-ime">' + h(polnoIme(u)) + '</span>' +
      '</summary>' +
      '<div class="uporabnik-plosca">' +
        '<p class="uporabnik-podatki"><strong>' + h(polnoIme(u)) + '</strong><span class="email">' + emailHtml(u.email) + '</span></p>' +
        '<p class="vloga">' + VLOGE[u.vloga] + '</p>' +
        (u.vloga === 'ucenec' ? '<a class="gumb gumb-tih" href="#/ucenec/profil">Uredi profil</a>' : '') +
        '<button type="button" class="gumb" data-odjava>Odjava</button>' +
      '</div>' +
    '</details>';
  }

  function izrisiNogo() {
    $('#noga').innerHTML =
      '<div class="okvir noga-vrstica">' +
        '<p>Prototip pri predmetu RPS. ' + (P.trajnaHramba
          ? 'Podatki se hranijo samo v tem brskalniku.'
          : 'Brskalnik ne dovoli shranjevanja, zato se spremembe ob osvežitvi izgubijo.') + '</p>' +
        '<button type="button" class="gumb gumb-tih" data-ponastavi>Ponastavi demo podatke</button>' +
      '</div>';
  }

  /* ================================================================
     Prijava in registracija
     ================================================================ */

  function pogledPrijava(stran, param) {
    stran.innerHTML =
      '<section class="zvezek">' +
        '<div class="okvir zvezek-notranji">' +
          '<div class="zvezek-uvod">' +
            '<h1 class="zvezek-naslov">Gradiva, naloge in predmeti na enem mestu.</h1>' +
            '<p class="zvezek-opis">Učitelji nalagajo gradiva, dijaki oddajajo naloge, administrator ureja predmete in dodelitve.</p>' +
          '</div>' +
          '<div class="demo">' +
              '<h2>Demo računi</h2>' +
              '<p>Za predstavitev se prijavite z enim klikom. Vsi računi imajo geslo <mark>' + P.DEMO_GESLO + '</mark>.</p>' +
              '<div class="demo-racuni">' +
                ['admin', 'ucitelj', 'ucenec'].map((v) =>
                  '<button type="button" class="demo-racun" data-demo="' + v + '">' +
                    '<span class="demo-vloga">' + VLOGE[v] + '</span><span class="demo-email">' + emailHtml(P.DEMO_RACUNI[v]) + '</span>' +
                  '</button>').join('') +
              '</div>' +
          '</div>' +
          '<div class="list prijava-list">' +
            '<h2>Prijava</h2>' +
            '<form class="obrazec" novalidate>' +
              '<div class="polje" data-polje="email">' +
                '<label for="p-email">Šolski e-poštni naslov</label>' +
                '<div class="vnos-pecat">' +
                  '<input id="p-email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" ' +
                    'placeholder="ime.priimek@dijak.sc-celje.si" maxlength="100" aria-describedby="p-email-stanje p-email-e">' +
                  '<span class="pecat" aria-hidden="true" hidden></span>' +
                '</div>' +
                '<div class="predlogi" hidden></div>' +
                '<p class="polje-namig" id="p-email-stanje" aria-live="polite"></p>' +
                '<p class="polje-napaka" id="p-email-e" hidden></p>' +
              '</div>' +
              poljeGeslo({ ime: 'geslo', oznaka: 'Geslo', auto: 'current-password' }) +
              '<button class="gumb gumb-glavni gumb-sirok" type="submit">Prijava</button>' +
            '</form>' +
            '<p class="list-dno">Nov dijak? <a href="#/registracija">Ustvari račun</a></p>' +
          '</div>' +
        '</div>' +
      '</section>';

    const obrazec = $('form', stran);
    veziPrijavniEmail(obrazec);
    if (param.get('email')) {
      obrazec.elements.email.value = param.get('email');
      obrazec.elements.email.dispatchEvent(new Event('input'));
    }

    const vstopi = (u) => {
      const cilj = namen && POTI[namen.slice(1).split('?')[0]] && POTI[namen.slice(1).split('?')[0]].vloga === u.vloga ? namen.slice(1) : DOMOV[u.vloga];
      namen = null;
      obvestilo('Pozdravljeni, ' + (u.vloga === 'admin' ? 'administrator' : u.ime) + '.');
      pojdi(cilj);
    };

    obrazec.addEventListener('submit', (e) => {
      e.preventDefault();
      pocisti(obrazec);
      const r = P.prijava(obrazec.elements.email.value, obrazec.elements.geslo.value);
      if (!r.ok) return pokaziNapako(obrazec, r.polje, r.napaka);
      vstopi(r.uporabnik);
    });

    stran.addEventListener('click', (e) => {
      const g = e.target.closest('[data-demo]');
      if (!g) return;
      const r = P.prijava(P.DEMO_RACUNI[g.dataset.demo], P.DEMO_GESLO);
      if (r.ok) vstopi(r.uporabnik);
      else obvestilo('Demo račun ne obstaja več. Ponastavite demo podatke (spodaj).', { vrsta: 'napaka' });
    });
  }

  /** Med vnosom prepozna vrsto računa po domeni in ponudi dokončanje naslova. */
  function veziPrijavniEmail(obrazec) {
    const vnos = obrazec.elements.email;
    const pecat = $('.pecat', obrazec);
    const predlogi = $('.predlogi', obrazec);
    const stanje = $('#p-email-stanje', obrazec);
    const DOMENE = [[E.DOMENA_DIJAK, 'dijak'], [E.DOMENA_ZAPOSLENI, 'zaposleni']];
    let zadnja = null;

    const posodobi = () => {
      const v = E.normaliziraj(vnos.value);
      const d = E.razdeli(v);
      const vrsta = E.vrstaRacuna(v);

      if (vrsta !== zadnja) {
        zadnja = vrsta;
        pecat.hidden = !vrsta;
        pecat.textContent = vrsta === 'dijak' ? 'Dijak' : 'Zaposleni';
        pecat.classList.remove('udarec');
        void pecat.offsetWidth;
        if (vrsta) pecat.classList.add('udarec');
        vnos.classList.toggle('ima-pecat', !!vrsta);
      }

      const seznam = d.lokalni && !vrsta && !/\s/.test(d.lokalni)
        ? DOMENE.filter((x) => d.domena === null || x[0].startsWith(d.domena))
        : [];
      predlogi.innerHTML = seznam.length
        ? '<span class="predlogi-oznaka">Dokončaj naslov:</span>' + seznam.map((x) =>
            '<button type="button" class="predlog" data-email="' + h(d.lokalni + '@' + x[0]) + '">' +
              h(d.lokalni) + '<strong>@' + x[0] + '</strong></button>').join('')
        : '';
      predlogi.hidden = !seznam.length;

      let besedilo;
      if (vrsta === 'dijak') besedilo = 'Dijaški naslov.';
      else if (vrsta === 'zaposleni') besedilo = 'Naslov zaposlenega (učitelj ali administrator).';
      else if (d.domena && d.domena.includes('.') && !seznam.length) besedilo = 'To ni šolski naslov. Dijaki uporabljajo @' + E.DOMENA_DIJAK + ', zaposleni @' + E.DOMENA_ZAPOSLENI + '.';
      else besedilo = 'Dijaki se prijavijo z naslovom @' + E.DOMENA_DIJAK + ', zaposleni z @' + E.DOMENA_ZAPOSLENI + '.';
      stanje.innerHTML = zDomenami(besedilo);
    };

    vnos.addEventListener('input', posodobi);
    predlogi.addEventListener('click', (e) => {
      const g = e.target.closest('[data-email]');
      if (!g) return;
      vnos.value = g.dataset.email;
      posodobi();
      obrazec.elements.geslo.focus();
    });
    posodobi();
  }

  function pogledRegistracija(stran) {
    stran.innerHTML =
      '<section class="zvezek">' +
        '<div class="okvir zvezek-notranji">' +
          '<div class="zvezek-uvod">' +
            '<h1 class="zvezek-naslov">Ustvarite dijaški račun.</h1>' +
            '<p class="zvezek-opis">Registrirajo se lahko samo dijaki s šolskim naslovom <strong>@' + E.DOMENA_DIJAK + '</strong>. ' +
              'Učitelje v sistem doda administrator.</p>' +
            '<p class="zvezek-opis">Naslov se izpolni sam, ko vpišete ime in priimek. Šumniki se zamenjajo, npr. Žiga Kovač postane ziga.kovac.</p>' +
          '</div>' +
          '<div class="list prijava-list">' +
            '<h2>Registracija</h2>' +
            '<form class="obrazec" novalidate>' +
              '<div class="polja-vrsta">' +
                polje({ ime: 'ime', oznaka: 'Ime', atributi: 'autocomplete="given-name" maxlength="50"' }) +
                polje({ ime: 'priimek', oznaka: 'Priimek', atributi: 'autocomplete="family-name" maxlength="50"' }) +
              '</div>' +
              poljeEmail({ vloga: 'ucenec', oznaka: 'Šolski e-poštni naslov' }) +
              poljeGeslo({ ime: 'geslo', oznaka: 'Geslo', namig: 'Najmanj 8 znakov.' }) +
              poljeGeslo({ ime: 'geslo2', oznaka: 'Ponovite geslo' }) +
              '<p class="obrazec-napaka" role="alert" hidden></p>' +
              '<button class="gumb gumb-glavni gumb-sirok" type="submit">Ustvari račun</button>' +
            '</form>' +
            '<p class="list-dno">Že imate račun? <a href="#/prijava">Prijava</a></p>' +
          '</div>' +
        '</div>' +
      '</section>';

    const obrazec = $('form', stran);
    veziEmail(obrazec, null);
    veziDolzinoGesla(obrazec.elements.geslo);

    obrazec.addEventListener('submit', (e) => {
      e.preventDefault();
      pocisti(obrazec);
      const f = obrazec.elements;
      if (f.geslo.value && f.geslo.value !== f.geslo2.value) return pokaziNapako(obrazec, 'geslo2', 'Gesli se ne ujemata.');
      const r = P.registriraj({ ime: f.ime.value, priimek: f.priimek.value, email: emailIzObrazca(obrazec), geslo: f.geslo.value });
      if (!r.ok) return pokaziNapako(obrazec, r.polje, r.napaka);
      obvestilo('Račun ' + r.uporabnik.email + ' je ustvarjen. Prijavite se z novim geslom.');
      pojdi('/prijava?email=' + encodeURIComponent(r.uporabnik.email));
    });
  }

  function veziDolzinoGesla(vnos) {
    const namig = $('#' + vnos.id + '-n');
    vnos.addEventListener('input', () => {
      const manjka = 8 - vnos.value.length;
      namig.textContent = !vnos.value ? 'Najmanj 8 znakov.'
        : manjka > 0 ? 'Še ' + st(manjka, OBLIKE.znak) + '.' : 'Dolžina je ustrezna.';
      namig.classList.toggle('dobro', manjka <= 0);
    });
  }

  /* ================================================================
     Administrator: predmeti
     ================================================================ */

  function pogledPredmeti(stran) {
    stran.innerHTML = '<div class="okvir">' +
      glavaStrani('Predmeti', 'Predmet ima lahko več učiteljev. Učitelje predmetom dodelite na strani Dodelitve.',
        '<button type="button" class="gumb gumb-glavni" data-akcija="dodaj">Dodaj predmet</button>') +
      orodja('Išči po nazivu ali opisu', 'Išči predmete') +
      '<div class="list" data-tabela></div></div>';

    const tbl = tabela($('[data-tabela]', stran), {
      napis: 'Predmeti',
      vrstice: () => P.predmeti(),
      iskanje: (p) => p.naziv + ' ' + p.opis,
      razvrsti: ['naziv', 1],
      prazno: 'Ni predmetov. Dodajte prvega z gumbom »Dodaj predmet«.',
      obStevilu: stevec(stran, OBLIKE.predmet),
      stolpci: [
        { kljuc: 'naziv', oznaka: 'Predmet', razvrsti: (p) => p.naziv, celica: znacka },
        { kljuc: 'opis', oznaka: 'Opis', celica: (p) => h(p.opis) || '<span class="tiho">Brez opisa</span>' },
        { kljuc: 'ucitelji', oznaka: 'Učitelji', razvrsti: (p) => P.uciteljiPredmeta(p.id).length, celica: (p) => {
            const u = P.uciteljiPredmeta(p.id);
            return u.length ? u.map((x) => h(x.ime + ' ' + x.priimek)).join(', ') : '<span class="opozorilo">Brez učitelja</span>';
          } },
        { kljuc: 'ucenci', oznaka: 'Učenci', razred: 'stevilka', razvrsti: (p) => P.ucenciPredmeta(p.id).length, celica: (p) => String(P.ucenciPredmeta(p.id).length) },
        { kljuc: 'dejanja', oznaka: '<span class="sr-only">Dejanja</span>', oznakaMobilno: '', razred: 'dejanja', celica: (p) => dejanja(p.id, 'predmet ' + p.naziv) }
      ]
    });
    veziIskanje(stran, tbl);

    stran.addEventListener('click', async (e) => {
      const g = e.target.closest('[data-akcija]');
      if (!g) return;
      const p = P.predmet(Number(g.dataset.id));
      if (g.dataset.akcija === 'dodaj' || g.dataset.akcija === 'uredi') {
        const urejam = g.dataset.akcija === 'uredi' ? p : null;
        const r = await odpriDialog({
          naslov: urejam ? 'Uredi predmet' : 'Dodaj predmet',
          potrdi: urejam ? 'Shrani spremembe' : 'Dodaj predmet',
          telo: polje({ ime: 'naziv', oznaka: 'Naziv', vrednost: urejam && urejam.naziv, atributi: 'maxlength="100"' }) +
                polje({ ime: 'opis', oznaka: 'Opis', vrsta: 'besedilo', neobvezno: true, vrednost: urejam && urejam.opis, atributi: 'maxlength="500"' }),
          obOddaji: (f) => {
            pocisti(f);
            const r = P.shraniPredmet({ id: urejam && urejam.id, naziv: f.elements.naziv.value, opis: f.elements.opis.value });
            if (!r.ok) { pokaziNapako(f, r.polje, r.napaka); return false; }
            return r.predmet;
          }
        });
        if (!r) return;
        tbl.izrisi();
        oznaciVrstico(stran, r.id);
        obvestilo(urejam ? 'Predmet ' + r.naziv + ' je posodobljen.' : 'Predmet ' + r.naziv + ' je dodan.', urejam ? {} : {
          akcija: { oznaka: 'Dodeli učitelje', fn: () => pojdi('/admin/dodelitve?vrsta=ucitelj') }
        });
      }
      if (g.dataset.akcija === 'izbrisi') {
        const po = P.poslediceBrisanjaPredmeta(p.id);
        const izgube = [
          po.ucitelji && st(po.ucitelji, OBLIKE.dodelitev) + ' učiteljev',
          po.vpisi && st(po.vpisi, OBLIKE.vpis) + ' učencev',
          po.gradiva && st(po.gradiva, OBLIKE.gradivo),
          po.oddaje && st(po.oddaje, OBLIKE.oddaja) + ' nalog'
        ].filter(Boolean);
        const ok = await odpriDialog({
          naslov: 'Izbrišem predmet ' + p.naziv + '?',
          nevarno: true,
          potrdi: 'Izbriši predmet',
          telo: (izgube.length
            ? '<p>Skupaj s predmetom se izbriše tudi:</p><ul class="seznam-izgub">' + izgube.map((x) => '<li>' + x + '</li>').join('') + '</ul>'
            : '<p>Predmet nima dodelitev, gradiv ali oddaj.</p>') +
            (po.ucenciPodDve ? '<p class="opozorilo-odstavek">Po brisanju bo imelo ' + st(po.ucenciPodDve, OBLIKE.ucenec) + ' manj kot 2 predmeta. Popravite jim dodelitve.</p>' : '')
        });
        if (!ok) return;
        const posnetek = P.posnetek();
        P.izbrisiPredmet(p.id);
        tbl.izrisi();
        obvestilo('Predmet ' + p.naziv + ' je izbrisan.', { akcija: { oznaka: 'Razveljavi', fn: () => { P.obnovi(posnetek); izrisi(); obvestilo('Brisanje je razveljavljeno.'); } } });
      }
    });
  }

  /* ================================================================
     Administrator: učitelji in učenci
     ================================================================ */

  function pogledUporabniki(stran, vloga) {
    const jeUcitelj = vloga === 'ucitelj';
    const domena = E.domenaZaVlogo(vloga);
    stran.innerHTML = '<div class="okvir">' +
      glavaStrani(jeUcitelj ? 'Učitelji' : 'Učenci',
        (jeUcitelj
          ? 'Učitelje vnese administrator. Njihovi naslovi se končajo z <strong>@' + domena + '</strong>.'
          : 'Učenci se registrirajo sami ali pa jih doda administrator. Naslovi se končajo z <strong>@' + domena + '</strong>.'),
        '<button type="button" class="gumb gumb-glavni" data-akcija="dodaj">' + (jeUcitelj ? 'Dodaj učitelja' : 'Dodaj učenca') + '</button>') +
      orodja('Išči po imenu, priimku ali e-pošti', jeUcitelj ? 'Išči učitelje' : 'Išči učence') +
      '<div class="list" data-tabela></div></div>';

    const tbl = tabela($('[data-tabela]', stran), {
      napis: jeUcitelj ? 'Učitelji' : 'Učenci',
      vrstice: () => P.uporabniki(vloga),
      iskanje: (u) => u.ime + ' ' + u.priimek + ' ' + u.email,
      razvrsti: ['ime', 1],
      naStran: jeUcitelj ? 0 : 15,
      obStevilu: stevec(stran, jeUcitelj ? OBLIKE.ucitelj : OBLIKE.ucenec),
      stolpci: [
        { kljuc: 'ime', oznaka: 'Priimek in ime', razvrsti: (u) => u.priimek + ' ' + u.ime, celica: (u) => '<strong>' + h(obrnjenoIme(u)) + '</strong>' },
        { kljuc: 'email', oznaka: 'E-pošta', razvrsti: (u) => u.email, razred: 'email', celica: (u) => emailHtml(u.email) },
        { kljuc: 'predmeti', oznaka: 'Predmeti', razvrsti: (u) => P.predmetiUporabnika(u.id).length, celica: (u) => {
            const pr = P.predmetiUporabnika(u.id);
            const premalo = !jeUcitelj && pr.length < 2;
            return '<a class="povezava-predmeti" href="#/admin/dodelitve?vrsta=' + vloga + '&id=' + u.id + '" title="Uredi dodelitve">' +
              (pr.length ? pr.map(znacka).join('') : '') +
              (premalo ? '<span class="opozorilo">' + (pr.length ? 'Premalo predmetov' : 'Dodeli predmete') + '</span>' : '') +
              (jeUcitelj && !pr.length ? '<span class="opozorilo">Dodeli predmete</span>' : '') + '</a>';
          } },
        { kljuc: 'dejanja', oznaka: '<span class="sr-only">Dejanja</span>', oznakaMobilno: '', razred: 'dejanja', celica: (u) => dejanja(u.id, polnoIme(u)) }
      ]
    });
    veziIskanje(stran, tbl);

    stran.addEventListener('click', async (e) => {
      const g = e.target.closest('[data-akcija]');
      if (!g) return;
      const u = P.uporabnik(Number(g.dataset.id));

      if (g.dataset.akcija === 'dodaj' || g.dataset.akcija === 'uredi') {
        const urejam = g.dataset.akcija === 'uredi' ? u : null;
        const r = await odpriDialog({
          naslov: urejam ? 'Uredi: ' + polnoIme(urejam) : (jeUcitelj ? 'Dodaj učitelja' : 'Dodaj učenca'),
          potrdi: urejam ? 'Shrani spremembe' : (jeUcitelj ? 'Dodaj učitelja' : 'Dodaj učenca'),
          telo: '<div class="polja-vrsta">' +
              polje({ ime: 'ime', oznaka: 'Ime', vrednost: urejam && urejam.ime, atributi: 'maxlength="50" autocomplete="off"' }) +
              polje({ ime: 'priimek', oznaka: 'Priimek', vrednost: urejam && urejam.priimek, atributi: 'maxlength="50" autocomplete="off"' }) +
            '</div>' +
            poljeEmail({ vloga: vloga, vrednost: urejam && urejam.email }) +
            poljeGeslo({ ime: 'geslo', oznaka: urejam ? 'Novo geslo' : 'Začetno geslo', neobvezno: !!urejam,
              namig: urejam ? 'Pustite prazno, če gesla ne spreminjate.' : 'Najmanj 8 znakov.' }),
          obOdprtju: (f) => veziEmail(f, urejam && urejam.id),
          obOddaji: (f) => {
            pocisti(f);
            const r = P.shraniUporabnika({ id: urejam && urejam.id, vloga: vloga, ime: f.elements.ime.value, priimek: f.elements.priimek.value, email: emailIzObrazca(f), geslo: f.elements.geslo.value });
            if (!r.ok) { pokaziNapako(f, r.polje, r.napaka); return false; }
            return r.uporabnik;
          }
        });
        if (!r) return;
        tbl.izrisi();
        oznaciVrstico(stran, r.id);
        if (urejam) obvestilo('Podatki za ' + polnoIme(r) + ' so shranjeni.');
        else obvestilo((jeUcitelj ? 'Učitelj ' : 'Učenec ') + polnoIme(r) + ' je dodan' + (jeUcitelj ? '. Dodelite mu predmete.' : '. Dodelite mu vsaj 2 predmeta.'), {
          akcija: { oznaka: 'Dodeli predmete', fn: () => pojdi('/admin/dodelitve?vrsta=' + vloga + '&id=' + r.id) }
        });
      }

      if (g.dataset.akcija === 'izbrisi') {
        const po = P.poslediceBrisanjaUporabnika(u.id);
        const izgube = [
          po.predmeti && (jeUcitelj ? st(po.predmeti, OBLIKE.dodelitev) + ' predmetov' : st(po.predmeti, OBLIKE.vpis) + ' v predmete'),
          po.oddaje && st(po.oddaje, OBLIKE.oddaja) + ' nalog'
        ].filter(Boolean);
        const ok = await odpriDialog({
          naslov: 'Izbrišem ' + (jeUcitelj ? 'učitelja ' : 'učenca ') + polnoIme(u) + '?',
          nevarno: true,
          potrdi: jeUcitelj ? 'Izbriši učitelja' : 'Izbriši učenca',
          telo: '<p>Račun <strong>' + emailHtml(u.email) + '</strong> bo izbrisan.</p>' +
            (izgube.length ? '<p>Izbriše se tudi:</p><ul class="seznam-izgub">' + izgube.map((x) => '<li>' + x + '</li>').join('') + '</ul>' : '') +
            (po.gradiva ? '<p>Gradiva, ki jih je naložil (' + po.gradiva + '), ostanejo na voljo brez avtorja.</p>' : '')
        });
        if (!ok) return;
        const posnetek = P.posnetek();
        P.izbrisiUporabnika(u.id);
        tbl.izrisi();
        obvestilo(polnoIme(u) + ' je izbrisan.', { akcija: { oznaka: 'Razveljavi', fn: () => { P.obnovi(posnetek); izrisi(); obvestilo('Brisanje je razveljavljeno.'); } } });
      }
    });
  }

  /* ================================================================
     Administrator: dodelitve (M:N)
     ================================================================ */

  let iskanjeDodelitev = '';

  function pogledDodelitve(stran, param) {
    const vrsta = param.get('vrsta') === 'ucenec' ? 'ucenec' : 'ucitelj';
    const jeUcitelj = vrsta === 'ucitelj';
    const osebe = P.uporabniki(vrsta);
    let oseba = P.uporabnik(Number(param.get('id')));
    if (!oseba || oseba.vloga !== vrsta) oseba = osebe[0] || null;

    const izbrani = oseba ? P.predmetiUporabnika(oseba.id).map((p) => p.id) : [];
    const povezava = (v, oznaka) => '<a href="#/admin/dodelitve?vrsta=' + v + '"' + (v === vrsta ? ' aria-current="page"' : '') + '>' + oznaka + '</a>';

    stran.innerHTML = '<div class="okvir">' +
      glavaStrani('Dodelitve predmetov', 'Predmet ima lahko več učiteljev in učitelj več predmetov. Vsak učenec obiskuje najmanj 2 predmeta.') +
      '<nav class="preklop" aria-label="Komu dodeljujete">' + povezava('ucitelj', 'Učitelji') + povezava('ucenec', 'Učenci') + '</nav>' +
      '<div class="dodelitve">' +
        '<section class="list seznam-oseb" aria-label="' + (jeUcitelj ? 'Učitelji' : 'Učenci') + '">' +
          '<div class="iskalnik iskalnik-majhen">' + IKONA.isci +
            '<label class="sr-only" for="isci-osebe">Išči osebo</label>' +
            '<input id="isci-osebe" type="search" data-iskanje placeholder="Išči ' + (jeUcitelj ? 'učitelja' : 'učenca') + '" value="' + h(iskanjeDodelitev) + '" autocomplete="off">' +
          '</div>' +
          '<ul class="osebe">' + osebe.map((o) => {
            const n = P.predmetiUporabnika(o.id).length;
            return '<li data-iskanje-vsebina="' + h(iskalno(o.ime + ' ' + o.priimek + ' ' + o.email)) + '">' +
              '<a href="#/admin/dodelitve?vrsta=' + vrsta + '&id=' + o.id + '"' + (oseba && o.id === oseba.id ? ' aria-current="true"' : '') + '>' +
                '<span>' + h(obrnjenoIme(o)) + '</span>' +
                '<span class="oseba-stevilo' + (!jeUcitelj && n < 2 ? ' premalo' : '') + '" title="' + st(n, OBLIKE.predmet) + '">' + n + '</span>' +
              '</a></li>';
          }).join('') + '</ul>' +
          '<p class="osebe-prazno tiho" hidden>Ni zadetkov.</p>' +
        '</section>' +
        (oseba ? urejevalnikDodelitev(oseba, izbrani) : '<section class="list">' + prazno('Ni oseb', 'Najprej dodajte ' + (jeUcitelj ? 'učitelja' : 'učenca') + '.') + '</section>') +
      '</div></div>';

    // iskanje po seznamu oseb
    const isci = $('#isci-osebe', stran);
    const filtriraj = () => {
      iskanjeDodelitev = isci.value;
      const q = iskalno(isci.value.trim());
      let vidnih = 0;
      $$('.osebe li', stran).forEach((li) => {
        const vidna = !q || li.dataset.iskanjeVsebina.includes(q);
        li.hidden = !vidna;
        if (vidna) vidnih++;
      });
      $('.osebe-prazno', stran).hidden = vidnih > 0;
    };
    isci.addEventListener('input', filtriraj);
    filtriraj();
    const izbranaPovezava = $('.osebe [aria-current]', stran);
    if (izbranaPovezava) requestAnimationFrame(() => izbranaPovezava.scrollIntoView({ block: 'nearest' }));

    if (!oseba) return;
    const obrazec = $('.urejanje form', stran);
    const stanje = $('.dodelitve-stanje', stran);
    const zacetno = izbrani.slice().sort().join(',');
    const izbor = () => $$('input[name=predmet]:checked', obrazec).map((c) => Number(c.value));
    const posodobi = () => {
      const n = izbor().length;
      const premalo = !jeUcitelj && n < 2;
      stanje.classList.remove('zavrnjeno');
      stanje.textContent = izbraniPredmeti(n) + (premalo ? ' Potrebna sta vsaj 2.' : '');
      stanje.classList.toggle('opozorilo-besedilo', premalo);
      obrazec.dataset.spremenjeno = izbor().sort().join(',') !== zacetno;
    };
    obrazec.addEventListener('change', posodobi);
    posodobi();
    obrazec.addEventListener('submit', (e) => {
      e.preventDefault();
      pocisti(obrazec);
      const r = P.nastaviPredmete(oseba.id, izbor());
      if (!r.ok) return zavrniIzbor(obrazec, stanje, r.napaka);
      obvestilo('Dodelitve za ' + polnoIme(oseba) + ' so shranjene.');
      izrisi();
    });
    obrazec.addEventListener('reset', () => setTimeout(posodobi));
  }

  /** Zavrnjena shramba izbora predmetov: sporočilo se pokaže v vrstici stanja (brez podvajanja). */
  function zavrniIzbor(obrazec, stanje, besedilo) {
    stanje.textContent = '';
    stanje.classList.add('opozorilo-besedilo', 'zavrnjeno');
    requestAnimationFrame(() => { stanje.textContent = 'Ni shranjeno. ' + besedilo; });
    const prvi = $('input[name=predmet]', obrazec);
    if (prvi) prvi.focus();
  }

  function urejevalnikDodelitev(oseba, izbrani) {
    const jeUcitelj = oseba.vloga === 'ucitelj';
    return '<section class="list urejanje" aria-labelledby="ur-naslov">' +
      '<div class="oseba-glava"><span class="avatar avatar-velik" aria-hidden="true">' + h(inicialke(oseba)) + '</span>' +
        '<div><h2 id="ur-naslov">' + h(polnoIme(oseba)) + '</h2><p class="email">' + emailHtml(oseba.email) + '</p></div></div>' +
      '<form novalidate>' +
        '<fieldset class="polje" data-polje="predmeti"><legend>' + (jeUcitelj ? 'Predmeti, ki jih poučuje' : 'Predmeti, ki jih obiskuje') + '</legend>' +
          '<div class="izbira-predmetov">' + P.predmeti().map((p) => {
            const meta = jeUcitelj
              ? st(P.uciteljiPredmeta(p.id).length, OBLIKE.ucitelj)
              : (P.uciteljiPredmeta(p.id).map((u) => u.priimek).join(', ') || 'Brez učitelja');
            return '<label class="izbira" style="--h:' + odtenek(p.id) + '">' +
              '<input type="checkbox" name="predmet" value="' + p.id + '"' + (izbrani.indexOf(p.id) >= 0 ? ' checked' : '') + '>' +
              '<span class="izbira-naziv">' + h(p.naziv) + '</span><span class="izbira-meta">' + h(meta) + '</span></label>';
          }).join('') + '</div>' +
          '<p class="polje-napaka" hidden></p>' +
        '</fieldset>' +
        '<div class="vrstica-shrani">' +
          '<p class="dodelitve-stanje" aria-live="polite"></p>' +
          '<span class="neshranjeno">Spremembe še niso shranjene.</span>' +
          '<button type="reset" class="gumb">Razveljavi spremembe</button>' +
          '<button type="submit" class="gumb gumb-glavni">Shrani dodelitve</button>' +
        '</div>' +
      '</form></section>';
  }

  /* ================================================================
     Učitelj
     ================================================================ */

  function zavihkiPredmetov(predmeti, izbranId, pot, stevilo) {
    return '<nav class="zavihki" aria-label="Predmeti">' + predmeti.map((p) =>
      '<a class="zavihek" style="--h:' + odtenek(p.id) + '" href="#' + pot + '?predmet=' + p.id + '"' + (p.id === izbranId ? ' aria-current="page"' : '') + '>' +
        '<span>' + h(p.naziv) + '</span>' + (stevilo ? '<span class="zavihek-stevilo">' + stevilo(p) + '</span>' : '') + '</a>').join('') +
    '</nav>';
  }

  function izbraniPredmetUcitelja(param, moji) {
    const zahtevan = Number(param.get('predmet'));
    const p = moji.find((x) => x.id === zahtevan);
    return { predmet: p || moji[0], zavrnjen: !!zahtevan && !p };
  }

  const zavrnitev = '<p class="vrstica-opozorilo" role="alert">Predmeta, ki ste ga zahtevali, ne poučujete, zato ga ni mogoče odpreti. V pravi aplikaciji strežnik vrne 403.</p>';

  function pogledUciteljGradiva(stran, param, u) {
    const moji = P.predmetiUporabnika(u.id);
    if (!moji.length) {
      stran.innerHTML = '<div class="okvir">' + glavaStrani('Gradiva') +
        prazno('Še nimate predmetov', 'Administrator vam še ni dodelil predmetov. Ko vam jih dodeli, boste tukaj nalagali gradiva.') + '</div>';
      return;
    }
    const { predmet, zavrnjen } = izbraniPredmetUcitelja(param, moji);

    stran.innerHTML = '<div class="okvir">' +
      glavaStrani('Gradiva', 'Vidite samo predmete, ki jih poučujete. Učenci gradiva vidijo takoj po nalaganju.') +
      (zavrnjen ? zavrnitev : '') +
      zavihkiPredmetov(moji, predmet.id, '/ucitelj/gradiva', (p) => P.gradivaPredmeta(p.id).length) +
      '<div class="dve-koloni">' +
        '<section class="list" aria-label="Gradiva predmeta ' + h(predmet.naziv) + '" data-tabela></section>' +
        '<section class="list nalaganje">' +
          '<h2>Naloži gradivo</h2>' +
          '<p class="tiho">Predmet: ' + znacka(predmet) + '</p>' +
          '<form class="obrazec" novalidate>' +
            polje({ ime: 'naslov', oznaka: 'Naslov gradiva', atributi: 'maxlength="150" autocomplete="off"' }) +
            poljeDatoteka() +
            '<p class="obrazec-napaka" role="alert" hidden></p>' +
            '<button type="submit" class="gumb gumb-glavni gumb-sirok">Naloži gradivo</button>' +
          '</form>' +
        '</section>' +
      '</div></div>';

    const tbl = tabela($('[data-tabela]', stran), {
      napis: 'Gradiva predmeta ' + predmet.naziv,
      vrstice: () => P.gradivaPredmeta(predmet.id),
      iskanje: (g) => g.naslov,
      razvrsti: ['datum', -1],
      prazno: 'Pri tem predmetu še ni gradiv. Naložite prvo v obrazcu ob strani.',
      stolpci: [
        { kljuc: 'naslov', oznaka: 'Naslov', razvrsti: (g) => g.naslov, celica: (g) => '<strong>' + h(g.naslov) + '</strong>' },
        { kljuc: 'datoteka', oznaka: 'Datoteka', razred: 'datoteka', celica: (g) => h(g.pot_datoteke) + ' <span class="tiho">' + velikost(g.velikost) + '</span>' },
        { kljuc: 'avtor', oznaka: 'Naložil', razred: 'brez-preloma', celica: (g) => { const a = P.uporabnik(g.nalozil_id); return a ? h(polnoIme(a)) : '<span class="tiho">Neznan avtor</span>'; } },
        { kljuc: 'datum', oznaka: 'Naloženo', razred: 'brez-preloma', razvrsti: (g) => g.datum_nalozitve, celica: (g) => datum(g.datum_nalozitve) },
        { kljuc: 'dejanja', oznaka: '<span class="sr-only">Dejanja</span>', oznakaMobilno: '', razred: 'dejanja', celica: (g) => dejanja(g.id, g.naslov, { prenesi: true, brezUrejanja: true }) }
      ]
    });

    const obrazec = $('.nalaganje form', stran);
    const dat = veziDatoteko(obrazec);
    obrazec.addEventListener('submit', (e) => {
      e.preventDefault();
      pocisti(obrazec);
      const f = dat.datoteka();
      const r = P.dodajGradivo(u.id, predmet.id, obrazec.elements.naslov.value, f && { ime: f.name, velikost: f.size });
      if (!r.ok) return pokaziNapako(obrazec, r.polje, r.napaka);
      datoteke.set('g' + r.gradivo.id, f);
      obrazec.reset();
      dat.pocisti();
      tbl.izrisi();
      osveziZavihke(stran, (p) => P.gradivaPredmeta(p.id).length);
      oznaciVrstico(stran, r.gradivo.id);
      obvestilo('Gradivo ' + r.gradivo.naslov + ' je naloženo.');
    });

    stran.addEventListener('click', async (e) => {
      const g = e.target.closest('[data-akcija]');
      if (!g) return;
      const gr = P.gradivo(Number(g.dataset.id));
      if (!gr) return;
      if (g.dataset.akcija === 'prenesi') prenesi(gr.pot_datoteke, 'g' + gr.id);
      if (g.dataset.akcija === 'izbrisi') {
        const ok = await odpriDialog({
          naslov: 'Izbrišem gradivo ' + gr.naslov + '?', nevarno: true, potrdi: 'Izbriši gradivo',
          telo: '<p>Učenci predmeta ' + h(predmet.naziv) + ' gradiva ne bodo več videli.</p>'
        });
        if (!ok) return;
        const posnetek = P.posnetek();
        const r = P.izbrisiGradivo(u.id, gr.id);
        if (!r.ok) return obvestilo(r.napaka, { vrsta: 'napaka' });
        tbl.izrisi();
        osveziZavihke(stran, (p) => P.gradivaPredmeta(p.id).length);
        obvestilo('Gradivo ' + gr.naslov + ' je izbrisano.', { akcija: { oznaka: 'Razveljavi', fn: () => { P.obnovi(posnetek); izrisi(); } } });
      }
    });
  }

  function osveziZavihke(stran, stevilo) {
    $$('.zavihek', stran).forEach((z) => {
      const id = Number(new URLSearchParams(z.getAttribute('href').split('?')[1]).get('predmet'));
      const el = $('.zavihek-stevilo', z);
      if (el) el.textContent = stevilo(P.predmet(id));
    });
  }

  function pogledUciteljOddaje(stran, param, u) {
    const moji = P.predmetiUporabnika(u.id);
    if (!moji.length) {
      stran.innerHTML = '<div class="okvir">' + glavaStrani('Oddane naloge') +
        prazno('Še nimate predmetov', 'Ko vam administrator dodeli predmete, boste tukaj videli oddane naloge učencev.') + '</div>';
      return;
    }
    const { predmet, zavrnjen } = izbraniPredmetUcitelja(param, moji);
    const vpisani = P.ucenciPredmeta(predmet.id).length;

    stran.innerHTML = '<div class="okvir">' +
      glavaStrani('Oddane naloge', 'Naloge, ki so jih učenci oddali pri vaših predmetih. Datoteke so poimenovane »Priimek Ime – Naslov naloge«.') +
      (zavrnjen ? zavrnitev : '') +
      zavihkiPredmetov(moji, predmet.id, '/ucitelj/oddaje', (p) => P.oddajePredmeta(p.id).length) +
      orodja('Išči po učencu ali nalogi', 'Išči oddaje') +
      '<p class="tiho povzetek">Predmet obiskuje ' + st(vpisani, OBLIKE.ucenec) + '.</p>' +
      '<div class="list" data-tabela></div></div>';

    const tbl = tabela($('[data-tabela]', stran), {
      napis: 'Oddane naloge pri predmetu ' + predmet.naziv,
      vrstice: () => P.oddajePredmeta(predmet.id),
      iskanje: (o) => { const x = P.uporabnik(o.ucenec_id); return (x ? x.ime + ' ' + x.priimek : '') + ' ' + o.naslov_naloge; },
      razvrsti: ['datum', -1],
      naStran: 15,
      prazno: 'Pri tem predmetu še ni oddanih nalog.',
      obStevilu: stevec(stran, OBLIKE.oddaja),
      stolpci: [
        { kljuc: 'ucenec', oznaka: 'Učenec', razvrsti: (o) => { const x = P.uporabnik(o.ucenec_id); return x ? x.priimek + ' ' + x.ime : ''; },
          celica: (o) => { const x = P.uporabnik(o.ucenec_id); return '<strong>' + h(x ? obrnjenoIme(x) : 'Neznan učenec') + '</strong>'; } },
        { kljuc: 'naloga', oznaka: 'Naloga', razvrsti: (o) => o.naslov_naloge, celica: (o) => h(o.naslov_naloge) },
        { kljuc: 'datoteka', oznaka: 'Shranjeno kot', razred: 'datoteka', celica: (o) => h(o.pot_datoteke) + ' <span class="tiho">' + velikost(o.velikost) + '</span>' },
        { kljuc: 'datum', oznaka: 'Oddano', razred: 'brez-preloma', razvrsti: (o) => o.datum_oddaje, celica: (o) => datumUra(o.datum_oddaje) },
        { kljuc: 'dejanja', oznaka: '<span class="sr-only">Dejanja</span>', oznakaMobilno: '', razred: 'dejanja', celica: (o) => dejanja(o.id, o.pot_datoteke, { prenesi: true, brezUrejanja: true, brezBrisanja: true }) }
      ]
    });
    veziIskanje(stran, tbl);
    stran.addEventListener('click', (e) => {
      const g = e.target.closest('[data-akcija="prenesi"]');
      if (!g) return;
      const o = P.oddaja(Number(g.dataset.id));
      if (o) prenesi(o.pot_datoteke, 'o' + o.id);
    });
  }

  /* ================================================================
     Učenec
     ================================================================ */

  function pogledUcenecPredmeti(stran, param, u) {
    const izbrani = P.predmetiUporabnika(u.id).map((p) => p.id);
    stran.innerHTML = '<div class="okvir">' +
      glavaStrani('Moji predmeti', 'Označite predmete, ki jih obiskujete. Izbrati morate najmanj 2.') +
      (izbrani.length < 2 ? '<p class="vrstica-opozorilo">' + (izbrani.length ? 'Izbrati morate še vsaj en predmet.' : 'Dobrodošli! Najprej izberite vsaj 2 predmeta, ki ju obiskujete. Nato boste videli njihova gradiva.') + '</p>' : '') +
      '<form novalidate class="predmeti-obrazec">' +
        '<fieldset class="polje" data-polje="predmeti"><legend class="sr-only">Predmeti</legend>' +
          '<div class="mreza-predmetov">' + P.predmeti().map((p) => {
            const uc = P.uciteljiPredmeta(p.id);
            return '<label class="kartica-predmeta" style="--h:' + odtenek(p.id) + '">' +
              '<input type="checkbox" name="predmet" value="' + p.id + '"' + (izbrani.indexOf(p.id) >= 0 ? ' checked' : '') + '>' +
              '<span class="kartica-naziv">' + h(p.naziv) + '</span>' +
              '<span class="kartica-opis">' + h(p.opis) + '</span>' +
              '<span class="kartica-ucitelji">' + (uc.length ? h(uc.map((x) => x.ime + ' ' + x.priimek).join(', ')) : 'Brez učitelja') + '</span>' +
            '</label>';
          }).join('') + '</div>' +
          '<p class="polje-napaka" hidden></p>' +
        '</fieldset>' +
        '<div class="vrstica-shrani lepljiva">' +
          '<p class="dodelitve-stanje" aria-live="polite"></p>' +
          '<span class="neshranjeno">Spremembe še niso shranjene.</span>' +
          '<button type="submit" class="gumb gumb-glavni">Shrani predmete</button>' +
        '</div>' +
      '</form></div>';

    const obrazec = $('form', stran);
    const stanje = $('.dodelitve-stanje', stran);
    const zacetno = izbrani.slice().sort().join(',');
    const izbor = () => $$('input[name=predmet]:checked', obrazec).map((c) => Number(c.value));
    const posodobi = () => {
      const n = izbor().length;
      stanje.classList.remove('zavrnjeno');
      stanje.textContent = izbraniPredmeti(n) + (n < 2 ? ' Potrebna sta vsaj 2.' : '');
      stanje.classList.toggle('opozorilo-besedilo', n < 2);
      obrazec.dataset.spremenjeno = izbor().sort().join(',') !== zacetno;
    };
    obrazec.addEventListener('change', posodobi);
    posodobi();
    obrazec.addEventListener('submit', (e) => {
      e.preventDefault();
      pocisti(obrazec);
      const r = P.nastaviPredmete(u.id, izbor());
      if (!r.ok) return zavrniIzbor(obrazec, stanje, r.napaka);
      obvestilo('Vaši predmeti so shranjeni.', { akcija: { oznaka: 'Poglej gradiva', fn: () => pojdi('/ucenec/gradiva') } });
      izrisi();
    });
  }

  function pogledUcenecGradiva(stran, param, u) {
    const moji = P.predmetiUporabnika(u.id);
    if (!moji.length) {
      stran.innerHTML = '<div class="okvir">' + glavaStrani('Gradiva') +
        prazno('Najprej izberite predmete', 'Gradiva vidite samo pri predmetih, ki jih obiskujete.', '<a class="gumb gumb-glavni" href="#/ucenec/predmeti">Izberi predmete</a>') + '</div>';
      return;
    }
    stran.innerHTML = '<div class="okvir">' +
      glavaStrani('Gradiva', 'Gradiva predmetov, ki jih obiskujete.') +
      '<div class="predmeti-gradiva">' + moji.map((p) => {
        const gr = P.gradivaPredmeta(p.id);
        return '<section class="list predmet-sekcija" style="--h:' + odtenek(p.id) + '" aria-labelledby="pg-' + p.id + '">' +
          '<h2 id="pg-' + p.id + '">' + h(p.naziv) + '</h2>' +
          (gr.length
            ? '<ul class="gradiva">' + gr.map((g) =>
                '<li><div class="gradivo-opis"><strong>' + h(g.naslov) + '</strong>' +
                  '<span class="tiho">' + h(P.koncnica(g.pot_datoteke).toUpperCase()) + ', ' + velikost(g.velikost) + ', ' + datum(g.datum_nalozitve) + '</span></div>' +
                  '<button type="button" class="gumb gumb-tih" data-prenesi="' + g.id + '" aria-label="Prenesi ' + h(g.naslov) + '">Prenesi</button></li>').join('') + '</ul>'
            : '<p class="tiho">Učitelj še ni naložil gradiv.</p>') +
        '</section>';
      }).join('') + '</div></div>';

    stran.addEventListener('click', (e) => {
      const g = e.target.closest('[data-prenesi]');
      if (!g) return;
      const gr = P.gradivo(Number(g.dataset.prenesi));
      if (!gr || !P.obiskuje(u.id, gr.predmet_id)) return obvestilo('Gradivo ni na voljo (403).', { vrsta: 'napaka' });
      prenesi(gr.pot_datoteke, 'g' + gr.id);
    });
  }

  function pogledUcenecOddaja(stran, param, u) {
    const moji = P.predmetiUporabnika(u.id);
    if (!moji.length) {
      stran.innerHTML = '<div class="okvir">' + glavaStrani('Oddaja nalog') +
        prazno('Najprej izberite predmete', 'Naloge lahko oddate samo pri predmetih, ki jih obiskujete.', '<a class="gumb gumb-glavni" href="#/ucenec/predmeti">Izberi predmete</a>') + '</div>';
      return;
    }
    const izbranId = Number(param.get('predmet'));
    stran.innerHTML = '<div class="okvir">' +
      glavaStrani('Oddaja nalog', 'Datoteka se shrani kot »Priimek Ime – Naslov naloge.končnica«. Če nalogo oddate znova, vas vprašamo, ali naj povozimo prejšnjo.') +
      '<div class="dve-koloni dve-koloni-obrnjeno">' +
        '<section class="list oddaja">' +
          '<h2>Nova oddaja</h2>' +
          '<form class="obrazec" novalidate>' +
            '<div class="polje" data-polje="predmet"><label for="od-predmet">Predmet</label>' +
              '<select id="od-predmet" name="predmet">' + moji.map((p) => '<option value="' + p.id + '"' + (p.id === izbranId ? ' selected' : '') + '>' + h(p.naziv) + '</option>').join('') + '</select>' +
              '<p class="polje-napaka" hidden></p></div>' +
            polje({ ime: 'naslov', oznaka: 'Naslov naloge', atributi: 'maxlength="150" autocomplete="off" list="od-naslovi"' }) +
            '<datalist id="od-naslovi"></datalist>' +
            poljeDatoteka() +
            '<div class="predogled" aria-live="polite"><span class="tiho">Shranjeno kot</span><output class="predogled-ime"></output></div>' +
            '<p class="obrazec-napaka" role="alert" hidden></p>' +
            '<button type="submit" class="gumb gumb-glavni gumb-sirok">Oddaj nalogo</button>' +
          '</form>' +
        '</section>' +
        '<section class="list" aria-labelledby="moje-oddaje"><h2 id="moje-oddaje" class="list-naslov">Moje oddaje</h2><div data-tabela></div></section>' +
      '</div></div>';

    const obrazec = $('form', stran);
    const f = obrazec.elements;
    const namig = $('#' + f.naslov.id + '-n');
    const izhod = $('.predogled-ime', stran);
    let datoteka = null;

    const predogled = () => {
      const naslov = f.naslov.value.trim().replace(/\s+/g, ' ');
      const konc = datoteka ? P.koncnica(datoteka.name) : '';
      izhod.innerHTML = h(u.priimek + ' ' + u.ime + ' – ') +
        '<span class="' + (naslov ? '' : 'tiho') + '">' + h(naslov ? P.imeOddaje({ ime: '', priimek: '' }, naslov, '').replace(/^\s*–\s*/, '') : 'Naslov naloge') + '</span>' +
        '<span class="' + (konc ? '' : 'tiho') + '">.' + h(konc || 'končnica') + '</span>';
      const pid = Number(f.predmet.value);
      const staro = naslov && P.obstojecaOddaja(u.id, pid, naslov);
      namig.textContent = staro ? 'To nalogo ste že oddali (' + datumUra(staro.datum_oddaje) + '). Ob ponovni oddaji boste potrdili povoz.' : '';
      namig.classList.toggle('opozorilo-besedilo', !!staro);
      $('#od-naslovi', stran).innerHTML = P.oddajeUcenca(u.id).filter((o) => o.predmet_id === pid)
        .map((o) => '<option value="' + h(o.naslov_naloge) + '">').join('');
    };
    const dat = veziDatoteko(obrazec, (x) => { datoteka = x; predogled(); });
    f.naslov.addEventListener('input', predogled);
    f.predmet.addEventListener('change', predogled);
    predogled();

    const tbl = tabela($('[data-tabela]', stran), {
      napis: 'Moje oddaje',
      vrstice: () => P.oddajeUcenca(u.id),
      iskanje: (o) => o.naslov_naloge,
      razvrsti: ['datum', -1],
      prazno: 'Še niste oddali nobene naloge.',
      stolpci: [
        { kljuc: 'predmet', oznaka: 'Predmet', celica: (o) => { const p = P.predmet(o.predmet_id); return p ? znacka(p) : ''; } },
        { kljuc: 'naloga', oznaka: 'Naloga', razvrsti: (o) => o.naslov_naloge, celica: (o) => '<strong>' + h(o.naslov_naloge) + '</strong><span class="pod-naslov tiho">' + h(o.pot_datoteke) + '</span>' },
        { kljuc: 'datum', oznaka: 'Oddano', razred: 'brez-preloma', razvrsti: (o) => o.datum_oddaje, celica: (o) => datumUra(o.datum_oddaje) },
        { kljuc: 'dejanja', oznaka: '<span class="sr-only">Dejanja</span>', oznakaMobilno: '', razred: 'dejanja', celica: (o) => dejanja(o.id, o.pot_datoteke, { prenesi: true, brezUrejanja: true, brezBrisanja: true }) }
      ]
    });

    const oddaj = (povozi) => P.oddajNalogo(u.id, Number(f.predmet.value), f.naslov.value, datoteka && { ime: datoteka.name, velikost: datoteka.size }, povozi);
    const uspeh = (r) => {
      datoteke.set('o' + r.oddaja.id, datoteka);
      obrazec.reset();
      dat.pocisti();
      predogled();
      tbl.izrisi();
      oznaciVrstico(stran, r.oddaja.id);
      obvestilo(r.povozeno ? 'Naloga je znova oddana. Prejšnja datoteka je povožena.' : 'Naloga je oddana kot ' + r.oddaja.pot_datoteke + '.');
    };

    obrazec.addEventListener('submit', async (e) => {
      e.preventDefault();
      pocisti(obrazec);
      let r = oddaj(false);
      if (r.obstaja) {
        const ok = await odpriDialog({
          naslov: 'Naloga je že oddana',
          telo: '<p class="sporocilo-povoz">Naloga »' + h(r.oddaja.naslov_naloge) + '« je že oddana (' + datumUra(r.oddaja.datum_oddaje) + '). Želite povoziti prejšnjo datoteko?</p>' +
            '<p class="tiho">Prejšnja datoteka: ' + h(r.oddaja.pot_datoteke) + '</p>',
          potrdi: 'Da, povozi', preklici: 'Ne', nevarno: true
        });
        if (!ok) return obvestilo('Oddaja je preklicana. Prejšnja datoteka ostane.');
        r = oddaj(true);
      }
      if (!r.ok) return pokaziNapako(obrazec, r.polje, r.napaka);
      uspeh(r);
    });

    stran.addEventListener('click', (e) => {
      const g = e.target.closest('[data-akcija="prenesi"]');
      if (!g) return;
      const o = P.oddaja(Number(g.dataset.id));
      if (o && o.ucenec_id === u.id) prenesi(o.pot_datoteke, 'o' + o.id);
    });
  }

  function pogledUcenecProfil(stran, param, u) {
    stran.innerHTML = '<div class="okvir okvir-ozek">' +
      glavaStrani('Moj profil', 'Spremenite ime, priimek, e-poštni naslov ali geslo.') +
      '<section class="list">' +
        '<div class="oseba-glava"><span class="avatar avatar-velik" aria-hidden="true">' + h(inicialke(u)) + '</span>' +
          '<div><p class="oseba-ime">' + h(polnoIme(u)) + '</p><p class="email">' + emailHtml(u.email) + '</p></div></div>' +
        '<form class="obrazec" novalidate>' +
          '<div class="polja-vrsta">' +
            polje({ ime: 'ime', oznaka: 'Ime', vrednost: u.ime, atributi: 'maxlength="50" autocomplete="given-name"' }) +
            polje({ ime: 'priimek', oznaka: 'Priimek', vrednost: u.priimek, atributi: 'maxlength="50" autocomplete="family-name"' }) +
          '</div>' +
          poljeEmail({ vloga: 'ucenec', vrednost: u.email, oznaka: 'Šolski e-poštni naslov' }) +
          '<div class="polja-vrsta">' +
            poljeGeslo({ ime: 'geslo', oznaka: 'Novo geslo', neobvezno: true, namig: 'Pustite prazno, če gesla ne spreminjate.' }) +
            poljeGeslo({ ime: 'geslo2', oznaka: 'Ponovite novo geslo', neobvezno: true }) +
          '</div>' +
          '<p class="obrazec-napaka" role="alert" hidden></p>' +
          '<button type="submit" class="gumb gumb-glavni">Shrani spremembe</button>' +
        '</form>' +
      '</section></div>';

    const obrazec = $('form', stran);
    veziEmail(obrazec, u.id);
    obrazec.addEventListener('submit', (e) => {
      e.preventDefault();
      pocisti(obrazec);
      const f = obrazec.elements;
      if (f.geslo.value !== f.geslo2.value) return pokaziNapako(obrazec, 'geslo2', 'Gesli se ne ujemata.');
      const r = P.shraniUporabnika({ id: u.id, ime: f.ime.value, priimek: f.priimek.value, email: emailIzObrazca(obrazec), geslo: f.geslo.value });
      if (!r.ok) return pokaziNapako(obrazec, r.polje, r.napaka);
      obvestilo('Profil je shranjen.' + (f.geslo.value ? ' Geslo je spremenjeno.' : ''));
      izrisi();
    });
  }

  /* ================================================================
     Dokumentacija
     ================================================================ */

  function pogledDokumentacija(stran) {
    const ER = [
      ['UPORABNIK', ['PK id', 'ime, priimek', 'UK email', 'geslo_hash', 'vloga']],
      ['PREDMET', ['PK id', 'UK naziv', 'opis']],
      ['UCITELJ_PREDMET', ['PK, FK uporabnik_id', 'PK, FK predmet_id']],
      ['VPIS', ['PK, FK uporabnik_id', 'PK, FK predmet_id']],
      ['GRADIVO', ['PK id', 'FK predmet_id, nalozil_id', 'naslov, pot_datoteke']],
      ['ODDAJA', ['PK id', 'FK ucenec_id, predmet_id', 'naslov_naloge, pot_datoteke']]
    ];
    stran.innerHTML = '<div class="okvir okvir-besedilo">' +
      glavaStrani('Dokumentacija', 'Povzetek zasnove. Celotna dokumentacija je v mapi <code>docs/</code> repozitorija.') +
      '<div class="dok">' +
        '<details open><summary>Namen in vloge</summary><div class="dok-vsebina">' +
          '<p>Spletna aplikacija za podporo šolskemu delu na daljavo s tremi pogledi: <strong>administrator</strong> (predmeti, učitelji, učenci, dodelitve), ' +
          '<strong>učitelj</strong> (gradiva, oddane naloge) in <strong>učenec</strong> (profil, predmeti, gradiva, oddaja nalog).</p></div></details>' +

        '<details open><summary>Šolski e-poštni naslovi</summary><div class="dok-vsebina">' +
          '<table class="tabela tabela-preprosta"><thead><tr><th scope="col">Vloga</th><th scope="col">Domena</th><th scope="col">Primer</th></tr></thead><tbody>' +
            '<tr><td data-oznaka="Vloga">Učenec (dijak)</td><td data-oznaka="Domena">@' + E.DOMENA_DIJAK + '</td><td data-oznaka="Primer" class="email">ana.novak@' + E.DOMENA_DIJAK + '</td></tr>' +
            '<tr><td data-oznaka="Vloga">Učitelj</td><td data-oznaka="Domena">@' + E.DOMENA_ZAPOSLENI + '</td><td data-oznaka="Primer" class="email">ana.horvat@' + E.DOMENA_ZAPOSLENI + '</td></tr>' +
            '<tr><td data-oznaka="Vloga">Administrator</td><td data-oznaka="Domena">@' + E.DOMENA_ZAPOSLENI + '</td><td data-oznaka="Primer" class="email">admin@' + E.DOMENA_ZAPOSLENI + '</td></tr>' +
          '</tbody></table>' +
          '<p>V obrazcih je domena vnaprej določena glede na vlogo, zato napačne domene ni mogoče vnesti. Pravila so v datoteki <code>js/email.js</code>, ' +
          'ki deluje tudi v Node.js, da jih lahko enako preveri strežnik. Del pred @ sme vsebovati male črke brez šumnikov, številke in znake . _ -</p></div></details>' +

        '<details><summary>Podatkovna baza (ER)</summary><div class="dok-vsebina"><div class="er">' +
          ER.map((t) => '<div class="ent"><strong>' + t[0] + '</strong>' + t[1].map((s) => '<span>' + s + '</span>').join('') + '</div>').join('') +
          '</div><p class="tiho">UPORABNIK 1:N UCITELJ_PREDMET, VPIS, GRADIVO, ODDAJA. PREDMET 1:N UCITELJ_PREDMET, VPIS, GRADIVO, ODDAJA. ' +
          'Prototip uporablja enake tabele (<code>js/podatki.js</code>).</p></div></details>' +

        '<details><summary>Arhitektura</summary><div class="dok-vsebina"><ol class="tok">' +
          '<li>Brskalnik</li><li>Nginx (HTTPS)</li><li>Aplikacija</li><li>Podatkovna baza</li></ol></div></details>' +

        '<details><summary>Zahteve in varnost</summary><div class="dok-vsebina"><ul>' +
          '<li>Gesla so zgoščena (bcrypt), nikoli v čistem besedilu.</li>' +
          '<li>Avtorizacija po vlogah; učitelj ureja samo svoje predmete.</li>' +
          '<li>Učenec obiskuje najmanj 2 predmeta.</li>' +
          '<li>Ponovna oddaja povozi datoteko šele po potrditvi učenca.</li>' +
          '<li>Dovoljene končnice: ' + P.DATOTEKE.koncnice.join(', ') + '. Največ 10 MB.</li>' +
          '<li>Odzivna postavitev deluje od 360 px naprej.</li></ul></div></details>' +

        '<details><summary>Omejitve prototipa</summary><div class="dok-vsebina"><ul>' +
          '<li>Prototip nima strežnika. Podatki so v localStorage tega brskalnika, datoteke pa samo v pomnilniku do osvežitve strani.</li>' +
          '<li>Preverjanje pravic in vnosov v brskalniku je mogoče obiti, zato ga mora prava aplikacija ponoviti na strežniku.</li>' +
          '<li>Zgostitev gesla v prototipu je demonstracijska (FNV-1a), ne varna.</li></ul></div></details>' +

        '<details><summary>Skupina</summary><div class="dok-vsebina">' +
          '<p>Jernej Robnik (vzdrževalec IS), Vid Strmčnik (razvijalec), Lan Plazar (razvijalec). Mentor: Andraž Pušnik.</p></div></details>' +
      '</div></div>';
  }

  /* ================================================================
     Seznam poti
     ================================================================ */

  POTI = {
    '/prijava': { naslov: 'Prijava', javno: true, samoOdjavljen: true, pogled: pogledPrijava },
    '/registracija': { naslov: 'Registracija', javno: true, samoOdjavljen: true, pogled: pogledRegistracija },
    '/dokumentacija': { naslov: 'Dokumentacija', javno: true, pogled: pogledDokumentacija },
    '/admin/predmeti': { naslov: 'Predmeti', vloga: 'admin', pogled: pogledPredmeti },
    '/admin/ucitelji': { naslov: 'Učitelji', vloga: 'admin', pogled: (s) => pogledUporabniki(s, 'ucitelj') },
    '/admin/ucenci': { naslov: 'Učenci', vloga: 'admin', pogled: (s) => pogledUporabniki(s, 'ucenec') },
    '/admin/dodelitve': { naslov: 'Dodelitve', vloga: 'admin', pogled: pogledDodelitve },
    '/ucitelj/gradiva': { naslov: 'Gradiva', vloga: 'ucitelj', pogled: pogledUciteljGradiva },
    '/ucitelj/oddaje': { naslov: 'Oddane naloge', vloga: 'ucitelj', pogled: pogledUciteljOddaje },
    '/ucenec/predmeti': { naslov: 'Moji predmeti', vloga: 'ucenec', pogled: pogledUcenecPredmeti },
    '/ucenec/gradiva': { naslov: 'Gradiva', vloga: 'ucenec', pogled: pogledUcenecGradiva },
    '/ucenec/oddaja': { naslov: 'Oddaja nalog', vloga: 'ucenec', pogled: pogledUcenecOddaja },
    '/ucenec/profil': { naslov: 'Moj profil', vloga: 'ucenec', pogled: pogledUcenecProfil }
  };

  /* ================================================================
     Globalni dogodki
     ================================================================ */

  document.addEventListener('click', async (e) => {
    const t = e.target;

    if (t.closest('.preskoci')) {
      e.preventDefault();
      const m = $('#vsebina');
      m.focus();
      m.scrollIntoView();
      return;
    }
    const prikazi = t.closest('.prikazi-geslo');
    if (prikazi) {
      const vnos = document.getElementById(prikazi.getAttribute('aria-controls'));
      const vidno = vnos.type === 'password';
      vnos.type = vidno ? 'text' : 'password';
      prikazi.textContent = vidno ? 'Skrij' : 'Pokaži';
      prikazi.setAttribute('aria-pressed', String(vidno));
      return;
    }
    if (t.closest('[data-tema]')) {
      const nova = tema() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nova;
      try { localStorage.setItem('solski-is:tema', nova); } catch (err) { /* ni pomembno */ }
      izrisiGlavo(P.trenutni(), preberiPot().pot);
      $('[data-tema]').focus();
      return;
    }
    const meniGumb = t.closest('.meni-gumb');
    if (meniGumb) {
      const odprt = meniGumb.getAttribute('aria-expanded') === 'true';
      meniGumb.setAttribute('aria-expanded', String(!odprt));
      document.body.classList.toggle('meni-odprt', !odprt);
      return;
    }
    if (t.closest('[data-odjava]')) {
      P.odjava();
      document.body.classList.remove('meni-odprt');
      obvestilo('Odjavljeni ste.');
      pojdi('/prijava');
      return;
    }
    if (t.closest('[data-ponastavi]')) {
      const ok = await odpriDialog({
        naslov: 'Ponastavim demo podatke?', nevarno: true, potrdi: 'Ponastavi',
        telo: '<p>Vse spremembe v tem brskalniku (dodani predmeti, uporabniki, gradiva in oddaje) bodo izbrisane. Vrnejo se začetni testni podatki: 10 predmetov, 20 učiteljev in 100 učencev.</p>'
      });
      if (!ok) return;
      P.ponastavi();
      datoteke.clear();
      if (!P.trenutni()) P.odjava();
      obvestilo('Demo podatki so ponastavljeni.');
      izrisi();
      return;
    }
    // klik izven odprtega uporabniškega menija ga zapre
    const odprt = $('details.uporabnik[open]');
    if (odprt && !odprt.contains(t)) odprt.open = false;
  });

  // Povezave v mobilnem meniju zaprejo meni
  document.addEventListener('click', (e) => {
    if (e.target.closest('.meni a')) document.body.classList.remove('meni-odprt');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const odprt = $('details.uporabnik[open]');
      if (odprt) { odprt.open = false; $('summary', odprt).focus(); }
      if (document.body.classList.contains('meni-odprt')) {
        document.body.classList.remove('meni-odprt');
        const g = $('.meni-gumb');
        if (g) { g.setAttribute('aria-expanded', 'false'); g.focus(); }
      }
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const v = document.activeElement;
      if (v && (/^(INPUT|TEXTAREA|SELECT)$/.test(v.tagName) || v.isContentEditable)) return;
      if ($('#dialog').open) return;
      const iskalnik = $('#vsebina [data-iskanje]');
      if (iskalnik) { e.preventDefault(); iskalnik.focus(); }
    }
  });

  window.addEventListener('hashchange', izrisi);
  // Če se podatki spremenijo v drugem zavihku, osvežimo pogled.
  window.addEventListener('storage', (e) => { if (e.key && e.key.indexOf('solski-is:') === 0 && e.key !== 'solski-is:tema') location.reload(); });
  P.obNapisu(() => izrisiGlavo(P.trenutni(), preberiPot().pot));

  izrisiNogo();
  izrisi();
})();
