# Kopieer dit bestand naar ".env" en vul je eigen sleutels in.
# Zet .env NOOIT in git / publieke repository.

# Google Maps Platform — nodig voor Places Autocomplete (frontend) en
# Distance Matrix API (backend, voor de ritberekening).
# https://console.cloud.google.com/google/maps-apis
GOOGLE_MAPS_API_KEY=jouw_google_maps_api_key

# Mollie — voor Bancontact, creditcards, Apple Pay en Wero.
# https://my.mollie.com/dashboard/developers/api-keys
MOLLIE_API_KEY=test_jouw_mollie_api_key

# De publieke URL van je site (nodig voor Mollie redirect + webhook).
# Lokaal testen: gebruik ngrok of vergelijkbaar zodat Mollie de webhook kan bereiken.
PUBLIC_BASE_URL=https://taxiboekenantwerpen.be

PORT=3000
