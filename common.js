// Közös részek a kivetítő és a telefonos oldal között.
//
// Nincs saját szerver: az üzenetek az ntfy.sh nyilvános közvetítőn mennek át,
// gyűlésenként egy véletlen nevű csatornán (topic). Lásd README.

const NTFY = 'https://ntfy.sh';
const WINDOW_MS = 5 * 1000; // ennyi időnként vált a QR-kód (érvényes: 2 ablak = 10 mp)
const SIG_LENGTH = 16; // az aláírás hossza hex karakterben
const TICKET_S = 5 * 60; // beolvasás után ennyi mp van a név kiválasztására

// A beolvasott kód akkor érvényes, ha az ntfy.sh szerint a beküldés pillanatában
// a kód saját ablaka vagy az azt követő volt az aktuális – így egy kód a
// megjelenésétől legfeljebb 10 mp-ig használható. (A következő ablak is elfogadott,
// ha a kivetítő órája egy hajszállal előrébb jár; ez a lejáratot nem tolja ki.)
// A kivetítő ez alapján fogad el jelentkezést, a telefon ez alapján jelez előre lejáratot.
function isFresh(w, timeSec) {
  const current = Math.floor((timeSec * 1000) / WINDOW_MS);
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
