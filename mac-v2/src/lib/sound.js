let ctx = null;
let cfg = { muted: false, volume: 0.4 };

export const configureSound = (c) => (cfg = { ...cfg, ...c });

const audio = () => {
  if (cfg.muted || !cfg.volume) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};

const tone = ({ freq, to, type = "sine", dur = 0.2, level = 0.2, attack = 0.006, delay = 0 }) => {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * cfg.volume), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
};

export const whoosh = () => {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const len = 0.7;
  const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.32);
  f.frequency.exponentialRampToValueAtTime(700, t + len);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * cfg.volume, t + 0.28);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + len);
};

const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export const chime = (hex = "#22d3ee") => {
  const f = 523.25 * 2 ** (SCALE[Math.floor(hue(hex) / 36) % SCALE.length] / 12);
  tone({ freq: f, dur: 1.3, level: 0.22 });
  tone({ freq: f * 2, dur: 0.9, level: 0.07, delay: 0.01 });
  tone({ freq: f * 3.01, type: "triangle", dur: 0.5, level: 0.03, delay: 0.02 });
};

export const tick = () => tone({ freq: 1400, type: "triangle", dur: 0.06, level: 0.08 });
export const click = () => tone({ freq: 2200, type: "triangle", dur: 0.03, level: 0.04 });
export const receive = () => {
  tone({ freq: 660, to: 990, dur: 0.35, level: 0.07 });
  tone({ freq: 990, dur: 0.45, level: 0.04, delay: 0.12 });
};

// Soft rising triad — plays once the reply has fully appeared on screen.
export const complete = () => {
  tone({ freq: 587.33, dur: 0.55, level: 0.075, delay: 0 });
  tone({ freq: 880, dur: 0.75, level: 0.06, delay: 0.1 });
  tone({ freq: 1174.66, type: "triangle", dur: 1.0, level: 0.035, delay: 0.2 });
};
