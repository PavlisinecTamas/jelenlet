// Telefonos oldal – ide visz a kivetített QR-kód
// (#c=<csatorna>&w=<ablak>&s=<aláírás>&p=<ablakméret mp-ben>).
//
// Két út:
//  - gyors: ha a telefon már ismeri a nevet, egy gombnyomás = egy üzenet (kód + név);
//  - névválasztós: a kódot azonnal beküldi (ezzel indul az 5 perces határidő),
//    letölti a névsort, és a választott nevet külön üzenetben küldi utána.
// A kód érvényességét a kivetítő dönti el; a telefon csak előre jelzi, ha lejárt.

const LAST_NAME_KEY = 'jelenlet.nev';

const statusEl = document.getElementById('status');
const quick = document.getElementById('quick');
const quickSend = document.getElementById('quick-send');
const form = document.getElementById('pick');
const select = document.getElementById('name');
const submitButton = form.querySelector('button');

const params = new URLSearchParams(location.hash.slice(1));
const topic = params.get('c');
const w = Number(params.get('w'));
const s = params.get('s');
// A kivetítő ablakmérete; a régi, p nélküli QR-oknál a sajátunk.
const windowMs = Number(params.get('p')) * 1000 || WINDOW_MS;
const id = randomHex(8);
const lastName = storageGet(LAST_NAME_KEY);
let scannedAt = null; // ntfy.sh idő (mp), amikor a kód beérkezett

// Cache: no – az ntfy.sh csak élőben továbbítja a kivetítőnek, nem tárolja, így
// utólag senki nem kérheti le, ki jelentkezett.
async function send(payload) {
  try {
    return await publish(topic, { id, ...payload }, { Cache: 'no' });
  } catch (err) {
    setStatus(
      statusEl,
      err.message === 'rate_limit'
        ? 'Túl sok jelentkezés érkezett erről a hálózatról. Kapcsold ki a Wi-Fit, és olvasd be újra a kódot mobilnetről.'
        : 'Nem sikerült elküldeni. Ellenőrizd a netet, és próbáld újra.',
      'error',
    );
    return null;
  }
}

// A kivetítő által közzétett névsor (és gyűlésnév). Mindig az ELSŐ "roster" üzenet
// számít: azzal hozza létre a kivetítő a csatornát, így amit utólag bárki más
// küld (hamis vagy hibás névsor), az nem írhatja felül.
async function fetchRoster() {
  const res = await fetch(`${NTFY}/${topic}/json?poll=1&since=all&tags=roster`);
  const first = (await res.text()).split('\n')[0];
  const roster = first ? JSON.parse(JSON.parse(first).message) : null;
  return roster && roster.t === 'roster' && Array.isArray(roster.names) ? roster : null;
}

function expired() {
  quick.hidden = true;
  form.hidden = true;
  setStatus(statusEl, 'Ez a QR-kód már lejárt. Olvasd be újra a kivetítőn látható kódot.', 'error');
}

function done(name) {
  storageSet(LAST_NAME_KEY, name);
  quick.hidden = true;
  form.hidden = true;
  setStatus(statusEl, `Köszönjük, ${name}! A neved pár másodpercen belül megjelenik a kivetítőn.`, 'ok');
}

quickSend.addEventListener('click', async () => {
  quickSend.disabled = true;
  const res = await send({ w, s, name: lastName });
  quickSend.disabled = false;
  if (!res) return;
  if (isFresh(w, res.time, windowMs)) done(lastName);
  else expired();
});

document.getElementById('quick-other').addEventListener('click', startPick);

async function startPick() {
  quick.hidden = true;
  setStatus(statusEl, 'Kód ellenőrzése…');
  const [res, roster] = await Promise.all([send({ w, s }), fetchRoster().catch(() => null)]);
  if (!res) return;
  if (!isFresh(w, res.time, windowMs)) return expired();
  if (!roster) {
    setStatus(statusEl, 'Nem sikerült betölteni a névsort. Olvasd be újra a kódot.', 'error');
    return;
  }

  scannedAt = res.time;
  select.replaceChildren(new Option('Válaszd ki a neved…', ''));
  for (const name of roster.names) select.append(new Option(name, name, false, name === lastName));
  setStatus(statusEl, roster.meeting);
  form.hidden = false;
  select.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = select.value;
  submitButton.disabled = true;
  submitButton.textContent = 'Küldés…';
  const res = await send({ name });
  submitButton.disabled = false;
  submitButton.textContent = 'Jelen vagyok';
  if (!res) return;
  if (res.time - scannedAt <= TICKET_S) done(name);
  else expired();
});

// A kód ne maradjon a címsorban, hogy frissítéskor / megosztáskor ne küldődjön újra.
history.replaceState(null, '', location.pathname + location.search);

if (!topic || !s) {
  setStatus(statusEl, 'Olvasd be a kivetített QR-kódot a telefonod kamerájával.');
} else if (lastName) {
  setStatus(statusEl, '');
  document.getElementById('quick-name').textContent = lastName;
  quick.hidden = false;
  quickSend.focus();
} else {
  startPick();
}
