/**
 * app.js
 * -----------------------------------------------------------------------
 * Frontend-logica voor taxiboekenantwerpen.be:
 *  - Google Places Autocomplete op de adresvelden
 *  - Indicatieve prijsberekening + taximeter-animatie (client-side)
 *  - Boekingsflow: stuurt de rit naar de backend, die de prijs herberekent
 *    en de boeking + eventuele online betaling afhandelt
 *  - WhatsApp "boek via WhatsApp"-knoppen met vooraf ingevulde ritdetails
 * -----------------------------------------------------------------------
 */

const WHATSAPP_NUMMER = '32488908897'; // Officieel WhatsApp Business-nummer: +32 488 90 88 97

let pickupAutocomplete, destinationAutocomplete;
let laatsteBerekening = null; // bewaart de meest recente indicatieve berekening voor de boekingsflow

// -------------------------------------------------------------------------
// Google Places Autocomplete initialiseren zodra de Maps-script geladen is
// -------------------------------------------------------------------------
window.initTaxiAutocomplete = function initTaxiAutocomplete() {
  const opts = { componentRestrictions: { country: ['be', 'nl'] }, fields: ['formatted_address', 'geometry', 'name'] };
  const pickupEl = document.getElementById('pickup');
  const destinationEl = document.getElementById('destination');

  if (window.google && google.maps && google.maps.places) {
    pickupAutocomplete = new google.maps.places.Autocomplete(pickupEl, opts);
    destinationAutocomplete = new google.maps.places.Autocomplete(destinationEl, opts);
  }
};

// Autocomplete wordt optioneel via de Google Maps callback gestart.

// -------------------------------------------------------------------------
// Taximeter-animatie: cijfers tikken op van 0 naar het eindbedrag
// -------------------------------------------------------------------------
function animeerMeter(eindbedrag) {
  const el = document.getElementById('meter-price');
  const duur = 700;
  const start = performance.now();

  function frame(now) {
    const voortgang = Math.min((now - start) / duur, 1);
    const waarde = eindbedrag * voortgang;
    el.textContent = `€ ${waarde.toFixed(2)}`;
    if (voortgang < 1) requestAnimationFrame(frame);
    else el.textContent = `€ ${eindbedrag.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}

// -------------------------------------------------------------------------
// Ritcalculator submit
// -------------------------------------------------------------------------
const fareForm = document.getElementById('fare-form');
const meterEl = document.getElementById('meter');
const meterError = document.getElementById('meter-error');
const openBookingBtn = document.getElementById('open-booking');

fareForm.addEventListener('input', () => { laatsteBerekening = null; openBookingBtn.classList.add('hidden'); });

fareForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  laatsteBerekening = null;

  const pickup = document.getElementById('pickup').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const voertuig = fareForm.querySelector('input[name="voertuig"]:checked').value;
  const datum = document.getElementById('datum').value;
  const retour = document.getElementById('retour').checked;
  const calcBtn = document.getElementById('calc-btn');

  if (!pickup || !destination) return;

  meterEl.classList.remove('hidden');
  meterError.classList.add('hidden');
  openBookingBtn.classList.add('hidden');
  calcBtn.disabled = true;
  calcBtn.textContent = 'Bezig met berekenen…';
  document.getElementById('meter-price').textContent = '€ 0.00';
  document.getElementById('meter-km').textContent = '';
  document.getElementById('meter-label').textContent = 'Bezig…';
  document.getElementById('meter-sub').textContent = '';

  try {
    const response = await fetch('/api/calculate-fare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup, destination, voertuig, datumIso: datum || undefined, retour }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('De lokale backend is niet bereikbaar. Start de website via npm start.');
    const resultaat = await response.json();
    if (!response.ok) throw new Error(resultaat.error || 'Berekening mislukt.');
    const pickupFormatted = resultaat.pickupAdresFormatted;
    const destinationFormatted = resultaat.bestemmingAdresFormatted;

    document.getElementById('meter-label').textContent =
      resultaat.type === 'vast_tarief' ? `Vast tarief — ${resultaat.trajectLabel}` : 'Kilometertarief';
    const euro = value => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(value);
    const tripLabel = retour ? 'Heen en terug — prijs × 2' : 'Enkele rit';
    document.getElementById('meter-sub').textContent = resultaat.type === 'kilometertarief'
      ? tripLabel + ' · ' + euro(voertuig === 'comfort' ? 6.95 : 10) + ' start + ' + euro(voertuig === 'comfort' ? 2.95 : 3.20) + '/km'
      : tripLabel + (resultaat.weekendtarief ? ' · Weekendtarief' : '');
    document.getElementById('meter-km').textContent =
      resultaat.type === 'kilometertarief' ? `± ${resultaat.afstandKm} km enkele reis` : (retour ? 'Retour' : 'Enkele rit');

    animeerMeter(resultaat.totaal);

    laatsteBerekening = {
      pickup: pickupFormatted,
      destination: destinationFormatted,
      voertuig,
      datum,
      retour,
      indicatiefTotaal: resultaat.totaal,
      trajectLabel: resultaat.trajectLabel,
    };

    openBookingBtn.classList.remove('hidden');
  } catch (err) {
    meterError.textContent = err.message || 'Er ging iets mis bij het berekenen van de rit.';
    meterError.classList.remove('hidden');
    document.getElementById('meter-label').textContent = 'Fout';
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = 'Bereken prijs';
  }
});

// -------------------------------------------------------------------------
// Boekingsmodal openen/sluiten
// -------------------------------------------------------------------------
const bookingModal = document.getElementById('booking-modal');
const bookingSummary = document.getElementById('booking-summary');

openBookingBtn.addEventListener('click', () => {
  if (!laatsteBerekening) return;
  bookingSummary.innerHTML = `
    <div><span class="text-silver-400">Van:</span> ${laatsteBerekening.pickup}</div>
    <div><span class="text-silver-400">Naar:</span> ${laatsteBerekening.destination}</div>
    <div><span class="text-silver-400">Voertuig:</span> ${laatsteBerekening.voertuig === 'luxe' ? 'Executive (BMW)' : 'Comfort (Toyota)'}</div>
    <div><span class="text-silver-400">Indicatieve prijs:</span> <span class="font-meter text-gold-400">€ ${laatsteBerekening.indicatiefTotaal.toFixed(2)}</span></div>
    <p class="text-xs text-silver-400 pt-1">Definitieve prijs wordt bevestigd bij het afronden van de boeking.</p>
  `;
  bookingModal.classList.remove('hidden');
});

document.getElementById('close-booking').addEventListener('click', () => bookingModal.classList.add('hidden'));
bookingModal.addEventListener('click', (e) => { if (e.target === bookingModal) bookingModal.classList.add('hidden'); });

// -------------------------------------------------------------------------
// Boeking bevestigen -> POST /api/bookings
// -------------------------------------------------------------------------
const bookingForm = document.getElementById('booking-form');
const bookingError = document.getElementById('booking-error');

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!laatsteBerekening) return;

  const submitBtn = document.getElementById('submit-booking');
  bookingError.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Bezig…';

  const payload = {
    klantNaam: document.getElementById('klantNaam').value.trim(),
    klantTelefoon: document.getElementById('klantTelefoon').value.trim(),
    pickup: laatsteBerekening.pickup,
    destination: laatsteBerekening.destination,
    voertuig: laatsteBerekening.voertuig,
    datumIso: laatsteBerekening.datum || new Date().toISOString(),
    retour: laatsteBerekening.retour,
    betaalmethode: bookingForm.querySelector('input[name="betaalmethode"]:checked').value,
  };

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Boeking kon niet worden aangemaakt.');

    if (data.betaalUrl) {
      // Online betalen -> doorsturen naar de Mollie-checkout
      window.location.href = data.betaalUrl;
      return;
    }

    // Cash betalen -> boeking is meteen bevestigd; stuur ook een WhatsApp-bericht als bevestiging
    stuurWhatsAppBoeking(data.boeking);
    bookingModal.classList.add('hidden');
    alert('Uw boeking is bevestigd! U ontvangt de chauffeur-gegevens via WhatsApp/telefoon.');
  } catch (err) {
    bookingError.textContent = err.message;
    bookingError.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Bevestig boeking';
  }
});

// -------------------------------------------------------------------------
// WhatsApp-integratie
// -------------------------------------------------------------------------
function bouwWhatsAppLink(bericht) {
  return `https://wa.me/${WHATSAPP_NUMMER}?text=${encodeURIComponent(bericht)}`;
}

function bouwOphaalRouteLink(ophaaladres) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(ophaaladres) + '&travelmode=driving';
}

function stuurWhatsAppBoeking(boeking) {
  const bericht =
    `Nieuwe taxiboeking:\n` +
    `Ophaaladres: ${boeking.pickupAdresFormatted}\n` +
    `${bouwOphaalRouteLink(boeking.pickupAdresFormatted)}\n\n` +
    `Bestemming: ${boeking.bestemmingAdresFormatted}\n` +
    `${bouwOphaalRouteLink(boeking.bestemmingAdresFormatted)}\n\n` +
    `Datum: ${new Date(boeking.datumIso).toLocaleString('nl-BE')}\n` +
    `Voertuig: ${boeking.ritprijs.voertuig}\n` +
    `Rit: ${boeking.ritprijs.retour ? 'Heen en terug' : 'Enkele rit'}\n` +
    `Betaalmethode: ${boeking.betaalmethode === 'cash' ? 'Cash aan chauffeur' : 'Online betaald'}\n` +
    `Prijs: € ${boeking.ritprijs.totaal.toFixed(2)}`;
  window.location.assign(bouwWhatsAppLink(bericht));
}

// Algemene WhatsApp-knoppen (nav, hero, floating): vooraf ingevuld generiek bericht,
// of — indien er net een berekening gebeurd is — de concrete ritdetails.
function algemeenWhatsAppBericht() {
  if (laatsteBerekening) {
    return (
      `Hallo, ik wil graag een taxi boeken:\n` +
      `Ophaaladres: ${laatsteBerekening.pickup}\n` +
      `${bouwOphaalRouteLink(laatsteBerekening.pickup)}\n\n` +
      `Rit: ${laatsteBerekening.retour ? 'Heen en terug' : 'Enkele rit'}\n` +
      `Bestemming: ${laatsteBerekening.destination}\n` +
      `${bouwOphaalRouteLink(laatsteBerekening.destination)}\n\n` +
      `Voertuig: ${laatsteBerekening.voertuig === 'luxe' ? 'Executive (BMW)' : 'Comfort (Toyota)'}\n` +
      `Indicatieve prijs: € ${laatsteBerekening.indicatiefTotaal.toFixed(2)}`
    );
  }
  return 'Hallo, ik wil graag een taxi boeken in Antwerpen.';
}

['nav-whatsapp', 'hero-whatsapp', 'floating-whatsapp'].forEach((id) => {
  const el = document.getElementById(id);
  el.href = bouwWhatsAppLink(algemeenWhatsAppBericht());
  el.addEventListener('click', () => {
    el.href = bouwWhatsAppLink(algemeenWhatsAppBericht());
  });
});

// -------------------------------------------------------------------------
// FAQ-accordion
// -------------------------------------------------------------------------
document.querySelectorAll('.faq-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-answer');
    const icon = item.querySelector('.faq-icon');
    const isOpen = !answer.classList.contains('hidden');

    document.querySelectorAll('.faq-answer').forEach((a) => a.classList.add('hidden'));
    document.querySelectorAll('.faq-icon').forEach((i) => (i.textContent = '+'));

    if (!isOpen) {
      answer.classList.remove('hidden');
      icon.textContent = '−';
    }
  });
});
