/**
 * server.js
 * -----------------------------------------------------------------------
 * Backend voor taxiboekenantwerpen.be
 *
 * Verantwoordelijkheden:
 *  - Statische site serveren (public/)
 *  - Afstand opvragen bij Google Distance Matrix API en ritprijs herberekenen
 *    (NOOIT de prijs van de client vertrouwen)
 *  - Boekingen aanmaken en opslaan
 *  - Online betalingen starten via Mollie (Bancontact, Wero, kaarten, Apple Pay)
 *  - Webhook verwerken voor betaalstatus
 *
 * Vereiste environment variables (zie .env.example):
 *  - GOOGLE_MAPS_API_KEY
 *  - MOLLIE_API_KEY
 *  - PUBLIC_BASE_URL     (bv. https://taxiboekenantwerpen.be)
 *  - PORT                (optioneel, default 3000)
 * -----------------------------------------------------------------------
 */

require('dotenv').config();
process.env.TZ = 'Europe/Brussels';
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const { berekenRitprijs } = require('./shared/fareRules');
const bookingsStore = require('./data/bookingsStore');

const app = express();
const PORT = process.env.PORT || 3000;
const validKey = value => value && !/jouw_|your_|__GOOGLE/i.test(value) ? value : '';
const GOOGLE_MAPS_API_KEY = validKey(process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY);
const GOOGLE_MAPS_BROWSER_API_KEY = validKey(process.env.GOOGLE_MAPS_BROWSER_API_KEY || process.env.GOOGLE_MAPS_API_KEY);
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// -------------------------------------------------------------------------
// Middleware
// -------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: false, // Google Maps + externe scripts hebben eigen CSP-noden; verfijn dit voor productie
}));
app.use(express.json());
// index: false zodat "/" niet automatisch het ongewijzigde index.html serveert —
// we injecteren eerst de Google Maps-sleutel (zie route hieronder).


// -------------------------------------------------------------------------
// GET / — injecteert de Google Maps API key server-side in index.html, zodat
// de sleutel niet hardcoded in een statisch bestand hoeft te staan.
// -------------------------------------------------------------------------
const fs = require('fs');
app.get(['/', '/index.html'], (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(htmlPath, 'utf-8', (err, html) => {
    if (err) return res.status(500).send('Kon de pagina niet laden.');
    const mapsScript = GOOGLE_MAPS_BROWSER_API_KEY ? '<script src="https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_BROWSER_API_KEY) + '&libraries=places&language=nl&region=BE&callback=initTaxiAutocomplete" async defer></script>' : '';
    const finalHtml = html.replace('<!-- GOOGLE_MAPS_SCRIPT -->', mapsScript);
    res.set('Content-Type', 'text/html').send(finalHtml);
  });
});


app.use(express.static(path.join(__dirname, 'public'), { index: false }));
// Compatibiliteit met oudere gepubliceerde assetlinks.
app.use('/public', express.static(path.join(__dirname, 'public'), { index: false }));

// Bescherm de rekenroute tegen misbruik/scraping
const calculateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Te veel aanvragen. Probeer het over enkele ogenblikken opnieuw.' },
});

// -------------------------------------------------------------------------
// Hulpfunctie: afstand opvragen via Google Distance Matrix API
// -------------------------------------------------------------------------
async function haalAfstandOp(pickupAdres, bestemmingAdres) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY ontbreekt op de server (.env).');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', pickupAdres);
  url.searchParams.set('destinations', bestemmingAdres);
  url.searchParams.set('units', 'metric');
  url.searchParams.set('region', 'be');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  const data = await res.json();

  if (!res.ok || data.status !== 'OK') throw new Error('Google Maps-routeberekening is niet beschikbaar. Controleer de serversleutel en API-configuratie.');
    const element = data?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') {
    throw new Error('Kon geen route/afstand vinden tussen de opgegeven adressen.');
  }

  return {
    afstandKm: element.distance.value / 1000,
    duurMinuten: Math.round(element.duration.value / 60),
    pickupAdresFormatted: data.origin_addresses?.[0] || pickupAdres,
    bestemmingAdresFormatted: data.destination_addresses?.[0] || bestemmingAdres,
  };
}

// -------------------------------------------------------------------------
// POST /api/calculate-fare
// Body: { pickup, destination, voertuig, datumIso, retour, wachttijdMinuten }
// -------------------------------------------------------------------------
app.post('/api/calculate-fare', calculateLimiter, async (req, res) => {
  try {
    const { pickup, destination, voertuig, datumIso, retour, wachttijdMinuten } = req.body;


    if (typeof pickup !== 'string' || typeof destination !== 'string' || !pickup.trim() || !destination.trim() || pickup.length > 500 || destination.length > 500 || !['comfort','luxe'].includes(voertuig) || (datumIso && !Number.isFinite(Date.parse(datumIso))) || (retour !== undefined && typeof retour !== 'boolean') || (wachttijdMinuten !== undefined && (typeof wachttijdMinuten !== 'number' || !Number.isFinite(wachttijdMinuten) || wachttijdMinuten < 0))) {
      return res.status(400).json({ error: 'Controleer adressen, voertuig, datum en wachttijd.' });
    }
    if (!pickup || !destination || !voertuig) {
      return res.status(400).json({ error: 'pickup, destination en voertuig zijn verplicht.' });
    }
    if (!['comfort', 'luxe'].includes(voertuig)) {
      return res.status(400).json({ error: 'Ongeldige voertuigklasse.' });
    }

    const { afstandKm, duurMinuten, pickupAdresFormatted, bestemmingAdresFormatted } =
      await haalAfstandOp(pickup, destination);

    const ritprijs = berekenRitprijs({
      pickupAdres: pickupAdresFormatted,
      bestemmingAdres: bestemmingAdresFormatted,
      voertuig,
      afstandKm,
      datumIso,
      retour: !!retour,
      wachttijdMinuten: Number(wachttijdMinuten) || 0,
    });

    res.json({
      ...ritprijs,
      duurMinuten,
      pickupAdresFormatted,
      bestemmingAdresFormatted,
    });
  } catch (err) {
    console.error('[calculate-fare]', err.message);
    res.status(500).json({ error: err.message || 'Er ging iets mis bij het berekenen van de rit.' });
  }
});

// -------------------------------------------------------------------------
// POST /api/bookings
// Maakt een boeking aan. Herberekent de prijs server-side (bron van waarheid)
// en slaat de boeking op. Bij "cash" is de boeking direct bevestigd; bij
// "online" wordt een Mollie-betaling gestart en de boeking blijft "pending"
// tot de webhook een geslaagde betaling meldt.
// -------------------------------------------------------------------------
app.post('/api/bookings', calculateLimiter, async (req, res) => {
  try {
    const {
      klantNaam,
      klantTelefoon,
      pickup,
      destination,
      voertuig,
      datumIso,
      retour,
      wachttijdMinuten,
      betaalmethode, // 'online' | 'cash'
    } = req.body;


    if (typeof pickup !== 'string' || typeof destination !== 'string' || !pickup.trim() || !destination.trim() || pickup.length > 500 || destination.length > 500 || !['comfort','luxe'].includes(voertuig) || (datumIso && !Number.isFinite(Date.parse(datumIso))) || (retour !== undefined && typeof retour !== 'boolean') || (wachttijdMinuten !== undefined && (typeof wachttijdMinuten !== 'number' || !Number.isFinite(wachttijdMinuten) || wachttijdMinuten < 0))) {
      return res.status(400).json({ error: 'Controleer adressen, voertuig, datum en wachttijd.' });
    }
    if (!klantNaam || !klantTelefoon || !pickup || !destination || !voertuig || !betaalmethode) {
      return res.status(400).json({ error: 'Niet alle verplichte velden zijn ingevuld.' });
    }
    if (!['online', 'cash'].includes(betaalmethode)) {
      return res.status(400).json({ error: 'Ongeldige betaalmethode.' });
    }

    const { afstandKm, duurMinuten, pickupAdresFormatted, bestemmingAdresFormatted } =
      await haalAfstandOp(pickup, destination);

    const ritprijs = berekenRitprijs({
      pickupAdres: pickupAdresFormatted,
      bestemmingAdres: bestemmingAdresFormatted,
      voertuig,
      afstandKm,
      datumIso,
      retour: !!retour,
      wachttijdMinuten: Number(wachttijdMinuten) || 0,
    });

    const boekingId = randomUUID();
    const boeking = {
      id: boekingId,
      klantNaam,
      klantTelefoon,
      pickupAdresFormatted,
      bestemmingAdresFormatted,
      duurMinuten,
      datumIso: datumIso || new Date().toISOString(),
      betaalmethode,
      status: betaalmethode === 'cash' ? 'bevestigd' : 'wacht_op_betaling',
      ritprijs,
      aangemaaktOp: new Date().toISOString(),
    };

    bookingsStore.save(boeking);

    if (betaalmethode === 'cash') {
      return res.status(201).json({ boeking });
    }

    // Online betalen -> Mollie-betaling starten
    if (!MOLLIE_API_KEY) {
      return res.status(500).json({
        error: 'Online betalen is momenteel niet beschikbaar (MOLLIE_API_KEY ontbreekt op de server).',
        boeking,
      });
    }

    const molliePayment = await maakMolliebetaling(boeking);
    boeking.mollieId = molliePayment.id;
    bookingsStore.save(boeking);

    res.status(201).json({
      boeking,
      betaalUrl: molliePayment._links.checkout.href,
    });
  } catch (err) {
    console.error('[bookings]', err.message);
    res.status(500).json({ error: err.message || 'Er ging iets mis bij het aanmaken van de boeking.' });
  }
});

// -------------------------------------------------------------------------
// Mollie: betaling aanmaken
// Ondersteunt Bancontact, creditcards, Apple Pay en (waar door Mollie
// aangeboden) Wero rechtstreeks via de gehost checkout-pagina — de klant
// kiest de exacte betaalmethode op die pagina.
// -------------------------------------------------------------------------
async function maakMolliebetaling(boeking) {
  const res = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MOLLIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: {
        currency: 'EUR',
        value: boeking.ritprijs.totaal.toFixed(2),
      },
      description: `Taxirit ${boeking.pickupAdresFormatted} → ${boeking.bestemmingAdresFormatted}`,
      redirectUrl: `${PUBLIC_BASE_URL}/bevestiging.html?boeking=${boeking.id}`,
      webhookUrl: `${PUBLIC_BASE_URL}/api/payments/mollie/webhook`,
      metadata: { boekingId: boeking.id },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Mollie-betaling kon niet aangemaakt worden.');
  }
  return data;
}

// -------------------------------------------------------------------------
// POST /api/payments/mollie/webhook
// Mollie roept deze URL aan telkens de status van een betaling verandert.
// -------------------------------------------------------------------------
app.post('/api/payments/mollie/webhook', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const paymentId = req.body.id;
    if (!paymentId) return res.status(400).end();

    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MOLLIE_API_KEY}` },
    });
    const payment = await mollieRes.json();
    const boekingId = payment.metadata?.boekingId;
    if (!boekingId) return res.status(200).end();

    const boeking = bookingsStore.get(boekingId);
    if (!boeking) return res.status(200).end();

    if (payment.status === 'paid') {
      boeking.status = 'bevestigd';
      boeking.betaaldOp = new Date().toISOString();
    } else if (['failed', 'canceled', 'expired'].includes(payment.status)) {
      boeking.status = 'betaling_mislukt';
    }
    bookingsStore.save(boeking);

    res.status(200).end();
  } catch (err) {
    console.error('[mollie webhook]', err.message);
    res.status(200).end(); // Mollie verwacht altijd 200, anders blijft het herhaaldelijk retryen
  }
});

// -------------------------------------------------------------------------
// GET /api/bookings/:id — status opvragen (bv. voor de bevestigingspagina)
// -------------------------------------------------------------------------
app.get('/api/bookings/:id', (req, res) => {
  const boeking = bookingsStore.get(req.params.id);
  if (!boeking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  res.json({ boeking });
});

app.listen(PORT, () => {
  console.log(`Taxi Boeken Antwerpen backend draait op poort ${PORT}`);
  if (!GOOGLE_MAPS_API_KEY) console.warn('⚠️  GOOGLE_MAPS_API_KEY ontbreekt — ritberekening zal falen.');
  if (!MOLLIE_API_KEY) console.warn('⚠️  MOLLIE_API_KEY ontbreekt — online betalen zal falen.');
});
