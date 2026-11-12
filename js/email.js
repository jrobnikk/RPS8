/*
 * Pravila za šolske e-poštne naslove
 * ----------------------------------
 * Dijaki (vloga "ucenec"):           ime.priimek@dijak.sc-celje.si
 * Učitelji in administrator:         ime.priimek@sc-celje.si
 *
 * Datoteka deluje v brskalniku (window.SolskiEmail) in v Node.js
 * (const SolskiEmail = require('./js/email.js')), zato lahko ista pravila
 * uporabite tudi pri preverjanju na strežniku (zahteva N7). Preverjanje
 * samo v brskalniku ni dovolj, ker ga je mogoče obiti.
 */
(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.SolskiEmail = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DOMENA_DIJAK = 'dijak.sc-celje.si';
  var DOMENA_ZAPOSLENI = 'sc-celje.si';
  var NAJVEC_ZNAKOV = 100; // stolpec UPORABNIK.email je VARCHAR(100)

  var DOMENA_VLOGE = {
    ucenec: DOMENA_DIJAK,
    ucitelj: DOMENA_ZAPOSLENI,
    admin: DOMENA_ZAPOSLENI
  };

  // Pred @: male črke a–z, številke, ločila . _ - (ne na začetku, koncu ali dvakrat zapored).
  var LOKALNI_DEL = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

  function normaliziraj(email) {
    return String(email == null ? '' : email).trim().toLowerCase();
  }

  function razdeli(email) {
    var e = normaliziraj(email);
    var i = e.lastIndexOf('@');
    if (i < 0) return { lokalni: e, domena: null };
    return { lokalni: e.slice(0, i), domena: e.slice(i + 1) };
  }

  /** 'dijak', 'zaposleni' ali null (ni šolski naslov). */
  function vrstaRacuna(email) {
    var d = razdeli(email).domena;
    if (d === DOMENA_DIJAK) return 'dijak';
    if (d === DOMENA_ZAPOSLENI) return 'zaposleni';
    return null;
  }

  function domenaZaVlogo(vloga) {
    return DOMENA_VLOGE[vloga] || null;
  }

  /** Odstrani šumnike in druge naglasne znake: Čož Đurić -> coz.duric */
  function brezSumnikov(besedilo) {
    return String(besedilo || '')
      .replace(/[đĐ]/g, function (z) { return z === 'đ' ? 'd' : 'D'; })
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  /** Iz imena in priimka sestavi lokalni del naslova: "Ana Marija", "Novak" -> ana.marija.novak */
  function lokalniIzImena(ime, priimek) {
    return brezSumnikov((ime || '') + ' ' + (priimek || ''))
      .toLowerCase()
      .replace(/[^a-z0-9\s.-]/g, '')
      .trim()
      .replace(/[\s.]+/g, '.')
      .replace(/^[.-]+|[.-]+$/g, '');
  }

  function predlagaj(ime, priimek, vloga) {
    var lokalni = lokalniIzImena(ime, priimek);
    var domena = domenaZaVlogo(vloga);
    return lokalni && domena ? lokalni + '@' + domena : '';
  }

  /**
   * Preveri naslov za dano vlogo.
   * Vrne { ok: true, email } ali { ok: false, napaka }.
   */
  function preveri(email, vloga) {
    var e = normaliziraj(email);
    var pricakovana = domenaZaVlogo(vloga);
    if (!pricakovana) return { ok: false, napaka: 'Neznana vloga uporabnika.' };
    if (!e) return { ok: false, napaka: 'Vpišite e-poštni naslov.' };
    if (e.length > NAJVEC_ZNAKOV) return { ok: false, napaka: 'Naslov je predolg (največ ' + NAJVEC_ZNAKOV + ' znakov).' };

    var d = razdeli(e);
    if (!d.lokalni) return { ok: false, napaka: 'Pred znakom @ manjka ime, npr. ime.priimek.' };
    if (!LOKALNI_DEL.test(d.lokalni)) {
      return { ok: false, napaka: 'Pred @ uporabite samo male črke brez šumnikov, številke in znake . _ -' };
    }
    if (d.domena === null) return { ok: false, napaka: 'Naslov se mora končati z @' + pricakovana + '.' };

    if (d.domena !== pricakovana) {
      if (vloga === 'ucenec') {
        return { ok: false, napaka: d.domena === DOMENA_ZAPOSLENI
          ? 'To je naslov zaposlenega. Dijaki uporabljajo naslov, ki se konča z @' + DOMENA_DIJAK + '.'
          : 'Dijaki uporabljajo šolski naslov, ki se konča z @' + DOMENA_DIJAK + '.' };
      }
      return { ok: false, napaka: d.domena === DOMENA_DIJAK
        ? 'To je dijaški naslov. Učitelji uporabljajo naslov, ki se konča z @' + DOMENA_ZAPOSLENI + '.'
        : 'Učitelji uporabljajo šolski naslov, ki se konča z @' + DOMENA_ZAPOSLENI + '.' };
    }
    return { ok: true, email: e };
  }

  return {
    DOMENA_DIJAK: DOMENA_DIJAK,
    DOMENA_ZAPOSLENI: DOMENA_ZAPOSLENI,
    NAJVEC_ZNAKOV: NAJVEC_ZNAKOV,
    normaliziraj: normaliziraj,
    razdeli: razdeli,
    vrstaRacuna: vrstaRacuna,
    domenaZaVlogo: domenaZaVlogo,
    brezSumnikov: brezSumnikov,
    lokalniIzImena: lokalniIzImena,
    predlagaj: predlagaj,
    preveri: preveri
  };
});
