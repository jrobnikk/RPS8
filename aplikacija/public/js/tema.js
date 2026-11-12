/* Tema se nastavi pred izrisom strani, da ne utripne (naloži se brez »defer«). */
try {
  var t = localStorage.getItem('solski-is:tema');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) { /* localStorage ni na voljo */ }
