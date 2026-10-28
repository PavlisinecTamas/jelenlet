// Kivetítő oldal. Gyűlésenként:
//  - véletlen ntfy.sh csatornát és véletlen aláíró kulcsot generál (csak ezen a gépen él),
//  - közzéteszi a csatornán a névsort, hogy a telefonok választhassanak belőle,
//  - 15 mp-enként új, aláírt QR-kódot mutat,
//  - hallgatja a csatornát, ellenőrzi a beérkező kódokat, és vezeti a jelenlétet,
//  - a végén CSV-be menti, ki volt jelen és ki nem.
// Az állapot localStorage-ben is megmarad, így egy véletlen újratöltés nem veszít adatot.

const SESSION_KEY = 'jelenlet.ules';
const ROSTER_KEY = 'jelenlet.nevsor';
const RECENT_COUNT = 5;
const MAX_ROSTER_BYTES = 4000; // az ntfy.sh 4096 bájt felett már csatolmányként kezeli az üzenetet

const $ = (id) => document.getElementById(id);
const views = { setup: $('setup'), live: $('live'), summary: $('summary') };

// Mentett állapot: { meeting, names, topic, key, offset, lastId,
//   scans: {id: mp}, claimed: {id: név}, present: {név: {time, manual?}} }
let state = null;
try {
  state = JSON.parse(storageGet(SESSION_KEY));
} catch {
  /* sérült mentés – új gyűlést kell indítani */
}
let key = null;
let source = null;
let queue = Promise.resolve();
let shownWindow = null;
let timers = [];

function save() {
  storageSet(SESSION_KEY, JSON.stringify(state));
}

function show(view) {
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
}

const serverNow = () => Date.now() + state.offset;
const formatTime = (sec) => new Date(sec * 1000).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });

async function importKey() {
  const bytes = new Uint8Array(state.key.match(/../g).map((h) => parseInt(h, 16)));
  key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(w) {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${state.topic}|${w}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, SIG_LENGTH);
}

// --- beérkező üzenetek --------------------------------------------------------

// Egy üzenet: { id } + kód ({ w, s }) és/vagy név ({ name }). A kód regisztrálja
// a telefont (id), a név akkor számít, ha a telefon kódja TICKET_S-en belül érkezett.
// Egy beolvasás egyetlen nevet vehet fel (ugyanaz a név újraküldve nem hiba).
// A törlési (message_delete) és egyéb ntfy események nem számítanak.
async function handle(msg) {
  if (msg.event !== 'message') return;
  state.lastId = msg.id;
  let body;
  try {
    body = JSON.parse(msg.message);
  } catch {
    body = {};
  }

  const id = body.id;
  if (typeof id === 'string' && /^[0-9a-f]{16}$/.test(id)) {
    if (body.s !== undefined && !Object.hasOwn(state.scans, id)) {
      const w = Number(body.w);
      if (isFresh(w, msg.time) && body.s === (await sign(w))) state.scans[id] = msg.time;
    }
    const scannedAt = state.scans[id];
    const name = body.name;
    if (
      typeof name === 'string' &&
      scannedAt !== undefined &&
      msg.time - scannedAt <= TICKET_S &&
      state.names.includes(name) &&
      (state.claimed[id] ?? name) === name
    ) {
      state.claimed[id] = name;
      state.present[name] ??= { time: msg.time };
    }
  }
  save();
  renderCount();
}

function listen() {
  source = new EventSource(`${NTFY}/${state.topic}/sse?since=${state.lastId}`);
  source.onopen = () => setStatus($('connection'), '');
  source.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    queue = queue.then(() => handle(msg));
  };
  // Saját újracsatlakozás. A jelentkezéseket az ntfy.sh nem tárolja (Cache: no),
  // így a kiesés alatt érkezők elvesznek – nekik nem jelenik meg a nevük, újra beolvassák.
  source.onerror = () => {
    source.close();
    setStatus($('connection'), 'Megszakadt a kapcsolat, újracsatlakozás…', 'error');
    timers.push(setTimeout(listen, 3000));
  };
}

// --- nézetek ------------------------------------------------------------------

function renderQr(text) {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) d += `M${x + border},${y + border}h1v1h-1z`;
    }
  }
  const size = qr.size + border * 2;
  $('qr').setAttribute('viewBox', `0 0 ${size} ${size}`);
  $('qr').querySelector('path').setAttribute('d', d);
}

async function tick() {
  const remaining = WINDOW_MS - (serverNow() % WINDOW_MS);
  $('timer-bar').style.setProperty('--remaining', remaining / WINDOW_MS);

  const w = Math.floor(serverNow() / WINDOW_MS);
  if (w === shownWindow) return;
  shownWindow = w;
  const url = new URL('./', location.href);
  url.hash = new URLSearchParams({ c: state.topic, w, s: await sign(w) }).toString();
  if (shownWindow === w) renderQr(url.href);
}

function presentNames() {
  return Object.keys(state.present).sort((a, b) => state.present[b].time - state.present[a].time);
}

function renderCount() {
  const present = presentNames();
  $('count').textContent = `${present.length} / ${state.names.length}`;
  $('recent').textContent = present.length ? `Legutóbb: ${present.slice(0, RECENT_COUNT).join(', ')}` : '';
}

function startLive() {
  stopLive();
  show('live');
  $('live-meeting').textContent = state.meeting;
  shownWindow = null;
  renderCount();
  tick();
  timers.push(setInterval(tick, 200));
  listen();
}

function stopLive() {
  timers.forEach(clearTimeout);
  timers = [];
  if (source) source.close();
  source = null;
}

function renderSummary() {
  const count = Object.keys(state.present).length;
  $('summary-meeting').textContent = state.meeting;
  $('summary-count').textContent = `Jelen: ${count} fő · Hiányzott: ${state.names.length - count} fő`;
  $('summary-rows').replaceChildren(
    ...state.names.map((name) => {
      const entry = state.present[name];
      const row = document.createElement('tr');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = Boolean(entry);
      check.setAttribute('aria-label', `${name} jelen`);
      check.addEventListener('change', () => {
        if (check.checked) state.present[name] = { time: Math.floor(serverNow() / 1000), manual: true };
        else delete state.present[name];
        save();
        renderSummary();
      });
      const cells = [name, check, entry ? formatTime(entry.time) + (entry.manual ? ' (kézzel)' : '') : '–'];
      for (const content of cells) row.insertCell().append(content);
      row.dataset.present = Boolean(entry);
      return row;
    }),
  );
}

function downloadCsv() {
  // Az = + - @ kezdetű cellát az Excel képletként futtatná – egy aposztróf ezt megakadályozza.
  const cell = (value) => {
    const text = String(value);
    return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const count = Object.keys(state.present).length;
  const rows = [
    ['Gyűlés', state.meeting],
    ['Jelen', count],
    ['Hiányzott', state.names.length - count],
    [],
    ['Név', 'Jelen', 'Időpont', 'Megjegyzés'],
    ...state.names.map((name) => {
      const entry = state.present[name];
      return entry
        ? [name, 'igen', formatTime(entry.time), entry.manual ? 'kézzel jelölve' : '']
        : [name, 'nem', '', ''];
    }),
  ];
  // BOM + pontosvessző: így a magyar Excel is helyesen nyitja meg.
  const csv = '﻿' + rows.map((row) => row.map(cell).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `jelenlet-${state.meeting.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function showSetup() {
  show('setup');
  $('resume').hidden = !state;
  if (state) $('resume-meeting').textContent = state.meeting;
}

// --- események ----------------------------------------------------------------

$('setup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const names = [...new Set($('roster').value.split('\n').map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'hu'),
  );
  const meeting = $('meeting').value.trim();
  if (new TextEncoder().encode(JSON.stringify({ t: 'roster', meeting, names })).length > MAX_ROSTER_BYTES) {
    setStatus($('setup-status'), 'Túl hosszú a névsor (kb. 150 név fér bele).', 'error');
    return;
  }
  if (state && !confirm(`A(z) „${state.meeting}” gyűlés adatai törlődnek. Letöltötted a jelenléti ívet?`)) return;

  const button = event.submitter;
  button.disabled = true;
  setStatus($('setup-status'), 'Kapcsolódás…');
  const topic = `sharkteam-${randomHex(12)}`;
  try {
    const t0 = Date.now();
    const res = await publish(topic, { t: 'roster', meeting, names }, { 'X-Tags': 'roster' });
    // Óra igazítása az ntfy.sh-hoz (a time egész mp, ezért +500 ms a kerekítés közepe).
    const offset = res.time * 1000 + 500 - (t0 + Date.now()) / 2;
    state = { meeting, names, topic, key: randomHex(32), offset, lastId: res.id, scans: {}, claimed: {}, present: {} };
  } catch {
    setStatus($('setup-status'), 'Nem sikerült elérni az ntfy.sh-t. Van internet?', 'error');
    return;
  } finally {
    button.disabled = false;
  }
  storageSet(ROSTER_KEY, $('roster').value);
  save();
  setStatus($('setup-status'), '');
  await importKey();
  startLive();
});

$('resume-button').addEventListener('click', async () => {
  await importKey();
  startLive();
});

$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});

$('close').addEventListener('click', () => {
  stopLive();
  if (document.fullscreenElement) document.exitFullscreen();
  renderSummary();
  show('summary');
});

$('reopen').addEventListener('click', startLive);
$('download').addEventListener('click', downloadCsv);
$('new').addEventListener('click', showSetup);

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
$('meeting').value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())} csapatgyűlés`;
$('roster').value = storageGet(ROSTER_KEY) || '';
showSetup();
