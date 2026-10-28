// Telefonos oldal – ide visz a kivetített QR-kód (#c=<csatorna>&w=<ablak>&s=<aláírás>).
//
// Betöltéskor a kódot azonnal beküldi: a kód csak pár mp-ig érvényes, a beküldéssel
// viszont indul az 5 perces határidő, ami alatt a nevet ráérősen el lehet küldeni.
// Két út a névhez:
//  - gyors: ha a telefon már ismeri a nevet, egy gombnyomás;
//  - névválasztós: letölti a névsort, és a választott nevet küldi.
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
const id = randomHex(8);
const lastName = storageGet(LAST_NAME_KEY);
let scan = null; // a kód beküldése (Promise) – betöltéskor indul
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

// Megvárja a kód beküldését; true, ha a kód még érvényes volt.
async function scanned() {
  scan ??= send({ w, s });
  const res = await scan;
  if (!res) {
    scan = null; // hálózati hiba után a következő próbálkozás újra küldi
    return false;
  }
  if (!isFresh(w, res.time)) {
    expired();
    return false;
  }
  scannedAt = res.time;
  return true;
}

async function sendName(name) {
  const res = await send({ name });
  if (!res) return;
  if (res.time - scannedAt <= TICKET_S) done(name);
  else expired();
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
  if (await scanned()) await sendName(lastName);
  quickSend.disabled = false;
});

document.getElementById('quick-other').addEventListener('click', startPick);

async function startPick() {
  quick.hidden = true;
  setStatus(statusEl, 'Kód ellenőrzése…');
  const [ok, roster] = await Promise.all([scanned(), fetchRoster().catch(() => null)]);
  if (!ok) return;
  if (!roster) {
    setStatus(statusEl, 'Nem sikerült betölteni a névsort. Olvasd be újra a kódot.', 'error');
    return;
  }

  select.replaceChildren(new Option('Válaszd ki a neved…', ''));
  for (const name of roster.names) select.append(new Option(name, name, false, name === lastName));
  setStatus(statusEl, roster.meeting);
  form.hidden = false;
  select.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = 'Küldés…';
  await sendName(select.value);
  submitButton.disabled = false;
  submitButton.textContent = 'Jelen vagyok';
});

// A kód ne maradjon a címsorban, hogy frissítéskor / megosztáskor ne küldődjön újra.
history.replaceState(null, '', location.pathname + location.search);

if (!topic || !s) {
  setStatus(statusEl, 'Olvasd be a kivetített QR-kódot a telefonod kamerájával.');
} else if (lastName) {
  scanned(); // a kód beküldése nem várhat a gombnyomásra
  setStatus(statusEl, '');
  document.getElementById('quick-name').textContent = lastName;
  quick.hidden = false;
  quickSend.focus();
} else {
  startPick();
}
