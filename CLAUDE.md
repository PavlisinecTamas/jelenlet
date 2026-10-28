# BME SharkTeam – jelenléti eszköz

QR-kódos jelenlétellenőrző csapatgyűlésekre. Működés, korlátok, használat: `README.md`.

## Szabályok

- Sima HTML/CSS/vanilla JS. Nincs build lépés, nincs npm-függőség, nincs framework.
  Külső kód csak bemásolva a `vendor/` mappába, forrás- és licencmegjelöléssel.
- Nincs saját backend és nincs Google-integráció (döntés: 2026-10-28). A kommunikáció
  az ntfy.sh-n megy (`common.js`), az eredmény a kivetítőn letöltött CSV.
- A telefonról küldött üzenetek `Cache: no` fejléccel mennek: a jelentkezők neve
  nem tárolódik az ntfy.sh-n (döntés: 2026-10-28). Csak a névsor van tárolva,
  és a telefon mindig a csatorna első roster-üzenetét fogadja el.
- Content-Security-Policy mindkét HTML-ben: új külső kapcsolat vagy szkript csak
  a CSP bővítésével együtt kerülhet be.
- Az aláírás és az érvényesség szabályai (`WINDOW_MS`, `SIG_LENGTH`, `TICKET_S`,
  `isFresh`) csak a `common.js`-ben élnek; a kivetítő és a telefon is onnan veszi.
- Az ntfy.sh kérésszám-korlátja miatt a telefonos oldal kérésszámát ne növeld
  (jelenleg 2 kérés megjegyzett névvel, 3 kérés névválasztással).
- Felület csak magyarul. Színek, fontok, térközök: a `style.css` elején lévő
  változókból (a SharkTeam honlap tokenjei).
- Hozzáférhetőség: szemantikus HTML, látható fókusz, a sárga csak sötét háttéren
  lehet szöveg.
- Minden változtatás után próbáld ki böngészőben (README: „Kipróbálás helyben”),
  utána commit.
