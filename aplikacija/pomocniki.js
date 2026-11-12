'use strict';
/* Pomožne funkcije za izpis v pogledih (EJS). Brez zunanjih paketov. */
const P = require('./pravila');

const E = P.email;
const VLOGE = { admin: 'Administrator', ucitelj: 'Učitelj', ucenec: 'Učenec' };
const DOMOV = { admin: '/admin/predmeti', ucitelj: '/ucitelj/gradiva', ucenec: '/ucenec/predmeti' };

const fDatum = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Ljubljana' });
const fUra = new Intl.DateTimeFormat('sl-SI', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Ljubljana' });

const datum = (d) => (d ? fDatum.format(new Date(d)) : '');
const datumUra = (d) => (d ? datum(d) + ', ' + fUra.format(new Date(d)) : '');
const polnoIme = (u) => (u.vloga === 'admin' ? 'Administrator' : u.ime + ' ' + u.priimek);
const inicialke = (u) => (u.vloga === 'admin' ? 'A' : (u.ime[0] || '') + (u.priimek[0] || '')).toUpperCase();
const ubezi = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (z) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' }[z]
));

/** E-pošta, ki se prelomi samo pred @ (v pogledu z <%- %>, vsebina je ubežana). */
function emailHtml(e) {
  const d = E.razdeli(e);
  return d.domena === null ? ubezi(e) : ubezi(d.lokalni) + '<wbr><span class="brez-preloma">@' + ubezi(d.domena) + '</span>';
}

/** Seznam »id:naziv« (vrstice iz GROUP_CONCAT) v predmete. */
function predmetiIzNiza(niz) {
  if (!niz) return [];
  return String(niz).split('\n').map((del) => {
    const i = del.indexOf(':');
    return { id: Number(del.slice(0, i)), naziv: del.slice(i + 1) };
  });
}

const napakaZa = (napaka, polje) => (napaka && napaka.polje === polje ? napaka.napaka : '');

module.exports = { VLOGE, DOMOV, datum, datumUra, polnoIme, inicialke, emailHtml, predmetiIzNiza, napakaZa };
