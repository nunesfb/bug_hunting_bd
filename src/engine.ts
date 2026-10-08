// Engine 2D em Canvas: física em passo fixo (60 Hz), câmera com rolagem,
// inimigos, moedas, checkpoints, portal, partículas e renderização por mundo.
import { challenges, worlds, type World } from './data';
import type { Sfx } from './audio';

export const VIEW_W = 960;
export const VIEW_H = 480;
export const GROUND = 400;
const PW = 26, PH = 34;
const GRAV = 0.5, MAX_FALL = 13, RUN = 4.1, JUMP_V = -10.8;
const STEP = 1000 / 60;

type Plat = { x: number; y: number; w: number; h: number; ground?: boolean; dx: number; move?: { x0: number; range: number; speed: number; t: number } };
type Term = { id: number; idx: number; x: number; y: number; boss: boolean };
type Enemy = { kind: 'crawler' | 'flyer'; x: number; y: number; baseY: number; w: number; h: number; vx: number; minX: number; maxX: number; alive: boolean; respawn: number; phase: number };
type Coin = { x: number; y: number; taken: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number };
type Floater = { x: number; y: number; text: string; color: string; life: number; max: number; big: boolean };
type Level = { width: number; plats: Plat[]; pits: [number, number][]; terms: Term[]; enemies: Enemy[]; coins: Coin[]; portalX: number; bossX: number; final: boolean };

export type NearInfo = { id: number; locked: boolean; needed: number } | null;
export type EngineEvents = {
  onNear: (info: NearInfo) => void;
  onInteract: (id: number) => void;
  onLocked: (needed: number) => void;
  onPortal: () => void;
  onCoin: () => void;
  onStomp: () => void;
  sfx: (s: Sfx) => void;
};

const hash = (n: number) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function buildLevel(w: number): Level {
  const width = 2800 + w * 200;
  const pitW = 60 + w * 10;
  const pits: [number, number][] = [];
  [820, 1460, 2160].slice(0, Math.min(w, 3)).forEach(a => pits.push([a, a + pitW]));
  const mover = w >= 4;
  if (mover) pits.push([2480, 2710]);

  const plats: Plat[] = [];
  let gx = 0;
  for (const [a, b] of pits) { plats.push({ x: gx, y: GROUND, w: a - gx, h: 80, ground: true, dx: 0 }); gx = b; }
  plats.push({ x: gx, y: GROUND, w: width - gx, h: 80, ground: true, dx: 0 });
  const fp = (x: number, y: number, pw: number) => plats.push({ x, y, w: pw, h: 16, dx: 0 });
  fp(300, 318, 120);            // plataforma bônus
  fp(1080, 316, 170);           // terminal 2
  fp(1650, 330, 110);           // escada até o terminal 3
  fp(1780, 262, 120);
  if (w >= 3) fp(1920, 196, 150);
  if (mover) plats.push({ x: 2490, y: 360, w: 90, h: 14, dx: 0, move: { x0: 2490, range: 120, speed: 0.9 + (w - 4) * 0.35, t: 0 } });

  const ids = challenges.filter(c => c.world === w).map(c => c.id);
  const pos = [{ x: 520, y: GROUND }, { x: 1165, y: 316 }, w >= 3 ? { x: 1995, y: 196 } : { x: 1840, y: 262 }, { x: width - 520, y: GROUND }];
  const terms: Term[] = ids.map((id, idx) => ({ id, idx, x: pos[idx].x, y: pos[idx].y, boss: idx === 3 }));

  const groundAt = (x: number) => plats.find(p => p.ground && x > p.x + 20 && x < p.x + p.w - 40);
  const enemies: Enemy[] = [];
  const n = 3 + w * 2;
  for (let k = 0; k < n; k++) {
    const x = 650 + (k + 0.5) * (width - 1500) / n;
    const seg = groundAt(x);
    if (!seg || terms.some(t => t.y === GROUND && Math.abs(t.x - x) < 110)) continue;
    const minX = Math.max(seg.x + 10, x - 110), maxX = Math.min(seg.x + seg.w - 36, x + 110);
    if (maxX - minX < 60) continue;
    const speed = (0.8 + w * 0.25) * (k % 2 ? 1 : -1);
    enemies.push({ kind: 'crawler', x, y: GROUND - 20, baseY: GROUND - 20, w: 26, h: 20, vx: speed, minX, maxX, alive: true, respawn: 0, phase: k });
  }
  for (let k = 0; k < w; k++) {
    const x = 900 + (k + 0.5) * (width - 2000) / w;
    const baseY = 230 + (k % 2) * 45;
    enemies.push({ kind: 'flyer', x, y: baseY, baseY, w: 26, h: 18, vx: (0.8 + w * 0.2) * (k % 2 ? 1 : -1), minX: x - 150, maxX: x + 150, alive: true, respawn: 0, phase: k * 1.7 });
  }

  const coins: Coin[] = [];
  for (let i = 0; i < 3; i++) coins.push({ x: 330 + i * 30, y: 296, taken: false });
  for (const [a, b] of pits) { const m = (a + b) / 2; coins.push({ x: m - 30, y: 340, taken: false }, { x: m, y: 318, taken: false }, { x: m + 30, y: 340, taken: false }); }
  for (let x = 700; x < width - 700; x += 260) if (groundAt(x) && !terms.some(t => Math.abs(t.x - x) < 60)) coins.push({ x, y: 372, taken: false });
  coins.push({ x: 1810, y: 238, taken: false }, { x: 1850, y: 238, taken: false });
  if (w >= 3) coins.push({ x: 1960, y: 172, taken: false }, { x: 2040, y: 172, taken: false });

  return { width, plats, pits, terms, enemies, coins, portalX: width - 140, bossX: width - 400, final: w === worlds.length - 1 };
}

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private L: Level = buildLevel(0);
  world = 0;
  private solved = new Set<number>();
  private p = { x: 60, y: GROUND - PH, vx: 0, vy: 0, ground: false, coyote: 0, jumpBuf: 0, face: 1, invuln: 0, knock: 0, walk: 0, squash: 0, onPlat: null as Plat | null };
  private keys = new Set<string>();
  private cam = 0;
  private shake = 0;
  private flash = 0;
  private flashColor = '#fff';
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private paused = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private frame = 0;
  private near: NearInfo = null;
  private portalFired = false;
  private bossAnim = -1;
  private lockedCooldown = 0;

  constructor(canvas: HTMLCanvasElement, private ev: EngineEvents) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() { cancelAnimationFrame(this.raf); }

  load(world: number, solvedIds: number[]) {
    this.world = world;
    this.L = buildLevel(world);
    this.solved = new Set(solvedIds);
    this.particles = [];
    this.floaters = [];
    this.portalFired = false;
    this.bossAnim = this.L.terms.some(t => t.boss && this.solved.has(t.id)) ? 9999 : -1;
    this.respawn(false);
    this.cam = clamp(this.p.x - VIEW_W * 0.4, 0, this.L.width - VIEW_W);
    this.setNear(null);
  }

  /** Atualiza bugs resolvidos; dispara efeitos para os recém-resolvidos. */
  setSolved(ids: number[]) {
    for (const id of ids) {
      if (this.solved.has(id)) continue;
      this.solved.add(id);
      const t = this.L.terms.find(t => t.id === id);
      if (!t) continue;
      this.burst(t.x, t.y - 40, worlds[this.world].color, 40);
      this.burst(t.x, t.y - 40, '#ffffff', 16);
      if (t.boss) { this.bossAnim = 0; this.shake = 14; this.ev.sfx('boss'); }
      if (this.allSolved() && !this.L.final) {
        this.floaters.push({ x: this.L.portalX, y: GROUND - 140, text: 'PORTAL ABERTO!', color: '#fff', life: 240, max: 240, big: true });
      }
    }
    this.setNear(null);
  }

  celebrate(id: number, text: string) {
    const t = this.L.terms.find(t => t.id === id);
    if (t) this.floaters.push({ x: t.x, y: t.y - 100, text, color: '#ffe066', life: 110, max: 110, big: true });
  }

  setPaused(v: boolean) {
    this.paused = v;
    if (v) { this.keys.clear(); this.p.jumpBuf = 0; }
  }

  clearKeys() { this.keys.clear(); }

  keyDown(code: string, repeat = false) {
    this.keys.add(code);
    if (!repeat && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) this.p.jumpBuf = 8;
  }
  keyUp(code: string) { this.keys.delete(code); }

  interact() {
    if (this.paused || !this.near) return;
    if (this.near.locked) {
      if (this.lockedCooldown <= 0) { this.ev.onLocked(this.near.needed); this.ev.sfx('locked'); this.lockedCooldown = 30; }
      return;
    }
    this.ev.onInteract(this.near.id);
  }

  // ── utilitários de teste/depuração ──
  teleport(x: number, y: number) { this.p.x = x; this.p.y = y; this.p.vx = 0; this.p.vy = 0; }
  terminalSpot(id: number) { const t = this.L.terms.find(t => t.id === id); return t ? { x: t.x - PW / 2, y: t.y - PH } : null; }
  portalSpot() { return { x: this.L.portalX - PW / 2, y: GROUND - PH }; }
  debugState() { return { x: this.p.x, y: this.p.y, ground: this.p.ground, world: this.world, near: this.near, width: this.L.width, paused: this.paused, plats: this.L.plats.map(p => ({ x: p.x, y: p.y, w: p.w, ground: !!p.ground, moving: !!p.move })), terms: this.L.terms.map(t => ({ ...t })) }; }

  private allSolved() { return this.L.terms.every(t => this.solved.has(t.id)); }
  private activeIdx() { const t = this.L.terms.find(t => !this.solved.has(t.id)); return t ? t.idx : 99; }

  private checkpoint() {
    const done = this.L.terms.filter(t => this.solved.has(t.id));
    const t = done[done.length - 1];
    return t ? { x: t.x - PW / 2 + 40, y: t.y - PH } : { x: 60, y: GROUND - PH };
  }

  private respawn(effects = true) {
    const c = this.checkpoint();
    Object.assign(this.p, { x: c.x, y: c.y - 2, vx: 0, vy: 0, ground: false, knock: 0, invuln: effects ? 60 : 0, onPlat: null });
    if (effects) { this.flash = 1; this.flashColor = '#000'; this.burst(c.x + PW / 2, c.y + PH / 2, '#ffffff', 18); }
  }

  private setNear(info: NearInfo) {
    const a = this.near, b = info;
    if (a === b || (a && b && a.id === b.id && a.locked === b.locked)) return;
    this.near = info;
    this.ev.onNear(info);
  }

  private burst(x: number, y: number, color: string, n: number, speed = 4) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, sp = Math.random() * speed + 1;
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2, life: 40 + Math.random() * 30, max: 70, color, size: 2 + Math.random() * 4, grav: 0.15 });
    }
  }
  private dust(x: number, y: number, n = 6) {
    for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.5, life: 22, max: 22, color: '#ffffff88', size: 3, grav: 0.02 });
  }

  private loop(t: number) {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.last) this.last = t;
    const dt = Math.min(250, t - this.last);
    this.last = t;
    this.acc += dt;
    while (this.acc >= STEP) { this.update(); this.acc -= STEP; }
    this.render();
  }

  private update() {
    this.frame++;
    for (const q of this.particles) { q.x += q.vx; q.y += q.vy; q.vy += q.grav; q.life--; }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const f of this.floaters) { f.y -= 0.6; f.life--; }
    this.floaters = this.floaters.filter(f => f.life > 0);
    if (this.bossAnim >= 0 && this.bossAnim < 9999) {
      this.bossAnim++;
      if (this.bossAnim % 8 === 0 && this.bossAnim < 100) { this.burst(this.L.bossX + (Math.random() - 0.5) * 60, GROUND - 50 - Math.random() * 50, worlds[this.world].color, 10, 5); this.shake = 6; }
      if (this.bossAnim > 130) this.bossAnim = 9999;
    }
    this.shake *= 0.88;
    this.flash = Math.max(0, this.flash - 0.04);
    if (this.lockedCooldown > 0) this.lockedCooldown--;
    if (this.paused) return;

    const L = this.L, p = this.p, k = this.keys;
    for (const pl of L.plats) if (pl.move) {
      const m = pl.move;
      m.t += m.speed * 0.02;
      const nx = m.x0 + (Math.sin(m.t) * 0.5 + 0.5) * m.range;
      pl.dx = nx - pl.x;
      pl.x = nx;
    }

    const left = k.has('ArrowLeft') || k.has('KeyA'), right = k.has('ArrowRight') || k.has('KeyD');
    const jumpHeld = k.has('Space') || k.has('ArrowUp') || k.has('KeyW');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (p.knock > 0) p.knock--;
    else {
      p.vx += (dir * RUN - p.vx) * (p.ground ? 0.3 : 0.16);
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }
    if (dir) p.face = dir;
    if (p.ground && p.onPlat?.move) p.x += p.onPlat.dx;

    p.coyote = p.ground ? 7 : p.coyote - 1;
    if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = JUMP_V; p.ground = false; p.coyote = 0; p.jumpBuf = 0; p.onPlat = null; p.squash = -0.25;
      this.ev.sfx('jump');
      this.dust(p.x + PW / 2, p.y + PH, 5);
    }
    if (!jumpHeld && p.vy < -4) p.vy = -4;
    const vyBefore = p.vy;
    p.vy = Math.min(MAX_FALL, p.vy + GRAV);

    p.x = clamp(p.x + p.vx, 0, L.width - PW);
    if (p.y + PH > GROUND + 2) {
      const pit = L.pits.find(([a, b]) => p.x + PW / 2 > a && p.x + PW / 2 < b);
      if (pit) p.x = clamp(p.x, pit[0], pit[1] - PW);
    }

    const oldBottom = p.y + PH;
    p.y += p.vy;
    const wasGround = p.ground;
    p.ground = false; p.onPlat = null;
    if (p.vy >= 0) for (const pl of L.plats) {
      if (p.x + PW - 3 > pl.x && p.x + 3 < pl.x + pl.w && oldBottom <= pl.y + 2 + Math.abs(pl.dx) && p.y + PH >= pl.y) {
        p.y = pl.y - PH; p.vy = 0; p.ground = true; p.onPlat = pl; break;
      }
    }
    if (!wasGround && p.ground && vyBefore > 5) { this.dust(p.x + PW / 2, p.y + PH, 7); p.squash = 0.3; this.ev.sfx('land'); }
    p.squash *= 0.8;
    if (p.ground && Math.abs(p.vx) > 0.5) p.walk += Math.abs(p.vx) * 0.09;

    if (p.y > VIEW_H + 60) { this.ev.sfx('fall'); this.shake = 10; this.respawn(); }
    if (p.invuln > 0) p.invuln--;

    for (const e of L.enemies) {
      if (!e.alive) {
        if (--e.respawn <= 0 && Math.abs(e.x - p.x) > 400) e.alive = true;
        continue;
      }
      e.x += e.vx;
      if (e.x < e.minX || e.x > e.maxX) { e.vx *= -1; e.x = clamp(e.x, e.minX, e.maxX); }
      if (e.kind === 'flyer') e.y = e.baseY + Math.sin(this.frame * 0.05 + e.phase) * 24;
      const hit = p.x < e.x + e.w && p.x + PW > e.x && p.y < e.y + e.h && p.y + PH > e.y;
      if (!hit) continue;
      if (vyBefore > 0 && oldBottom <= e.y + 10) {
        e.alive = false; e.respawn = 600;
        p.vy = jumpHeld ? -10 : -7; p.ground = false;
        this.burst(e.x + e.w / 2, e.y + e.h / 2, '#e85b7a', 18);
        this.floaters.push({ x: e.x + e.w / 2, y: e.y - 10, text: 'BUG ESMAGADO!', color: '#ff9fb2', life: 50, max: 50, big: false });
        this.ev.sfx('stomp'); this.ev.onStomp();
      } else if (p.invuln === 0) {
        p.invuln = 90; p.knock = 14;
        p.vx = p.x + PW / 2 < e.x + e.w / 2 ? -6 : 6; p.vy = -5;
        this.shake = 9; this.flash = 0.5; this.flashColor = '#ff2a55';
        this.ev.sfx('hurt');
      }
    }

    for (const c of L.coins) {
      if (c.taken || Math.abs(p.x + PW / 2 - c.x) > 18 || Math.abs(p.y + PH / 2 - c.y) > 24) continue;
      c.taken = true;
      this.burst(c.x, c.y, '#ffd23f', 8, 2.5);
      this.ev.sfx('coin'); this.ev.onCoin();
    }

    if (!L.final && this.allSolved() && !this.portalFired && p.x + PW > L.portalX - 18 && p.x < L.portalX + 18) {
      this.portalFired = true;
      this.burst(L.portalX, GROUND - 60, '#ffffff', 50, 6);
      this.ev.sfx('portal');
      this.ev.onPortal();
    }

    const active = this.activeIdx();
    const t = L.terms.find(t => !this.solved.has(t.id) && Math.abs(p.x + PW / 2 - t.x) < 48 && Math.abs(p.y + PH - t.y) < 40);
    if (t) {
      const needed = L.terms[active]?.id ?? t.id;
      this.setNear({ id: t.id, locked: t.idx > active, needed });
    } else this.setNear(null);

    const target = p.x + PW / 2 - VIEW_W * 0.42 + p.face * 50;
    this.cam += (target - this.cam) * 0.08;
    this.cam = clamp(this.cam, 0, L.width - VIEW_W);
  }

  // ───────────── renderização ─────────────
  private render() {
    const c = this.ctx, th = worlds[this.world], L = this.L, f = this.frame;
    c.save();
    const sky = c.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, th.sky); sky.addColorStop(1, th.bg);
    c.fillStyle = sky; c.fillRect(0, 0, VIEW_W, VIEW_H);

    for (let i = 0; i < 90; i++) {
      const x = ((hash(i) * 2000 - this.cam * 0.08) % VIEW_W + VIEW_W) % VIEW_W, y = hash(i + 99) * 300;
      c.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(f * 0.02 + i));
      c.fillStyle = i % 4 === 0 ? th.color : '#ffffff';
      c.fillRect(x, y, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
    }
    c.globalAlpha = 1;
    this.drawScenery(c, th, 0.22, 0.13, 1);
    this.drawScenery(c, th, 0.5, 0.22, 2);

    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    c.translate(Math.round(-this.cam + sx), Math.round(sy));

    // abismos
    for (const [a, b] of L.pits) {
      const g = c.createLinearGradient(0, GROUND, 0, VIEW_H);
      g.addColorStop(0, '#00000000'); g.addColorStop(1, '#ff2a5544');
      c.fillStyle = g; c.fillRect(a, GROUND, b - a, VIEW_H - GROUND);
    }
    for (const pl of L.plats) this.drawPlat(c, pl, th);
    for (const co of L.coins) if (!co.taken) {
      const wv = Math.abs(Math.cos(f * 0.08 + co.x)) * 12 + 2, by = co.y + Math.sin(f * 0.06 + co.x) * 3;
      c.fillStyle = '#b8860b'; c.fillRect(co.x - wv / 2, by - 8, wv, 16);
      c.fillStyle = '#ffd23f'; c.fillRect(co.x - wv / 2 + 1, by - 7, Math.max(1, wv - 2), 14);
      if (wv > 8) { c.fillStyle = '#7a5600'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(co.x % 2 ? '1' : '0', co.x, by + 4); }
    }
    for (const t of L.terms) this.drawTerminal(c, t, th);
    this.drawBoss(c, th);
    if (!L.final) this.drawPortal(c, th);
    for (const e of L.enemies) if (e.alive) this.drawEnemy(c, e);
    this.drawPlayer(c);
    for (const q of this.particles) { c.globalAlpha = clamp(q.life / q.max, 0, 1); c.fillStyle = q.color; c.fillRect(q.x, q.y, q.size, q.size); }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    for (const fl of this.floaters) {
      c.globalAlpha = clamp(fl.life / 30, 0, 1);
      c.font = fl.big ? 'bold 22px monospace' : 'bold 12px monospace';
      c.fillStyle = '#000a'; c.fillText(fl.text, fl.x + 2, fl.y + 2);
      c.fillStyle = fl.color; c.fillText(fl.text, fl.x, fl.y);
    }
    c.globalAlpha = 1;
    c.restore();
    this.drawHud(c, th);
    if (this.flash > 0) { c.globalAlpha = this.flash * 0.45; c.fillStyle = this.flashColor; c.fillRect(0, 0, VIEW_W, VIEW_H); c.globalAlpha = 1; }
  }

  private drawScenery(c: CanvasRenderingContext2D, th: World, par: number, alpha: number, layer: number) {
    const span = layer === 1 ? 140 : 190;
    const off = this.cam * par;
    const first = Math.floor(off / span) - 1;
    c.fillStyle = th.color;
    for (let i = first; i < first + VIEW_W / span + 3; i++) {
      const x = i * span - off, r = hash(i * 7 + layer * 31);
      c.globalAlpha = alpha;
      const base = layer === 1 ? 330 : GROUND;
      switch (this.world) {
        case 0: { // pinheiros
          const h = 90 + r * 120;
          for (let s = 0; s < 4; s++) { const ww = 50 - s * 10 + r * 20, yy = base - h + s * h / 4; c.fillRect(x + 60 - ww / 2, yy, ww, h / 4 + 6); }
          c.fillRect(x + 56, base - 18, 8, 18); break;
        }
        case 1: { // cavernas: estalactites e cristais
          const h = 40 + r * 110;
          for (let s = 0; s < 5; s++) c.fillRect(x + s * 8, 0, 9, h - s * h / 5);
          if (layer === 2) { c.globalAlpha = 0.35 + 0.25 * Math.sin(this.frame * 0.05 + i); c.fillRect(x + 40, base - 26 - r * 20, 8, 26 + r * 20); c.fillRect(x + 50, base - 16, 6, 16); }
          else c.fillRect(x, base - 40 - r * 70, 120, 200); break;
        }
        case 2: { // castelo
          const h = 120 + r * 120;
          c.fillRect(x + 20, base - h, 60, h);
          for (let s = 0; s < 4; s++) c.fillRect(x + 20 + s * 17, base - h - 12, 10, 12);
          c.globalAlpha = alpha * 2.5; c.fillStyle = '#ffe9a8';
          if (r > 0.4) c.fillRect(x + 44, base - h + 30, 10, 16);
          c.fillStyle = th.color; break;
        }
        case 3: { // laboratório: tubos com bolhas
          const h = 110 + r * 120;
          c.fillRect(x + 30, base - h, 46, h);
          c.globalAlpha = alpha * 2;
          c.fillRect(x + 34, base - h * 0.6, 38, h * 0.6);
          const by = base - ((this.frame * (1 + r) + i * 40) % (h * 0.6));
          c.fillStyle = '#ffffff'; c.globalAlpha = 0.25; c.fillRect(x + 48 + Math.sin(this.frame * 0.1 + i) * 6, by, 5, 5);
          c.fillStyle = th.color; break;
        }
        case 4: { // cidadela: obeliscos com runas
          const h = 130 + r * 120;
          c.fillRect(x + 40, base - h, 34, h);
          c.fillRect(x + 46, base - h - 18, 22, 18);
          c.globalAlpha = 0.25 + 0.3 * Math.abs(Math.sin(this.frame * 0.03 + i));
          for (let s = 0; s < 3; s++) c.fillRect(x + 52, base - h + 20 + s * 30, 10, 10);
          break;
        }
        default: { // fortaleza: espinhos e raios
          const h = 100 + r * 150;
          c.beginPath(); c.moveTo(x, base); c.lineTo(x + 40, base - h); c.lineTo(x + 80, base); c.fill();
          if (layer === 2 && (this.frame + i * 97) % 420 < 6) {
            c.globalAlpha = 0.6; c.fillStyle = '#fff';
            let lx = x + 40, ly = 0;
            for (let s = 0; s < 6; s++) { const nx = lx + (hash(i + s + this.frame) - 0.5) * 40, ny = ly + 50; c.fillRect(Math.min(lx, nx), ly, Math.abs(nx - lx) + 3, 52); lx = nx; ly = ny; }
            c.fillStyle = th.color;
          }
        }
      }
    }
    c.globalAlpha = 1;
  }

  private drawPlat(c: CanvasRenderingContext2D, pl: Plat, th: World) {
    if (pl.ground) {
      c.fillStyle = '#0b1122'; c.fillRect(pl.x, pl.y, pl.w, pl.h);
      c.fillStyle = th.color; c.fillRect(pl.x, pl.y, pl.w, 6);
      c.fillStyle = '#ffffff14';
      for (let x = pl.x + 6; x < pl.x + pl.w - 10; x += 32) { c.fillRect(x, pl.y + 16, 22, 4); c.fillRect(x + 14, pl.y + 34, 22, 4); }
      c.fillStyle = '#00000055'; c.fillRect(pl.x, pl.y + 6, pl.w, 4);
      return;
    }
    if (pl.move) {
      c.globalAlpha = 0.35 + 0.2 * Math.sin(this.frame * 0.1);
      c.fillStyle = th.color; c.fillRect(pl.x - 4, pl.y - 4, pl.w + 8, pl.h + 8);
      c.globalAlpha = 1;
    }
    c.fillStyle = '#161d35'; c.fillRect(pl.x, pl.y, pl.w, pl.h);
    c.fillStyle = pl.move ? '#ffffff' : th.color; c.fillRect(pl.x, pl.y, pl.w, 5);
    c.fillStyle = '#ffffff18';
    for (let x = pl.x + 8; x < pl.x + pl.w - 10; x += 29) c.fillRect(x, pl.y + 9, 12, 3);
  }

  private drawTerminal(c: CanvasRenderingContext2D, t: Term, th: World) {
    const solved = this.solved.has(t.id), locked = !solved && t.idx > this.activeIdx();
    const tx = t.x, ty = t.y - 76;
    const col = solved ? '#2ee59d' : locked ? '#56607a' : t.boss ? '#ff5470' : th.color;
    if (!locked) {
      c.globalAlpha = solved ? 0.18 : Math.sin(this.frame / 12) * 0.15 + 0.4;
      c.fillStyle = col; c.fillRect(tx - 34, ty - 12, 68, 88);
      c.globalAlpha = 1;
    }
    c.fillStyle = '#080e1f'; c.fillRect(tx - 26, ty - 6, 52, 82);
    c.fillStyle = col; c.fillRect(tx - 22, ty - 2, 44, 40);
    c.fillStyle = '#061526'; c.fillRect(tx - 18, ty + 2, 36, 32);
    c.textAlign = 'center';
    c.font = 'bold 15px monospace'; c.fillStyle = col;
    if (solved) c.fillText('✓', tx, ty + 24);
    else if (locked) { c.fillRect(tx - 7, ty + 14, 14, 11); c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(tx, ty + 14, 5, Math.PI, 0); c.stroke(); }
    else c.fillText(this.frame % 40 < 20 ? '>_' : '> ', tx, ty + 23);
    c.fillStyle = '#111a2e'; c.fillRect(tx - 22, ty + 44, 44, 14);
    c.fillStyle = '#fff'; c.font = '10px monospace';
    c.fillText((t.boss ? '☠ ' : '') + 'BUG ' + t.id, tx, ty + 55);
    c.fillStyle = '#1b2440'; c.fillRect(tx - 14, ty + 62, 28, 14);
    if (!solved && !locked) {
      const by = ty - 30 + Math.sin(this.frame * 0.12) * 4;
      c.fillStyle = col; c.font = 'bold 22px monospace'; c.fillText('!', tx, by);
      if (this.near && this.near.id === t.id) {
        c.fillStyle = '#000b'; c.fillRect(tx - 70, ty - 66, 140, 22);
        c.fillStyle = '#fff'; c.font = 'bold 13px monospace'; c.fillText('PRESSIONE  E', tx, ty - 50);
      }
    }
    if (locked && this.near && this.near.id === t.id) {
      c.fillStyle = '#000b'; c.fillRect(tx - 90, ty - 50, 180, 22);
      c.fillStyle = '#ffb4c0'; c.font = 'bold 12px monospace'; c.fillText(`RESOLVA O BUG ${this.near.needed}`, tx, ty - 34);
    }
  }

  private drawBoss(c: CanvasRenderingContext2D, th: World) {
    if (this.bossAnim === 9999) return;
    const x = this.L.bossX, a = this.bossAnim;
    const dying = a >= 0;
    const bob = Math.sin(this.frame * 0.06) * 6;
    const sc = dying ? Math.max(0, 1 - a / 130) : 1;
    if (dying && a % 6 < 3) return;
    c.save();
    c.translate(x, GROUND + 8 + (dying ? a * 0.6 : 0));
    c.scale(1, sc);
    const y0 = -110 + bob;
    c.fillStyle = th.color; c.globalAlpha = 0.25; c.fillRect(-54, y0 - 10, 108, 118); c.globalAlpha = 1;
    c.fillStyle = '#1a1030'; c.fillRect(-44, y0, 88, 100);
    c.fillStyle = th.color; c.fillRect(-40, y0 + 4, 80, 92);
    c.fillStyle = '#00000044'; c.fillRect(-40, y0 + 60, 80, 36);
    // chifres / coroa
    c.fillStyle = '#fff3'; c.fillRect(-40, y0 - 16, 12, 16); c.fillRect(28, y0 - 16, 12, 16); c.fillRect(-6, y0 - 22, 12, 22);
    // olhos
    const look = clamp((this.p.x - x) / 200, -1, 1) * 4;
    c.fillStyle = '#fff'; c.fillRect(-28, y0 + 22, 20, 18); c.fillRect(8, y0 + 22, 20, 18);
    c.fillStyle = dying ? '#000' : '#c3002f';
    if (dying) { c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText('X', -18, y0 + 38); c.fillText('X', 18, y0 + 38); }
    else { c.fillRect(-22 + look, y0 + 27, 8, 9); c.fillRect(14 + look, y0 + 27, 8, 9); }
    // boca
    c.fillStyle = '#1a1030'; c.fillRect(-24, y0 + 54, 48, 12);
    c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) c.fillRect(-22 + i * 12, y0 + 54, 6, 6);
    // braços
    const arm = Math.sin(this.frame * 0.1) * 8;
    c.fillStyle = th.color; c.fillRect(-58, y0 + 40 + arm, 14, 34); c.fillRect(44, y0 + 40 - arm, 14, 34);
    c.restore();
    if (!dying) {
      c.textAlign = 'center'; c.font = 'bold 13px monospace';
      c.fillStyle = '#000a'; c.fillRect(x - 80, GROUND - 160 + bob, 160, 20);
      c.fillStyle = '#ff8fa3'; c.fillText('☠ ' + th.boss, x, GROUND - 145 + bob);
    }
  }

  private drawPortal(c: CanvasRenderingContext2D, th: World) {
    const x = this.L.portalX, open = this.allSolved(), f = this.frame;
    c.fillStyle = '#1b2238'; c.fillRect(x - 36, GROUND - 130, 72, 130);
    c.fillStyle = '#0a0f1e'; c.fillRect(x - 28, GROUND - 122, 56, 122);
    if (open) {
      for (let i = 0; i < 6; i++) {
        const r = ((f * 0.6 + i * 10) % 60);
        c.globalAlpha = 1 - r / 60;
        c.strokeStyle = i % 2 ? th.color : '#ffffff'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(x, GROUND - 60, Math.max(1, 26 - r * 0.35), Math.max(1, 56 - r * 0.8), 0, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = '#fff'; c.font = 'bold 12px monospace'; c.textAlign = 'center';
      c.fillText('▶ PRÓXIMO MUNDO', x, GROUND - 142 + Math.sin(f * 0.1) * 3);
    } else {
      c.fillStyle = '#56607a'; c.fillRect(x - 8, GROUND - 70, 16, 13);
      c.strokeStyle = '#56607a'; c.lineWidth = 3; c.beginPath(); c.arc(x, GROUND - 70, 6, Math.PI, 0); c.stroke();
      c.fillStyle = '#8a93ad'; c.font = '10px monospace'; c.textAlign = 'center'; c.fillText('PORTAL TRANCADO', x, GROUND - 140);
    }
  }

  private drawEnemy(c: CanvasRenderingContext2D, e: Enemy) {
    const x = Math.round(e.x), y = Math.round(e.y), f = this.frame;
    if (e.kind === 'crawler') {
      const leg = Math.floor(f / 6 + e.phase) % 2;
      c.fillStyle = '#7d1638'; c.fillRect(x + 2, y + 16, 4, 4 - leg * 2); c.fillRect(x + 11, y + 16, 4, 2 + leg * 2); c.fillRect(x + 20, y + 16, 4, 4 - leg * 2);
      c.fillStyle = '#e85b7a'; c.fillRect(x, y + 2, 26, 15);
      c.fillStyle = '#ff9fb2'; c.fillRect(x + 3, y, 20, 4);
      const ex = e.vx > 0 ? 14 : 4;
      c.fillStyle = '#fff'; c.fillRect(x + ex, y + 5, 4, 4); c.fillRect(x + ex + 6, y + 5, 4, 4);
      c.fillStyle = '#000'; c.fillRect(x + ex + (e.vx > 0 ? 2 : 0), y + 6, 2, 3); c.fillRect(x + ex + 6 + (e.vx > 0 ? 2 : 0), y + 6, 2, 3);
      c.fillStyle = '#a51e50'; c.fillRect(x + 7, y + 12, 12, 2);
    } else {
      const wing = Math.floor(f / 4 + e.phase) % 2;
      c.fillStyle = '#cfe8ffaa'; c.fillRect(x - 6, y + (wing ? -4 : 2), 10, 6); c.fillRect(x + 22, y + (wing ? -4 : 2), 10, 6);
      c.fillStyle = '#9b5cff'; c.fillRect(x, y + 2, 26, 14);
      c.fillStyle = '#fff'; c.fillRect(x + 6, y + 5, 5, 5); c.fillRect(x + 15, y + 5, 5, 5);
      c.fillStyle = '#000'; c.fillRect(x + 8, y + 7, 2, 2); c.fillRect(x + 17, y + 7, 2, 2);
      c.fillStyle = '#ffd23f'; c.fillRect(x + 11, y + 16, 4, 4);
    }
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const p = this.p;
    if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;
    const bx = Math.round(p.x), by = Math.round(p.y);
    c.fillStyle = '#0006'; c.fillRect(bx - 1, by + PH - 2, PW + 2, 4);
    c.save();
    c.translate(bx + PW / 2, by + PH);
    c.scale(p.face * (1 + p.squash * 0.5), 1 - p.squash * 0.5);
    const air = !p.ground;
    const step = Math.sin(p.walk * 2.2);
    const l1 = air ? -3 : Math.max(0, step) * 4, l2 = air ? 2 : Math.max(0, -step) * 4;
    // pernas
    c.fillStyle = '#1a8a82'; c.fillRect(-9, -6 - l1, 7, 6); c.fillRect(2, -6 - l2, 7, 6);
    c.fillStyle = '#0f4f56'; c.fillRect(-10, -2 - l1, 8, 2); c.fillRect(2, -2 - l2, 8, 2);
    // corpo
    c.fillStyle = '#2cd1ac'; c.fillRect(-11, -18, 22, 13);
    c.fillStyle = '#1ea98a'; c.fillRect(-11, -9, 22, 3);
    c.fillStyle = '#ffd23f'; c.fillRect(-2, -16, 4, 4);
    // braço balançando
    const arm = air ? -6 : step * 3;
    c.fillStyle = '#ffe1ab'; c.fillRect(8, -17 + arm, 4, 8);
    // cabeça
    c.fillStyle = '#ffe1ab'; c.fillRect(-8, -30, 16, 13);
    c.fillStyle = '#3c325a'; c.fillRect(-9, -33, 18, 6); c.fillRect(-9, -33, 4, 11);
    c.fillStyle = '#ff5470'; c.fillRect(-12, -30, 4, 3);
    const blink = this.frame % 180 < 6;
    c.fillStyle = '#ffffff'; c.fillRect(2, blink ? -24 : -25, 4, blink ? 1 : 4);
    c.fillStyle = '#0a1025'; if (!blink) c.fillRect(4, -24, 2, 3);
    c.restore();
  }

  private drawHud(c: CanvasRenderingContext2D, th: World) {
    c.textAlign = 'left';
    c.fillStyle = '#000a'; c.fillRect(14, 14, 360, 30);
    c.fillStyle = th.color; c.fillRect(14, 14, 4, 30);
    c.font = 'bold 13px monospace'; c.fillStyle = '#fff';
    c.fillText(`MUNDO ${this.world + 1} · ${th.short} · ${th.level}`, 26, 34);
    const done = this.L.terms.filter(t => this.solved.has(t.id)).length;
    c.textAlign = 'right';
    c.fillStyle = '#000a'; c.fillRect(VIEW_W - 194, 14, 180, 30);
    c.fillStyle = '#fff'; c.fillText(`BUGS DO MUNDO ${done}/4`, VIEW_W - 26, 34);
    // minimapa
    const mx = 120, mw = VIEW_W - 240, my = VIEW_H - 16;
    c.fillStyle = '#0009'; c.fillRect(mx - 8, my - 8, mw + 16, 16);
    c.fillStyle = '#ffffff30'; c.fillRect(mx, my - 1, mw, 2);
    for (const t of this.L.terms) {
      const solved = this.solved.has(t.id);
      c.fillStyle = solved ? '#2ee59d' : t.idx === this.activeIdx() ? th.color : '#56607a';
      c.fillRect(mx + (t.x / this.L.width) * mw - 3, my - 4, 6, 8);
    }
    if (!this.L.final) { c.fillStyle = this.allSolved() ? '#fff' : '#56607a'; c.fillRect(mx + (this.L.portalX / this.L.width) * mw - 2, my - 6, 4, 12); }
    c.fillStyle = '#ffe1ab'; c.fillRect(mx + (this.p.x / this.L.width) * mw - 3, my - 3, 6, 6);
    // scanlines + vinheta
    c.fillStyle = '#00000018';
    for (let y = 0; y < VIEW_H; y += 3) c.fillRect(0, y, VIEW_W, 1);
    const v = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.65);
    v.addColorStop(0, '#00000000'); v.addColorStop(1, '#0000008a');
    c.fillStyle = v; c.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
