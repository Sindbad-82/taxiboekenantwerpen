<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Boeking bevestigen — Taxi Boeken Antwerpen</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = { theme: { extend: {
    colors: { navy: { 950: '#050B16', 900: '#0A1830' }, gold: { 400: '#E4C766', 500: '#C9A227' }, silver: { 300: '#D6DCE4', 400: '#AEB8C4' }, ivory: { 50: '#F6F5F1' } },
    fontFamily: { display: ['"Fraunces"', 'serif'], body: ['"Inter"', 'sans-serif'], meter: ['"IBM Plex Mono"', 'monospace'] },
  } } };
</script>
</head>
<body class="bg-navy-950 text-ivory-50 font-body min-h-screen flex items-center justify-center px-5">
  <div id="content" class="max-w-md w-full bg-navy-900 border border-gold-500/20 rounded-2xl p-8 text-center">
    <p class="text-silver-400 text-sm">Boekingsstatus wordt opgehaald…</p>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const boekingId = params.get('boeking');
    const content = document.getElementById('content');

    async function toonStatus() {
      if (!boekingId) {
        content.innerHTML = '<p class="text-silver-300">Geen boeking gevonden.</p>';
        return;
      }
      try {
        const res = await fetch(`/api/bookings/${boekingId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const b = data.boeking;
        const statusLabel = {
          bevestigd: 'Bevestigd ✓',
          wacht_op_betaling: 'Betaling wordt verwerkt…',
          betaling_mislukt: 'Betaling mislukt',
        }[b.status] || b.status;

        content.innerHTML = `
          <h1 class="font-display text-2xl mb-2">${statusLabel}</h1>
          <p class="text-silver-300 text-sm mb-6">${b.pickupAdresFormatted} → ${b.bestemmingAdresFormatted}</p>
          <p class="font-meter text-3xl text-gold-400 mb-6">€ ${b.ritprijs.totaal.toFixed(2)}</p>
          <a href="/" class="inline-block rounded-full bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold px-6 py-2.5 text-sm">Terug naar de website</a>
        `;

        // Als de betaling nog verwerkt wordt, opnieuw controleren na 3 seconden
        if (b.status === 'wacht_op_betaling') setTimeout(toonStatus, 3000);
      } catch (err) {
        content.innerHTML = `<p class="text-red-400 text-sm">${err.message || 'Kon boekingsstatus niet ophalen.'}</p>`;
      }
    }

    toonStatus();
  </script>
</body>
</html>
