'use strict';
/* Povezava s podatkovno bazo MariaDB (bazen povezav, čakanje ob zagonu, transakcije). */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'sola',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sola_is',
  charset: 'utf8mb4',          // stolpci imajo slovensko kolacijo, ta ima prednost pri primerjavah
  timezone: 'Z',               // DATETIME v bazi je v UTC (časovni pas vsebnika)
  waitForConnections: true,
  connectionLimit: 10
});

const pocakaj = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ob zagonu Dockerja je baza lahko še nepripravljena, zato poskušamo do 60 sekund. */
async function cakajNaBazo(poskusov = 30) {
  for (let i = 1; i <= poskusov; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      if (i === poskusov) throw e;
      console.log(`Baza še ni pripravljena (${e.code || e.message}), poskus ${i}/${poskusov} ...`);
      await pocakaj(2000);
    }
  }
}

/** Izvede fn(povezava) v transakciji: ob napaki se vse spremembe razveljavijo. */
async function transakcija(fn) {
  const povezava = await pool.getConnection();
  try {
    await povezava.beginTransaction();
    const rezultat = await fn(povezava);
    await povezava.commit();
    return rezultat;
  } catch (e) {
    await povezava.rollback();
    throw e;
  } finally {
    povezava.release();
  }
}

module.exports = { pool, cakajNaBazo, transakcija };
