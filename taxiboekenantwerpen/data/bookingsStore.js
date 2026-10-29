/**
 * bookingsStore.js
 * -----------------------------------------------------------------------
 * MINIMALE opslag voor boekingen, als JSON-bestand op schijf.
 *
 * ⚠️ Dit is bedoeld om meteen te kunnen testen. Voor een productie-omgeving
 * met meerdere gelijktijdige boekingen raden we sterk een echte database aan
 * (bv. PostgreSQL, MySQL of SQLite via Prisma/Sequelize). De interface
 * hieronder (get/save/all) blijft dan identiek, enkel de implementatie
 * verandert.
 * -----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bookings.json');

function laadAlles() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function schrijfAlles(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function save(boeking) {
  const alles = laadAlles();
  alles[boeking.id] = boeking;
  schrijfAlles(alles);
  return boeking;
}

function get(id) {
  const alles = laadAlles();
  return alles[id] || null;
}

function all() {
  return Object.values(laadAlles());
}

module.exports = { save, get, all };
