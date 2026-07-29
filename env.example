/**
 * fareRules.js (browser)
 * -----------------------------------------------------------------------
 * Kopie van shared/fareRules.js, puur voor een snelle indicatieve weergave
 * in de taximeter-widget vóórdat de boeking wordt bevestigd.
 *
 * ⚠️ BELANGRIJK: dit is NOOIT de uiteindelijke prijs. De backend
 * (server.js + shared/fareRules.js) herberekent alles server-side op basis
 * van de officiële Google Distance Matrix-afstand, en die prijs is bindend.
 * Hou deze twee bestanden inhoudelijk gelijklopend als je tarieven wijzigt.
 * -----------------------------------------------------------------------
 */

window.FARE_RULES = {
  VEHICLES: {
    comfort: { id: 'comfort', label: 'Comfort — Toyota Corolla Touring', startTarief: 6.95, prijsPerKm: 2.95, wachttijdPerUur: 50.0 },
    luxe: { id: 'luxe', label: 'Executive — BMW 530e xDrive', startTarief: 10.0, prijsPerKm: 3.2, wachttijdPerUur: 60.0 },
  },
  FIXED_ROUTES: [
    {
      id: 'zaventem', label: 'Brussels Airport (Zaventem)',
      matchWords: ['zaventem', 'brussels airport', 'brussel nationaal', 'bru airport'],
      weekendToeslag: true,
      prices: { comfort: { weekday: 80.0, weekend: 90.0 }, luxe: { weekday: 100.0, weekend: 110.0 } },
    },
    {
      id: 'charleroi', label: 'Charleroi Airport',
      matchWords: ['charleroi'], weekendToeslag: false,
      prices: { comfort: { weekday: 160.0, weekend: 160.0 }, luxe: { weekday: 180.0, weekend: 180.0 } },
    },
    {
      id: 'schiphol', label: 'Schiphol Airport',
      matchWords: ['schiphol'], weekendToeslag: false,
      prices: { comfort: { weekday: 250.0, weekend: 250.0 }, luxe: { weekday: 270.0, weekend: 270.0 } },
    },
    {
      id: 'brussel-zuid', label: 'Station Brussel-Zuid',
      matchWords: ['brussel-zuid', 'brussel zuid', 'bruxelles-midi', 'bruxelles midi', 'gare du midi', 'brussels south'],
      weekendToeslag: false,
      prices: { comfort: { weekday: 100.0, weekend: 100.0 }, luxe: { weekday: 120.0, weekend: 120.0 } },
    },
  ],
  ANTWERP_WORDS: ['antwerpen', 'antwerp', 'anvers'],
};

function bevatWoord(tekst, woorden) {
  if (!tekst) return false;
  const t = tekst.toLowerCase();
  return woorden.some((w) => t.includes(w));
}

function isWeekendClient(datumStr) {
  const d = datumStr ? new Date(datumStr) : new Date();
  const dag = d.getDay();
  return dag === 0 || dag === 6;
}

function vindVastTrajectClient(pickupAdres, bestemmingAdres) {
  const { FIXED_ROUTES, ANTWERP_WORDS } = window.FARE_RULES;
  const pickupIsAntwerpen = bevatWoord(pickupAdres, ANTWERP_WORDS);
  const bestemmingIsAntwerpen = bevatWoord(bestemmingAdres, ANTWERP_WORDS);

  for (const traject of FIXED_ROUTES) {
    const pickupMatch = bevatWoord(pickupAdres, traject.matchWords);
    const bestemmingMatch = bevatWoord(bestemmingAdres, traject.matchWords);
    if ((pickupIsAntwerpen && bestemmingMatch) || (bestemmingIsAntwerpen && pickupMatch)) {
      return traject;
    }
  }
  return null;
}

/**
 * Indicatieve prijsberekening in de browser (voor de meter-animatie).
 * afstandKm komt van de Google DistanceMatrixService (client-side).
 */
function berekenIndicatievePrijs({ pickupAdres, bestemmingAdres, voertuig, afstandKm, datumStr, retour }) {
  const vehicle = window.FARE_RULES.VEHICLES[voertuig];
  const weekend = isWeekendClient(datumStr);
  const vastTraject = vindVastTrajectClient(pickupAdres, bestemmingAdres);

  let basisprijs, type, trajectLabel = null;

  if (vastTraject) {
    type = 'vast_tarief';
    trajectLabel = vastTraject.label;
    basisprijs = weekend && vastTraject.weekendToeslag
      ? vastTraject.prices[voertuig].weekend
      : vastTraject.prices[voertuig].weekday;
  } else {
    type = 'kilometertarief';
    basisprijs = vehicle.startTarief + afstandKm * vehicle.prijsPerKm;
  }

  let totaal = basisprijs;
  if (retour) totaal *= 2;

  return {
    type,
    trajectLabel,
    weekendtarief: weekend,
    afstandKm: Number(afstandKm.toFixed(1)),
    totaal: Number(totaal.toFixed(2)),
  };
}
