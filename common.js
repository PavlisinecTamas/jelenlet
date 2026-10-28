// Közös részek a kivetítő és a telefonos oldal között.
//
// Nincs saját szerver: az üzenetek az ntfy.sh nyilvános közvetítőn mennek át,
// gyűlésenként egy véletlen nevű csatornán (topic). Lásd README.

const NTFY = 'https://ntfy.sh';
const WINDOW_MS = 15 * 1000; // egy QR-kód élettartama
const SIG_LENGTH = 16; // az aláírás hossza hex karakterben
const TICKET_S = 5 * 60; // beolvasás után ennyi mp van a név kiválasztására

// A beolvasott kód akkor érvényes, ha az ntfy.sh szerint a beküldés pillanatában
// a kód saját ablaka vagy a szomszédos ablak volt az aktuális. A kivetítő ez
// alapján fogad el jelentkezést, a telefon ez alapján jelez előre lejáratot.
// A telefon a kivetítő ablakméretét kapja meg (a QR-ból), hogy egy frissítés után
// a böngészőkben ragadt eltérő verziók se csússzanak szét.
function isFresh(w, timeSec, windowMs = WINDOW_MS) {
  const current = Math.floor((timeSec * 1000) / windowMs);
  return w >= current - 1 && w <= current + 1;
}

// Üzenet küldése a csatornára. A válaszban az ntfy.sh szerveridő (time, mp) is benne van.
async function publish(topic, payload, headers = {}) {
  const res = await fetch(`${NTFY}/${topic}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (res.status === 429) throw new Error('rate_limit');
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function setStatus(el, text, tone) {
  el.textContent = text;
  el.dataset.tone = tone || '';
}

// localStorage privát módban / letiltva dobhat – ilyenkor egyszerűen nem jegyzünk meg semmit.
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* nem baj */
  }
}
