# Taxi Boeken Antwerpen — website + backend

Volledige codebase voor **taxiboekenantwerpen.be**: ritcalculator, boekingsflow,
online betalen (Mollie: Bancontact/Wero/kaarten/Apple Pay) of cash, en
"Boek via WhatsApp".

## Projectstructuur

```
taxiboekenantwerpen/
├── server.js                # Express-backend
├── shared/fareRules.js      # Centrale tariefregels (bron van waarheid, server-side)
├── data/bookingsStore.js    # Eenvoudige JSON-opslag voor boekingen (vervang door DB in productie)
├── public/
│   ├── index.html           # Hoofdpagina
│   ├── bevestiging.html     # Redirect-pagina na online betaling
│   ├── css/style.css
│   └── js/
│       ├── app.js           # Frontend-logica (autocomplete, meter, boeking, WhatsApp)
│       └── fareRules.js     # Kopie van de tariefregels, enkel voor de indicatieve meter
├── package.json
└── .env.example
```

## 1. Installatie

```bash
npm install
cp .env.example .env
```

Vul in `.env` in:

- `GOOGLE_MAPS_API_KEY` — met **Places API** en **Distance Matrix API** ingeschakeld
  in de Google Cloud Console. Beperk de sleutel tot je domein (HTTP referrers) en
  voor de server-side calls eventueel een aparte sleutel met IP-restrictie.
- `MOLLIE_API_KEY` — start met een `test_`-sleutel om alles te testen zonder
  echt geld te verwerken.
- `PUBLIC_BASE_URL` — lokaal testen met een online betaling vereist dat Mollie
  je webhook kan bereiken; gebruik hiervoor bijvoorbeeld `ngrok http 3000` en
  zet die ngrok-URL hier tijdelijk in.

## 2. Starten

```bash
npm run dev     # met auto-herladen (nodemon)
# of
npm start
```

Ga naar `http://localhost:3000`.

## 3. Belangrijk om aan te passen vóór livegang

1. **WhatsApp-nummer**: in `public/js/app.js`, constante `WHATSAPP_NUMMER`
   (internationaal formaat zonder `+`, bv. `32470123456`).
2. **Telefoonnummer & e-mail** in de navbar/footer van `public/index.html`.
3. **Boekingsopslag**: `data/bookingsStore.js` schrijft naar een lokaal
   JSON-bestand. Voor productie met meerdere gelijktijdige boekingen: vervang
   dit door een echte database (bv. PostgreSQL). De functies `save/get/all`
   blijven dezelfde interface, dus de rest van `server.js` verandert niet mee.
4. **Mollie-betaalmethodes**: de gehoste Mollie-checkoutpagina toont automatisch
   de betaalmethodes die op je Mollie-account geactiveerd zijn (Bancontact,
   creditcards, Apple Pay, en Wero zodra Mollie dit voor jouw account vrijgeeft).
   Activeer/configureer dit in het Mollie-dashboard.
5. **Beveiliging**: er zit een basis rate limiter op de reken- en boekings-
   routes. Overweeg voor productie ook een captcha op het boekingsformulier
   en een correcte Content-Security-Policy (nu uitgeschakeld in `helmet()`
   omdat Google Maps + Tailwind CDN eigen policies vereisen — verfijn dit).

## 4. Hoe de tarieven werken

Alle bedragen staan centraal in `shared/fareRules.js` (server, bindend) en
`public/js/fareRules.js` (browser, enkel indicatief). Bij een tariefwijziging
altijd **beide bestanden** aanpassen.

- **Kilometertarief**: starttarief + (afstand × prijs/km), gebaseerd op de
  officiële afstand via Google Distance Matrix.
- **Vaste tarieven**: Zaventem, Charleroi, Schiphol, Brussel-Zuid — deze
  overschrijven automatisch de kilometerberekening zodra Antwerpen + die
  bestemming (in eender welke richting) herkend wordt in de adressen.
- **Weekendtarief**: enkel van toepassing op Zaventem (zaterdag/zondag).
- **Retourrit**: verdubbelt het berekende bedrag.
- **Wachttijd**: apart aanrekenbaar per uur, per voertuigklasse.

## 5. Veiligheid van de prijsberekening

De frontend toont een **indicatieve** prijs zodra iemand een rit intikt (leuk
voor UX — de taximeter-animatie). Zodra iemand echt boekt, herberekent de
backend (`POST /api/bookings`) alles opnieuw met de officiële Google-afstand
en de regels uit `shared/fareRules.js`. Enkel dat bedrag wordt ook
daadwerkelijk naar Mollie gestuurd om te innen — een gemanipuleerd bedrag
vanuit de browser heeft dus geen effect.
