/* Kleine aanvullingen bovenop Tailwind (CDN) */

html { scroll-behavior: smooth; }

/* Gouden rand rond de geselecteerde voertuigklasse (Comfort/Executive, betaalmethode) */
.vehicle-option:has(input:checked),
label:has(input[name="betaalmethode"]:checked) {
  border-color: #C9A227;
  background-color: rgba(201, 162, 39, 0.06);
}

/* Subtiele glow op de taximeter-display, als een échte verlichte meter */
#meter {
  box-shadow: inset 0 0 30px rgba(201, 162, 39, 0.06);
}

/* Reduced motion: geen scroll-animatie voor wie dat liever niet heeft */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}

/* Focus states duidelijk zichtbaar voor toetsenbordgebruikers */
a:focus-visible, button:focus-visible, input:focus-visible {
  outline: 2px solid #C9A227;
  outline-offset: 2px;
}
