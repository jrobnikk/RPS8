/*
 * Šolski IS – izboljšave v brskalniku (progresivna izboljšava).
 * Brez tega skripta vse deluje: strežnik preveri vse vnose sam (zahteva N7).
 */
(function () {
  'use strict';

  var E = window.SolskiEmail;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var iskalno = function (s) { return E ? E.brezSumnikov(s).toLowerCase() : String(s).toLowerCase(); };
  var brezPreloma = function (t) {
    var div = document.createElement('div');
    div.textContent = t;
    return div.innerHTML.replace(/@[a-z0-9.-]+[a-z0-9]/g, function (m) { return '<span class="brez-preloma">' + m + '</span>'; });
  };

  /* ---------- tema, meni, uporabniški meni, obvestila ---------- */

  function tema() {
    return document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-tema]')) {
      var nova = tema() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nova;
      try { localStorage.setItem('solski-is:tema', nova); } catch (err) { /* ni pomembno */ }
      return;
    }
    var meni = t.closest('.meni-gumb');
    if (meni) {
      var odprt = meni.getAttribute('aria-expanded') === 'true';
      meni.setAttribute('aria-expanded', String(!odprt));
      document.body.classList.toggle('meni-odprt', !odprt);
      return;
    }
    var prikazi = t.closest('.prikazi-geslo');
    if (prikazi) {
      var vnos = document.getElementById(prikazi.getAttribute('aria-controls'));
      var vidno = vnos.type === 'password';
      vnos.type = vidno ? 'text' : 'password';
      prikazi.textContent = vidno ? 'Skrij' : 'Pokaži';
      prikazi.setAttribute('aria-pressed', String(vidno));
      return;
    }
    var zapri = t.closest('.obvestilo-zapri');
    if (zapri) { zapri.closest('.obvestilo').remove(); return; }
    var uporabnik = $('details.uporabnik[open]');
    if (uporabnik && !uporabnik.contains(t)) uporabnik.open = false;
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var uporabnik = $('details.uporabnik[open]');
      if (uporabnik) { uporabnik.open = false; $('summary', uporabnik).focus(); }
      var g = $('.meni-gumb[aria-expanded="true"]');
      if (g) { g.setAttribute('aria-expanded', 'false'); document.body.classList.remove('meni-odprt'); g.focus(); }
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var a = document.activeElement;
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
      var iskalnik = $('[data-iskanje]');
      if (iskalnik) { e.preventDefault(); iskalnik.focus(); }
    }
  });

  $$('.prikazi-geslo').forEach(function (g) { g.hidden = false; });
  $$('.obvestilo').forEach(function (o) {
    setTimeout(function () {
      o.classList.add('odhaja');
      setTimeout(function () { o.remove(); }, 200);
    }, o.classList.contains('obvestilo-napaka') || o.classList.contains('obvestilo-opozorilo') ? 10000 : 6000);
  });

  // Polje z napako dobi fokus, da uporabnik takoj vidi, kaj popraviti.
  var neveljavno = $('#vsebina [aria-invalid="true"]');
  if (neveljavno) neveljavno.focus();

  if (!E) return; // brez js/email.js ostanejo samo osnovne izboljšave

  /* ---------- e-pošta z vnaprej določeno domeno (registracija, dodajanje, profil) ---------- */

  $$('[data-polje="email"][data-vloga]').forEach(function (ovoj) {
    var vnos = $('input', ovoj);
    var napakaEl = $('.polje-napaka', ovoj);
    var vloga = ovoj.dataset.vloga;
    var domena = E.domenaZaVlogo(vloga);
    var obrazec = ovoj.closest('form');
    var ime = obrazec.elements.ime;
    var priimek = obrazec.elements.priimek;
    var rocno = !!vnos.value;

    var nastavi = function (besedilo) {
      napakaEl.innerHTML = besedilo ? brezPreloma(besedilo) : '';
      napakaEl.hidden = !besedilo;
      if (besedilo) vnos.setAttribute('aria-invalid', 'true'); else vnos.removeAttribute('aria-invalid');
    };

    vnos.addEventListener('input', function () {
      rocno = vnos.value !== '';
      var d = E.razdeli(vnos.value);
      if (d.domena === null) return nastavi(null);
      if (d.domena === domena) { vnos.value = d.lokalni; return nastavi(null); }
      if (domena.indexOf(d.domena) === 0) return nastavi(null); // uporabnik še tipka domeno
      nastavi(E.preveri(vnos.value, vloga).napaka);
    });
    vnos.addEventListener('blur', function () {
      var d = E.razdeli(vnos.value);
      if (d.domena !== null && (d.domena === '' || domena.indexOf(d.domena) === 0)) vnos.value = d.lokalni;
    });
    var samodejno = function () {
      if (rocno) return;
      vnos.value = E.lokalniIzImena(ime.value, priimek.value);
    };
    if (ime && priimek) { ime.addEventListener('input', samodejno); priimek.addEventListener('input', samodejno); }
  });

  /* ---------- prijava: žig vrste računa in dokončanje naslova ---------- */

  var prijava = $('#p-email');
  if (prijava) {
    var pecat = $('.pecat');
    var predlogi = $('.predlogi');
    var stanje = $('#p-email-stanje');
    var DOMENE = [[E.DOMENA_DIJAK, 'dijak'], [E.DOMENA_ZAPOSLENI, 'zaposleni']];
    var zadnja = null;
    var posodobi = function () {
      var v = E.normaliziraj(prijava.value);
      var d = E.razdeli(v);
      var vrsta = E.vrstaRacuna(v);
      if (vrsta !== zadnja) {
        zadnja = vrsta;
        pecat.hidden = !vrsta;
        pecat.textContent = vrsta === 'dijak' ? 'Dijak' : 'Zaposleni';
        pecat.classList.remove('udarec');
        void pecat.offsetWidth;
        if (vrsta) pecat.classList.add('udarec');
        prijava.classList.toggle('ima-pecat', !!vrsta);
      }
      var seznam = d.lokalni && !vrsta && !/\s/.test(d.lokalni)
        ? DOMENE.filter(function (x) { return d.domena === null || x[0].indexOf(d.domena) === 0; })
        : [];
      predlogi.innerHTML = '';
      if (seznam.length) {
        var oznaka = document.createElement('span');
        oznaka.className = 'predlogi-oznaka';
        oznaka.textContent = 'Dokončaj naslov:';
        predlogi.appendChild(oznaka);
        seznam.forEach(function (x) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'predlog';
          b.dataset.email = d.lokalni + '@' + x[0];
          b.textContent = d.lokalni;
          var s = document.createElement('strong');
          s.textContent = '@' + x[0];
          b.appendChild(s);
          predlogi.appendChild(b);
        });
      }
      predlogi.hidden = !seznam.length;
      var besedilo;
      if (vrsta === 'dijak') besedilo = 'Dijaški naslov.';
      else if (vrsta === 'zaposleni') besedilo = 'Naslov zaposlenega (učitelj ali administrator).';
      else if (d.domena && d.domena.indexOf('.') >= 0 && !seznam.length) besedilo = 'To ni šolski naslov. Dijaki uporabljajo @' + E.DOMENA_DIJAK + ', zaposleni @' + E.DOMENA_ZAPOSLENI + '.';
      else besedilo = 'Dijaki se prijavijo z naslovom @' + E.DOMENA_DIJAK + ', zaposleni z @' + E.DOMENA_ZAPOSLENI + '.';
      stanje.innerHTML = brezPreloma(besedilo);
    };
    prijava.addEventListener('input', posodobi);
    predlogi.addEventListener('click', function (e) {
      var b = e.target.closest('[data-email]');
      if (!b) return;
      prijava.value = b.dataset.email;
      posodobi();
      var geslo = prijava.form.elements.geslo;
      if (geslo) geslo.focus();
    });
    if (prijava.value) posodobi();
  }

  /* ---------- registracija: dolžina gesla ---------- */

  $$('form[action="/registracija"] input[name="geslo"]').forEach(function (vnos) {
    var namig = document.getElementById(vnos.id + '-n');
    vnos.addEventListener('input', function () {
      var manjka = 8 - vnos.value.length;
      var oblike = ['znak', 'znaka', 'znaki', 'znakov'];
      var o = manjka % 100;
      var i = o === 1 ? 0 : o === 2 ? 1 : (o === 3 || o === 4) ? 2 : 3;
      namig.textContent = !vnos.value ? 'Najmanj 8 znakov.' : manjka > 0 ? 'Še ' + manjka + ' ' + oblike[i] + '.' : 'Dolžina je ustrezna.';
      namig.classList.toggle('dobro', manjka <= 0);
    });
  });

  /* ---------- izbira datoteke ---------- */

  $$('.spusti').forEach(function (cona) {
    var vnos = $('input[type=file]', cona);
    var ovoj = cona.closest('.polje');
    var napakaEl = $('.polje-napaka', ovoj);
    var besedilo = $('.spusti-besedilo', cona);
    var izbrano = $('.spusti-izbrano', cona);
    var koncnice = (cona.dataset.koncnice || '').split(',');
    var najvec = Number(cona.dataset.najvec) || Infinity;
    var velikost = function (b) {
      if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
      return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
    };
    vnos.addEventListener('change', function () {
      var f = vnos.files[0];
      cona.classList.toggle('ima', !!f);
      besedilo.hidden = !!f;
      izbrano.hidden = !f;
      napakaEl.hidden = true;
      vnos.removeAttribute('aria-invalid');
      if (!f) return;
      izbrano.innerHTML = '';
      var ime = document.createElement('strong');
      ime.textContent = f.name;
      var vel = document.createElement('span');
      vel.textContent = velikost(f.size);
      var zamenjaj = document.createElement('span');
      zamenjaj.className = 'spusti-zamenjaj';
      zamenjaj.textContent = 'Zamenjaj';
      izbrano.append(ime, ' ', vel, ' ', zamenjaj);
      var i = f.name.lastIndexOf('.');
      var k = i > 0 ? f.name.slice(i + 1).toLowerCase() : '';
      var napaka = koncnice.indexOf(k) < 0 ? 'Končnica ».' + (k || '?') + '« ni dovoljena.'
        : f.size > najvec ? 'Datoteka je večja od 10 MB.'
        : !f.size ? 'Datoteka je prazna.' : '';
      if (napaka) { napakaEl.textContent = napaka; napakaEl.hidden = false; vnos.setAttribute('aria-invalid', 'true'); }
    });
    ['dragenter', 'dragover'].forEach(function (t) { cona.addEventListener(t, function () { cona.classList.add('vlecem'); }); });
    ['dragleave', 'drop'].forEach(function (t) { cona.addEventListener(t, function () { cona.classList.remove('vlecem'); }); });
  });

  /* ---------- oddaja: predogled imena datoteke in opozorilo o povozu ---------- */

  var oddaja = $('form[data-oddaja]');
  if (oddaja) {
    var f = oddaja.elements;
    var predogled = $('.predogled', oddaja);
    var izhod = $('.predogled-ime', oddaja);
    var namig = document.getElementById(f.naslov.id + '-n');
    var opcije = $$('#oddani-naslovi option');
    var posodobiOddajo = function () {
      var naslov = f.naslov.value.trim().replace(/\s+/g, ' ');
      var dat = f.datoteka.files[0];
      var i = dat ? dat.name.lastIndexOf('.') : -1;
      var konc = i > 0 ? dat.name.slice(i + 1).toLowerCase() : '';
      predogled.hidden = false;
      izhod.textContent = '';
      var del = function (besedilo, tiho) {
        var s = document.createElement('span');
        if (tiho) s.className = 'tiho';
        s.textContent = besedilo;
        izhod.appendChild(s);
      };
      del(oddaja.dataset.priimek + ' ' + oddaja.dataset.ime + ' – ');
      del(naslov ? naslov.replace(/[\\/]/g, '-').replace(/[:*?"<>|]/g, '') : 'Naslov naloge', !naslov);
      del('.' + (konc || 'končnica'), !konc);
      var staro = opcije.filter(function (o) {
        return o.dataset.predmet === f.predmet.value && o.value.toLocaleLowerCase('sl') === naslov.toLocaleLowerCase('sl');
      })[0];
      namig.textContent = staro ? 'To nalogo ste že oddali (' + staro.dataset.oddano + '). Ob ponovni oddaji boste potrdili povoz.' : '';
      namig.classList.toggle('opozorilo-besedilo', !!staro);
    };
    f.naslov.addEventListener('input', posodobiOddajo);
    f.predmet.addEventListener('change', posodobiOddajo);
    f.datoteka.addEventListener('change', posodobiOddajo);
    posodobiOddajo();
  }

  /* ---------- izbor predmetov: sprotni števec (najmanj 2 za učenca) ---------- */

  $$('form[data-izbor-predmetov]').forEach(function (obrazec) {
    var stanje = $('.dodelitve-stanje', obrazec);
    var najmanj = Number(obrazec.dataset.najmanj) || 0;
    var oblike = ['Izbran je ', 'Izbrana sta ', 'Izbrani so ', 'Izbranih je '];
    var predmetov = ['predmet', 'predmeta', 'predmeti', 'predmetov'];
    obrazec.addEventListener('change', function () {
      var n = $$('input[name=predmet]:checked', obrazec).length;
      var o = n % 100;
      var i = o === 1 ? 0 : o === 2 ? 1 : (o === 3 || o === 4) ? 2 : 3;
      var premalo = n < najmanj;
      stanje.classList.remove('zavrnjeno');
      stanje.textContent = oblike[i] + n + ' ' + predmetov[i] + '.' + (premalo ? ' Potrebna sta vsaj ' + najmanj + '.' : '');
      stanje.classList.toggle('opozorilo-besedilo', premalo);
    });
  });

  /* ---------- dodelitve: iskanje po seznamu oseb ---------- */

  var filter = $('[data-filter-oseb]');
  if (filter) {
    var izbrana = $('.osebe [aria-current]');
    if (izbrana) izbrana.scrollIntoView({ block: 'nearest' });
    filter.addEventListener('input', function () {
      var q = iskalno(filter.value.trim());
      var vidnih = 0;
      $$('.osebe li').forEach(function (li) {
        var vidna = !q || iskalno(li.dataset.iskanjeVsebina).indexOf(q) >= 0;
        li.hidden = !vidna;
        if (vidna) vidnih++;
      });
      $('.osebe-prazno').hidden = vidnih > 0;
    });
  }
})();
