import * as store from './store.js';
import { HIS_NAME, REPLY_MINUTES } from './store.js';
import { getCtx } from './audio.js';
import { music } from './music.js';

const app = document.getElementById('app');
const MOODS = [
  ['Calm', '😌'], ['Heavy', '🌧️'], ['Grateful', '🙏'], ['Tired', '😴'],
  ['Anxious', '😟'], ['Hopeful', '🌅'], ['Angry', '😠'], ['Lonely', '🥺'],
];
const moodLabel = (name) => { const hit = MOODS.find(([m]) => m === name); return hit ? `${hit[1]} ${name}` : name; };
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const pref = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// Tiny element helper. Text always goes through textContent, never innerHTML.
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((x) => x != null));
  return el;
}

const svg = (inner) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'icon');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = inner; // static strings only
  return s;
};
const icons = {
  soundOn: () => svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  soundOff: () => svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>'),
  star: (on) => svg(`<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z" ${on ? 'fill="currentColor"' : ''}/>`),
  menu: () => svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
};

function render(...nodes) {
  app.replaceChildren(...nodes);
}

// ---------- Sound: one soft tone, no asset ----------

const isHimRoute = () => location.hash.startsWith('#/him') || new URLSearchParams(location.search).has('him');
const soundEnabled = () => pref.get('bl.sound') !== '0'; // on unless she turned it off
let audioUnlocked = false;

function syncAmbient() {
  if (audioUnlocked && soundEnabled() && !isHimRoute()) music.start(); else music.stop();
}
function setSound(on) {
  pref.set('bl.sound', on ? '1' : '0');
  syncAmbient();
}
// Browsers only allow audio after a tap, so the music begins on her first touch.
const unlockAudio = () => { audioUnlocked = true; getCtx(); syncAmbient(); };
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });

function chime() {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 523;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.3);
  } catch { /* audio unavailable */ }
}

// Three.js loads lazily so the first paint is not blocked; null means fall back to the flat animation.
let scenePromise;
const getScene = () => (scenePromise ||= import('./scene.js').then((m) => m.initScene()).catch(() => null));

function splashSound() {
  try {
    const ctx = getCtx();
    const len = ctx.sampleRate * 0.9;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.8);
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  } catch { /* audio unavailable */ }
}

// ---------- Her screens ----------

function passcodeScreen() {
  const input = h('input', { class: 'field', type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Number', placeholder: 'Your number' });
  const msg = h('p', { class: 'small error', role: 'status' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    msg.textContent = '';
    try {
      if (await store.tryKey(input.value)) return route();
      msg.textContent = 'Not quite.';
    } catch {
      msg.textContent = "Couldn't reach it. Try again.";
    }
  } }, input, h('button', { class: 'btn' }, 'Enter'), msg);
  render(h('main', { class: 'center' }, h('p', { class: 'serif' }, 'Type your number.'), form));
  input.focus();
  getScene().then((sc) => sc?.setVisible(true));
}

const INTRO = [
  { title: 'This is for you.', sub: 'A quiet place by the sea, so you always remember me.' },
  { title: 'Whenever you miss me,', sub: 'write it here and throw it into the sea.' },
  { title: 'Or when you need to vent.', sub: 'Whatever you want to share, let it out. Just write. It does not have to be perfect.' },
  { title: 'If you see a bottle floating on the water,', sub: "it's from me. Tap it to read what I left for you.", bottle: true },
  { title: 'Mine do not last forever.', sub: `Once you open one, it stays for ${REPLY_MINUTES} minutes. The timer counts down, with the time it will be gone beside it. Then it is gone for good.`, timer: true },
  { title: 'Listen.', sub: 'Soft music will play in the background, always. You can turn it off, top right.' },
];

function firstLaunch() {
  let i = 0;
  const dummy = h('div', { class: 'reply-bottle', 'aria-hidden': 'true', style: 'pointer-events:none' });

  const leaveBottle = async () => {
    dummy.remove();
    (await getScene())?.setReplyBottle(null);
  };
  const finish = async () => {
    await leaveBottle();
    pref.set('bl.seen', '1');
    writeScreen();
  };

  async function show() {
    const page = INTRO[i];
    const last = i === INTRO.length - 1;
    const sc = await getScene();
    sc?.setVisible(true);
    if (page.bottle && sc) { document.body.append(dummy); sc.setReplyBottle(dummy); } else await leaveBottle();

    const now = new Date();
    const gone = new Date(now.getTime() + REPLY_MINUTES * 60_000);
    render(h('main', { class: 'center intro' },
      h('div', { class: 'intro-page' },
        h('h1', { class: 'serif intro-title' }, page.title),
        h('p', { class: 'serif intro-sub' }, page.sub),
        page.timer ? h('div', { class: 'timer-row demo' },
          h('span', { class: 'timer' }, `${REPLY_MINUTES}:00`),
          h('span', { class: 'timer-times' }, `Opened ${clock(now)}`, h('br'), `Gone ${clock(gone)}`)) : null),
      h('div', { class: 'intro-nav' },
        h('div', { class: 'dots', 'aria-hidden': 'true' }, ...INTRO.map((_, n) => h('span', { class: n === i ? 'on' : '' }))),
        h('button', { class: 'btn', onclick: () => { if (last) finish(); else { i += 1; show(); } } }, last ? 'Begin' : 'Next'),
        last ? null : h('button', { class: 'link small', onclick: finish }, 'Skip'))));
  }
  show();
}

function writeScreen() {
  let mood = null;
  let soundOn = soundEnabled();

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const sound = h('button', { class: 'icon-btn', 'aria-label': 'Sound', 'aria-pressed': String(soundOn),
    onclick: () => {
      soundOn = !soundOn;
      setSound(soundOn);
      sound.setAttribute('aria-pressed', String(soundOn));
      sound.replaceChildren(soundOn ? icons.soundOn() : icons.soundOff());
    } }, soundOn ? icons.soundOn() : icons.soundOff());

  const box = h('textarea', { placeholder: 'Write whatever you need to.', 'aria-label': 'Your message', autofocus: true,
    oninput: () => { sendBtn.disabled = !box.value.trim(); getScene().then((sc) => sc?.typing()); } });

  const moodRow = h('div', { class: 'moods' });
  const showMoodLink = () => moodRow.replaceChildren(h('button', { class: 'chip small', onclick: showChips }, 'How are you feeling?'));
  const showChips = () => moodRow.replaceChildren(...MOODS.map(([m, emoji]) =>
    h('button', { class: 'chip', 'aria-pressed': 'false', 'data-mood': m, onclick: () => {
      mood = mood === m ? null : m;
      getScene().then((sc) => sc?.setMood(mood));
      moodRow.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.mood === mood)));
    } }, `${emoji} ${m}`)));
  showMoodLink();

  const sendBtn = h('button', { class: 'btn', disabled: true, onclick: () => {
    store.send(box.value, mood);
    sentState(soundOn);
  } }, 'Send');

  const page = h('main', { class: 'write' },
    h('div', { class: 'bar' }, h('span', { class: 'muted small' }, date), sound),
    box,
    moodRow,
    h('div', { class: 'send' }, sendBtn),
  );
  render(page);
  box.focus();
  getScene().then((sc) => { sc?.setVisible(true); sc?.setMood(null); });
  watchReplies();
}

async function sentState(soundOn) {
  const write = app.querySelector('.write');
  write?.classList.add('sending');

  const sc = reduceMotion() ? null : await getScene();
  if (sc) {
    const text = h('p', { class: 'sent-text serif', role: 'status' }, 'Carried by the tide.');
    setTimeout(() => document.body.append(text), 2200);
    await sc.playSend({ onImpact: () => { if (soundOn) splashSound(); } });
    text.remove();
    return writeScreen();
  }

  // Flat fallback: reduced motion or no WebGL.
  if (soundOn) chime();
  const bottle = '<g class="bottle" fill="none" stroke="#3F7A80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(120 30)"><path d="M-4 -18h8v6c0 3 7 5 7 12v8c0 3-2 5-5 5h-12c-3 0-5-2-5-5v-8c0-7 7-9 7-12z"/></g>';
  const wave = '<path d="M0 62c15-8 30 8 45 0s30 8 45 0 30 8 45 0 30 8 45 0 30 8 45 0" fill="none" stroke="#E6E1D8" stroke-width="1.5"/>';
  const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  art.setAttribute('viewBox', '0 0 240 80');
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML = wave + bottle;

  const overlay = h('div', { class: 'sent', role: 'status' }, art, h('p', { class: 'serif' }, 'Carried by the tide.'));
  setTimeout(() => document.body.append(overlay), reduceMotion() ? 0 : 400);
  setTimeout(() => { overlay.remove(); writeScreen(); }, reduceMotion() ? 1400 : 2300);
}

// ---------- Her: bottles from him ----------

let replyTimer;
const replyBtn = h('button', { class: 'reply-bottle', 'aria-label': 'A bottle has drifted in', onclick: () => openLetters() });
const clock = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

async function checkReplies() {
  const rows = await store.pendingReplies();
  const sc = await getScene();
  if (!rows.length) { replyBtn.remove(); sc?.setReplyBottle(null); return; }
  if (!replyBtn.isConnected) document.body.append(replyBtn);
  if (sc) {
    replyBtn.className = 'reply-bottle';
    replyBtn.replaceChildren();
    sc.setReplyBottle(replyBtn);
  } else {
    replyBtn.className = 'reply-flat';
    replyBtn.textContent = 'A bottle has arrived';
  }
}

function watchReplies() {
  clearInterval(replyTimer);
  checkReplies();
  replyTimer = setInterval(checkReplies, 60_000);
}

function stopWatchingReplies() {
  clearInterval(replyTimer);
  replyBtn.remove();
  scenePromise?.then((sc) => sc?.setReplyBottle(null));
}

async function openLetters() {
  const rows = await store.pendingReplies();
  let letters;
  try { letters = await store.openReplies(rows.map((r) => r.id)); } catch { return; }
  if (!letters.length) return checkReplies();

  let tick;
  const close = () => { clearInterval(tick); overlay.remove(); checkReplies(); }; // text leaves the DOM here
  const clocks = letters.map(() => h('span', { class: 'timer' }));
  const overlay = h('div', { class: 'letter-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `A message from ${HIS_NAME}` },
    h('div', { class: 'letter' },
      ...letters.map((r, n) => h('section', {},
        h('div', { class: 'timer-row' }, clocks[n],
          h('span', { class: 'timer-times' }, `Opened ${clock(new Date(r.opened_at))}`, h('br'), `Gone ${clock(r.goneAt)}`)),
        h('p', { class: 'serif letter-body' }, r.body))),
      h('button', { class: 'btn', onclick: close }, 'Close')));
  const update = () => {
    const left = letters.map((r) => r.goneAt.getTime() - Date.now());
    if (Math.max(...left) <= 0) return close();
    left.forEach((ms, n) => {
      const sec = Math.max(0, Math.ceil(ms / 1000));
      clocks[n].textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    });
  };
  update();
  tick = setInterval(update, 1000);
  document.body.append(overlay);
}

// ---------- His screens ----------

function loginScreen() {
  const pin = h('input', { class: 'field', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', 'aria-label': 'Password', placeholder: 'Password' });
  const msg = h('p', { class: 'small error', role: 'status' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    msg.textContent = '';
    try {
      if (await store.signInWithPin(pin.value)) return route();
      msg.textContent = 'Not quite.';
    } catch {
      msg.textContent = "Couldn't reach it. Try again.";
    }
  } }, pin, h('button', { class: 'btn' }, 'Enter'), msg);
  render(h('main', { class: 'center' }, form));
  pin.focus();
}

const dayLabel = (iso) => {
  const d = new Date(iso);
  const key = (x) => x.toDateString();
  const now = new Date();
  const yest = new Date(now.getTime() - 864e5);
  if (key(d) === key(now)) return 'Today';
  if (key(d) === key(yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};

async function feedScreen() {
  let all = [];
  let query = '';
  let starredOnly = false;
  let menuOpen = false;

  const listEl = h('div');
  const search = h('input', { class: 'field', type: 'search', placeholder: 'Search', 'aria-label': 'Search',
    oninput: () => { query = search.value.toLowerCase(); draw(); } });
  const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu', onclick: () => { menuOpen = !menuOpen; drawMenu(); } }, icons.menu());
  const top = h('div', { class: 'top' }, search, menuBtn);

  const drawMenu = () => {
    top.querySelector('.menu')?.remove();
    if (!menuOpen) return;
    top.append(h('div', { class: 'menu' },
      h('button', { onclick: () => { store.exportBackup(all); menuOpen = false; drawMenu(); } }, 'Export backup'),
      h('button', { onclick: async () => { await store.signOut(); loginScreen(); } }, 'Sign out'),
    ));
  };

  const mkFilter = (label, val) => h('button', { class: 'chip small', 'aria-pressed': String(starredOnly === val),
    onclick: () => { starredOnly = val; filters.replaceChildren(mkFilter('All', false), mkFilter('Starred', true)); draw(); } }, label);
  const filters = h('div', { class: 'filters' }, mkFilter('All', false), mkFilter('Starred', true));

  function card(m) {
    const time = new Date(m.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const body = h('p', { class: 'body clip' }, m.body);
    const more = h('button', { class: 'link small', hidden: true, onclick: () => { body.classList.remove('clip'); more.remove(); } }, 'Read more');
    const starBtn = h('button', { class: 'icon-btn star', 'aria-label': 'Star', 'aria-pressed': String(m.starred),
      onclick: async () => {
        m.starred = !m.starred;
        starBtn.setAttribute('aria-pressed', String(m.starred));
        starBtn.replaceChildren(icons.star(m.starred));
        try { await store.setStar(m.id, m.starred); } catch { m.starred = !m.starred; draw(); }
      } }, icons.star(m.starred));
    queueMicrotask(() => { if (body.scrollHeight > body.clientHeight + 1) more.hidden = false; });
    return h('article', { class: 'card' },
      h('header', {}, h('span', {}, m.mood ? `${time} · ${moodLabel(m.mood)}` : time), starBtn),
      body, more);
  }

  function draw() {
    const rows = all.filter((m) => (!starredOnly || m.starred) && (!query || m.body.toLowerCase().includes(query) || (m.mood || '').toLowerCase().includes(query)));
    if (!rows.length) {
      listEl.replaceChildren(h('p', { class: 'serif muted', style: 'margin-top:20vh;text-align:center;font-size:20px' },
        all.length ? 'Nothing matches.' : 'Nothing yet. When she leaves something, it will show up here.'));
      return;
    }
    const out = [];
    let last = '';
    for (const m of rows) {
      const label = dayLabel(m.created_at);
      if (label !== last) { out.push(h('h2', { class: 'day' }, label)); last = label; }
      out.push(card(m));
    }
    listEl.replaceChildren(...out);
  }

  const reply = h('textarea', { class: 'field reply-box', rows: '3', placeholder: 'Leave her a bottle.', 'aria-label': 'Message to her',
    oninput: () => { sendReply.disabled = !reply.value.trim(); } });
  const sendReply = h('button', { class: 'btn', disabled: true, onclick: async () => {
    sendReply.disabled = true;
    try { await store.sendReply(reply.value); reply.value = ''; } catch { sendReply.disabled = false; }
    drawSent();
  } }, 'Send');
  const sentEl = h('div', { class: 'sent-list' });
  async function drawSent() {
    let rows = [];
    try { rows = await store.listSentReplies(); } catch { return; }
    sentEl.replaceChildren(...rows.map((r) => h('div', { class: 'sent-row small' },
      h('span', { class: 'muted' }, r.opened_at
        ? `Opened. Gone at ${clock(new Date(new Date(r.opened_at).getTime() + REPLY_MINUTES * 60_000))}.`
        : 'Not opened yet.'),
      h('span', { class: 'sent-text-line' }, r.body),
      r.opened_at ? null : h('button', { class: 'link small', onclick: async () => { await store.unsendReply(r.id); drawSent(); } }, 'Unsend'))));
  }
  const composer = h('section', { class: 'composer' }, reply,
    h('div', { class: 'composer-row' }, h('span', { class: 'muted small' }, `Gone ${REPLY_MINUTES} minutes after she opens it.`), sendReply), sentEl);
  drawSent();
  const sentTimer = setInterval(() => (sentEl.isConnected ? drawSent() : clearInterval(sentTimer)), 30_000);

  render(h('main', {}, top, composer, filters, listEl));
  try {
    all = await store.list();
  } catch {
    listEl.replaceChildren(h('p', { class: 'error' }, "Couldn't load the letters. Pull to refresh in a moment."));
    return;
  }
  draw();
}

// ---------- Routing ----------

async function route() {
  const isHim = location.hash.startsWith('#/him') || new URLSearchParams(location.search).has('him');
  if (scenePromise) scenePromise.then((sc) => sc?.setVisible(!isHim));
  if (!isHim) music.preload();
  syncAmbient();
  if (isHim) stopWatchingReplies();
  if (isHim) {
    const session = await store.getSession();
    return session ? feedScreen() : loginScreen();
  }
  stopWatchingReplies();
  if (!store.hasKey()) return passcodeScreen();
  return pref.get('bl.seen') ? writeScreen() : firstLaunch();
}

store.pairFromUrl();
addEventListener('hashchange', route);
route();
store.flush();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
