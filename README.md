/**
 * fareRules.js
 * -----------------------------------------------------------------------
 * Eén centrale bron van waarheid voor alle tarieven van Taxi Boeken Antwerpen.
 * Wordt gebruikt door de backend (server.js) om de PRIJS TE HERBEREKENEN EN
 * TE VALIDEREN. Vertrouw NOOIT op een prijs die van de browser komt — een
 * bezoeker kan die manipuleren via de devtools. De backend is altijd de
 * uiteindelijke bron voor het bedrag dat effectief gefactureerd wordt.
 * -----------------------------------------------------------------------
 */

const VEHICLES = {
  comfort: {
    id: 'comfort',
    label: 'Comfort — Toyota Corolla Touring',
    startTarief: 6.95,
    prijsPerKm: 2.95,
    wachttijdPerUur: 50.0,
  },
  luxe: {
    id: 'luxe',
    label: 'Luxe / Executive — BMW 530e xDrive',
    startTarief: 10.0,
    prijsPerKm: 3.2,
    wachttijdPerUur: 60.0,
  },
};

/**
 * Vaste trajecten. Elke sleutel bevat een lijst "matchWords": als het
 * ophaal- of bestemmingsadres (case-insensitive) één van die woorden bevat
 * EN het andere adres "antwerpen" bevat, wordt dit vaste tarief gebruikt
 * in plaats van de kilometerberekening.
 *
 * "weekendToeslag: true" betekent: er bestaat een apart weekendtarief
 * (zaterdag/zondag). Anders geldt het "weekday"-tarief alle dagen.
 */
const FIXED_ROUTES = [
  {
    id: 'zaventem',
    label: 'Antwerpen ⇄ Brussels Airport (Zaventem)',
    matchWords: ['zaventem', 'brussels airport', 'brussel nationaal', 'bru airport'],
    weekendToeslag: true,
    prices: {
      comfort: { weekday: 80.0, weekend: 90.0 },
      luxe: { weekday: 100.0, weekend: 110.0 },
    },
  },
  {
    id: 'charleroi',
    label: 'Antwerpen ⇄ Charleroi Airport',
    matchWords: ['charleroi'],
    weekendToeslag: false,
    prices: {
      comfort: { weekday: 160.0, weekend: 160.0 },
      luxe: { weekday: 180.0, weekend: 180.0 },
    },
  },
  {
    id: 'schiphol',
    label: 'Antwerpen ⇄ Schiphol Airport',
    matchWords: ['schiphol'],
    weekendToeslag: false,
    prices: {
      comfort: { weekday: 250.0, weekend: 250.0 },
      luxe: { weekday: 270.0, weekend: 270.0 },
    },
  },
  {
    id: 'brussel-zuid',
    label: 'Antwerpen ⇄ Station Brussel-Zuid (Eurostar/Thalys)',
    matchWords: ['brussel-zuid', 'brussel zuid', 'bruxelles-midi', 'bruxelles midi', 'gare du midi', 'brussels-midi', 'brussels south'],
    weekendToeslag: false,
    prices: {
      comfort: { weekday: 100.0, weekend: 100.0 },
      luxe: { weekday: 120.0, weekend: 120.0 },
    },
  },
];

const ANTWERP_WORDS = ['antwerpen', 'antwerp', 'anvers'];

function bevatWoord(tekst, woorden) {
  if (!tekst) return false;
  const t = tekst.toLowerCase();
  return woorden.some((w) => t.includes(w));
}

function isWeekend(datumIso) {
  const d = datumIso ? new Date(datumIso) : new Date();
  const dag = d.getDay(); // 0 = zondag, 6 = zaterdag
  return dag === 0 || dag === 6;
}

/**
 * Zoekt of het traject (pickup -> destination) overeenkomt met een vast
 * traject. Geeft het traject-object terug, of null als er geen match is.
 */
function vindVastTraject(pickupAdres, bestemmingAdres) {
  const pickupIsAntwerpen = bevatWoord(pickupAdres, ANTWERP_WORDS);
  const bestemmingIsAntwerpen = bevatWoord(bestemmingAdres, ANTWERP_WORDS);

  for (const traject of FIXED_ROUTES) {
    const pickupMatch = bevatWoord(pickupAdres, traject.matchWords);
    const bestemmingMatch = bevatWoord(bestemmingAdres, traject.matchWords);

    // Eén kant moet Antwerpen zijn, de andere kant het vaste punt (luchthaven/station)
    if ((pickupIsAntwerpen && bestemmingMatch) || (bestemmingIsAntwerpen && pickupMatch)) {
      return traject;
    }
  }
  return null;
}

/**
 * Berekent de volledige ritprijs.
 *
 * @param {Object} opts
 * @param {string} opts.pickupAdres
 * @param {string} opts.bestemmingAdres
 * @param {'comfort'|'luxe'} opts.voertuig
 * @param {number} opts.afstandKm - afstand in km (via Google Distance Matrix)
 * @param {string} [opts.datumIso] - ISO-datum van de rit (voor weekendtarief)
 * @param {boolean} [opts.retour] - of het een retourrit is
 * @param {number} [opts.wachttijdMinuten] - extra gefactureerde wachttijd in minuten
 */
function berekenRitprijs({
  pickupAdres,
  bestemmingAdres,
  voertuig,
  afstandKm = 0,
  datumIso,
  retour = false,
  wachttijdMinuten = 0,
}) {
  if (!VEHICLES[voertuig]) {
    throw new Error(`Onbekende voertuigklasse: ${voertuig}`);
  }

  const vehicle = VEHICLES[voertuig];
  const weekend = isWeekend(datumIso);
  const vastTraject = vindVastTraject(pickupAdres, bestemmingAdres);

  let basisprijs;
  let type;
  let trajectLabel = null;

  if (vastTraject) {
    type = 'vast_tarief';
    trajectLabel = vastTraject.label;
    basisprijs = weekend && vastTraject.weekendToeslag
      ? vastTraject.prices[voertuig].weekend
      : vastTraject.prices[voertuig].weekday;
  } else {
    type = 'kilometertarief';
    const kmKost = afstandKm * vehicle.prijsPerKm;
    basisprijs = vehicle.startTarief + kmKost;
  }

  const wachttijdKost = (wachttijdMinuten / 60) * vehicle.wachttijdPerUur;
  let totaal = basisprijs + wachttijdKost;

  if (retour) {
    totaal = totaal * 2;
  }

  return {
    voertuig: vehicle.label,
    type,
    trajectLabel,
    weekendtarief: weekend,
    afstandKm: Number(afstandKm.toFixed(1)),
    basisprijs: Number(basisprijs.toFixed(2)),
    wachttijdKost: Number(wachttijdKost.toFixed(2)),
    retour,
    totaal: Number(totaal.toFixed(2)),
  };
}

module.exports = {
  VEHICLES,
  FIXED_ROUTES,
  berekenRitprijs,
  vindVastTraject,
  isWeekend,
};
