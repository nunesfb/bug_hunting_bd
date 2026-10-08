// Sons e trilha 8-bit sintetizados com Web Audio (sem arquivos externos).
type Wave = OscillatorType;
type Prefs = { sfx: boolean; music: boolean };

const PREFS_KEY = 'sql-quest-audio';
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let prefs: Prefs = loadPrefs();
let musicTimer: number | undefined;
let musicWorld = -1;
let step = 0;
let nextTime = 0;

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (p && typeof p.sfx === 'boolean' && typeof p.music === 'boolean') return p;
  } catch { /* ignora */ }
  return { sfx: true, music: true };
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignora */ } }

export const getPrefs = () => ({ ...prefs });

/** Precisa ser chamado num gesto do usuário (clique/tecla) para liberar o áudio. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = prefs.sfx ? 1 : 0;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = prefs.music ? 0.22 : 0;
      musicBus.connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* áudio indisponível: o jogo segue sem som */ }
}

export function setSfx(on: boolean) { prefs.sfx = on; savePrefs(); if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02); }
export function setMusic(on: boolean) { prefs.music = on; savePrefs(); if (musicBus && ctx) musicBus.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.05); }

function tone(freq: number, dur: number, type: Wave = 'square', vol = 0.25, delay = 0, slideTo?: number, bus = sfxBus) {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, delay = 0, freq = 1200) {
  if (!ctx || !sfxBus) return;
  const t = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const arp = (notes: number[], gap: number, dur: number, type: Wave = 'square', vol = 0.2) =>
  notes.forEach((n, i) => tone(midi(n), dur, type, vol, i * gap));

export type Sfx = 'jump' | 'land' | 'coin' | 'stomp' | 'hurt' | 'fall' | 'open' | 'select' | 'correct' | 'wrong' | 'hint'
  | 'portal' | 'boss' | 'victory' | 'gameover' | 'click' | 'locked' | 'tick' | 'world';

export function sfx(name: Sfx) {
  if (!ctx || !prefs.sfx) return;
  switch (name) {
    case 'jump': tone(300, 0.16, 'square', 0.12, 0, 720); break;
    case 'land': noise(0.05, 0.06, 0, 500); break;
    case 'coin': tone(midi(83), 0.07, 'square', 0.12); tone(midi(88), 0.18, 'square', 0.12, 0.06); break;
    case 'stomp': tone(220, 0.12, 'square', 0.18, 0, 80); noise(0.08, 0.12, 0, 900); break;
    case 'hurt': tone(400, 0.25, 'sawtooth', 0.15, 0, 90); noise(0.15, 0.1, 0, 600); break;
    case 'fall': tone(700, 0.6, 'triangle', 0.2, 0, 60); break;
    case 'open': arp([60, 67, 72, 79], 0.05, 0.1, 'square', 0.12); break;
    case 'select': tone(midi(76), 0.05, 'square', 0.08); break;
    case 'click': tone(midi(72), 0.04, 'square', 0.07); break;
    case 'correct': arp([72, 76, 79, 84, 88], 0.07, 0.16, 'square', 0.16); tone(midi(48), 0.5, 'triangle', 0.2, 0.05); break;
    case 'wrong': tone(160, 0.18, 'sawtooth', 0.18); tone(110, 0.35, 'sawtooth', 0.18, 0.16); break;
    case 'hint': arp([79, 76, 81], 0.06, 0.12, 'triangle', 0.18); break;
    case 'locked': tone(140, 0.12, 'square', 0.12); tone(120, 0.14, 'square', 0.12, 0.1); break;
    case 'portal': tone(200, 0.9, 'sine', 0.25, 0, 1600); arp([60, 64, 67, 72, 76, 79, 84], 0.08, 0.15, 'triangle', 0.14); break;
    case 'boss': noise(0.6, 0.25, 0, 400); tone(90, 0.7, 'sawtooth', 0.2, 0, 40); arp([84, 79, 76, 72], 0.1, 0.2, 'square', 0.12); break;
    case 'world': arp([67, 72, 76, 79, 84], 0.09, 0.2, 'square', 0.14); break;
    case 'tick': tone(midi(96), 0.03, 'square', 0.05); break;
    case 'victory': [[72, 0], [72, 0.15], [72, 0.3], [79, 0.45], [76, 0.75], [79, 0.9], [84, 1.05]].forEach(([n, d], i) => tone(midi(n), i === 6 ? 0.9 : 0.14, 'square', 0.16, d)); arp([48, 55, 60], 0.35, 0.4, 'triangle', 0.22); break;
    case 'gameover': [[67, 0], [66, 0.25], [65, 0.5], [64, 0.75]].forEach(([n, d], i) => tone(midi(n), i === 3 ? 0.9 : 0.25, 'square', 0.15, d)); break;
  }
}

// ───── Trilha procedural por mundo ─────
const SONGS = [
  { tempo: 112, root: 57, prog: [0, 5, 3, 7], scale: [0, 2, 3, 5, 7, 8, 10] },   // floresta: lá menor
  { tempo: 118, root: 52, prog: [0, 3, 5, 3], scale: [0, 2, 3, 5, 7, 8, 11] },   // minas: mi harmônica
  { tempo: 104, root: 50, prog: [0, 8, 5, 7], scale: [0, 1, 3, 5, 7, 8, 10] },   // castelo: frígio
  { tempo: 126, root: 55, prog: [0, 5, 0, 7], scale: [0, 2, 4, 7, 9, 12, 14] },  // laboratório: pentatônica
  { tempo: 132, root: 53, prog: [0, 3, 8, 7], scale: [0, 2, 3, 5, 7, 9, 10] },   // cidadela: dórico
  { tempo: 140, root: 52, prog: [0, 1, 0, 6], scale: [0, 1, 3, 5, 6, 8, 10] },   // fortaleza: lócrio
];
const MELODY = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 2, 4];

function scheduleStep(t: number) {
  if (!ctx || !musicBus) return;
  const song = SONGS[musicWorld] ?? SONGS[0];
  const bar = Math.floor(step / 16) % song.prog.length;
  const s = step % 16;
  const chordRoot = song.root + song.prog[bar];
  const play = (freq: number, dur: number, type: Wave, vol: number) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(musicBus!);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const sixteenth = 60 / song.tempo / 4;
  if (s % 4 === 0) play(midi(chordRoot - 12), sixteenth * 3.5, 'triangle', 0.5);
  if (s % 4 === 2) play(midi(chordRoot - 5), sixteenth * 1.5, 'triangle', 0.3);
  if (s % 2 === 0) {
    const deg = MELODY[(s + bar * 3) % MELODY.length];
    const oct = Math.floor(deg / song.scale.length);
    play(midi(chordRoot + 12 + song.scale[deg % song.scale.length] + oct * 12), sixteenth * 1.6, 'square', 0.12);
  }
  if (s % 4 === 0 || s === 14) {
    // chimbal
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(hp).connect(g).connect(musicBus);
    src.start(t);
  }
}

export function startMusic(world: number) {
  if (!ctx) return;
  if (musicTimer !== undefined && musicWorld === world) return;
  stopMusic();
  musicWorld = world;
  step = 0;
  nextTime = ctx.currentTime + 0.1;
  musicTimer = window.setInterval(() => {
    if (!ctx) return;
    const song = SONGS[musicWorld] ?? SONGS[0];
    const sixteenth = 60 / song.tempo / 4;
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(nextTime);
      nextTime += sixteenth;
      step++;
    }
  }, 40);
}

export function stopMusic() {
  if (musicTimer !== undefined) window.clearInterval(musicTimer);
  musicTimer = undefined;
  musicWorld = -1;
}
