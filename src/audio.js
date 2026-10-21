import { currentHour, phaseOf } from './time.js';

// All sound is synthesised, so there is nothing to download. Waves always;
// the rest follows the time of day: birds at dawn and morning, rain in the evening,
// crickets at night, under a very soft chord.

let ctx = null;
export function getCtx() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unavailable */ }
  return ctx;
}

function noise(c, brown) {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

const MIX = {
  dawn:      { waves: 0.30, rain: 0,    birds: 1, crickets: 0, pad: 1 },
  morning:   { waves: 0.30, rain: 0,    birds: 1, crickets: 0, pad: 0.8 },
  afternoon: { waves: 0.35, rain: 0,    birds: 0, crickets: 0, pad: 1 },
  evening:   { waves: 0.22, rain: 0.11, birds: 0, crickets: 0, pad: 1 },
  night:     { waves: 0.18, rain: 0.04, birds: 0, crickets: 1, pad: 1 },
};

let session = null;

function build(phase) {
  const c = getCtx();
  if (!c) return null;
  const mix = MIX[phase];
  const stops = [];
  const timers = [];
  const master = c.createGain();
  master.gain.value = 0.0001;
  master.connect(c.destination);
  master.gain.exponentialRampToValueAtTime(0.7, c.currentTime + 3);

  const lfo = (freq, depth, param) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = freq;
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
    stops.push(o);
  };

  // waves: brown noise swelling slowly
  const waves = noise(c, true);
  const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 520;
  const wg = c.createGain(); wg.gain.value = mix.waves * 0.6;
  waves.connect(wf).connect(wg).connect(master);
  lfo(0.09, mix.waves * 0.45, wg.gain);
  waves.start(); stops.push(waves);

  if (mix.rain) {
    const rain = noise(c, false);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.5;
    const rg = c.createGain(); rg.gain.value = mix.rain;
    rain.connect(bp).connect(rg).connect(master);
    rain.start(); stops.push(rain);
  }

  // pad: a soft major-seventh chord that barely moves
  const padOut = c.createGain(); padOut.gain.value = 0.022 * mix.pad;
  const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 1100;
  padOut.connect(pf).connect(master);
  [130.81, 196.0, 246.94, 329.63].forEach((f, i) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = c.createGain(); g.gain.value = 0.5 + i * 0.1;
    o.connect(g).connect(padOut);
    lfo(0.05 + i * 0.013, 0.8, o.detune);
    o.start(); stops.push(o);
  });

  const blip = (freq, start, dur, vol, sweep = 0) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, start);
    if (sweep) o.frequency.exponentialRampToValueAtTime(freq + sweep, start + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master);
    o.start(start); o.stop(start + dur + 0.05);
  };

  if (mix.birds) {
    const chirp = () => {
      const t = c.currentTime + 0.05;
      const base = 2200 + Math.random() * 1400;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) blip(base + i * 120, t + i * 0.14, 0.1, 0.018, 700);
      timers.push(setTimeout(chirp, 2500 + Math.random() * 6000));
    };
    timers.push(setTimeout(chirp, 1500));
  }

  if (mix.crickets) {
    const burst = () => {
      const t = c.currentTime + 0.05;
      for (let i = 0; i < 5; i++) blip(4300, t + i * 0.09, 0.05, 0.006);
      timers.push(setTimeout(burst, 1200 + Math.random() * 2200));
    };
    timers.push(setTimeout(burst, 800));
  }

  return {
    phase,
    stop() {
      timers.forEach(clearTimeout);
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.setValueAtTime(master.gain.value, c.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
      setTimeout(() => { stops.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); master.disconnect(); }, 1400);
    },
  };
}

export const ambient = {
  start() {
    if (session) return;
    session = build(phaseOf(currentHour()));
  },
  stop() {
    session?.stop();
    session = null;
  },
  // Called now and then so the sound moves from morning to afternoon to evening on its own.
  refresh() {
    if (session && session.phase !== phaseOf(currentHour())) {
      this.stop();
      this.start();
    }
  },
  get playing() { return Boolean(session); },
};
setInterval(() => ambient.refresh(), 60_000);
