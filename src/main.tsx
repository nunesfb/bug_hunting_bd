import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BUGS_PER_WORLD, TOTAL_TIME, challenges, errorPenaltyFor, hintXpFor, worlds, xpFor } from './data';
import { Engine, VIEW_H, VIEW_W, type NearInfo } from './engine';
import { getPrefs, setMusic, setSfx, sfx, startMusic, stopMusic, unlockAudio } from './audio';
import './style.css';

type Save = {
  v: 2; name: string; cleared: number[]; hintsUsed: number[]; wrong: Record<number, number>;
  score: number; errors: number; hints: number; seconds: number; started: boolean; finished: boolean;
  outcome: 'win' | 'timeout' | null; world: number; bytes: number; stomps: number; seed: number; bonus: number;
  paused: boolean; pauses: number;
};
type Toast = { id: number; text: string; kind: 'info' | 'good' | 'bad' };
type Feedback = { ok: boolean; text: string } | null;

const TOTAL = challenges.length;
const STORE = 'sql-quest-save-v2';
const newSeed = () => Math.floor(Math.random() * 1e9) + 1;
const makeInitial = (): Save => ({ v: 2, name: '', cleared: [], hintsUsed: [], wrong: {}, score: 0, errors: 0, hints: 0, seconds: TOTAL_TIME, started: false, finished: false, outcome: null, world: 0, bytes: 0, stomps: 0, seed: newSeed(), bonus: 0, paused: false, pauses: 0 });

function getSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && s.v === 2 && Array.isArray(s.cleared)) {
      const base = makeInitial();
      const ids = new Set(challenges.map(c => c.id));
      return {
        ...base, ...s,
        cleared: s.cleared.filter((id: unknown) => ids.has(id as number)),
        hintsUsed: Array.isArray(s.hintsUsed) ? s.hintsUsed : [],
        wrong: s.wrong && typeof s.wrong === 'object' ? s.wrong : {},
        seconds: Math.min(TOTAL_TIME, Math.max(0, Number(s.seconds) || 0)),
        world: Math.min(worlds.length - 1, Math.max(0, Number(s.world) || 0)),
        paused: !!s.started && !s.finished,
      };
    }
  } catch { /* save corrompido: recomeça */ }
  return makeInitial();
}

/** Embaralhamento determinístico das alternativas por jogador(a) (evita "a resposta é a B"). */
function optionOrder(seed: number, id: number, n: number) {
  let x = (seed ^ (id * 2654435761)) >>> 0;
  const rnd = () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const fmt = (n: number) => `${String(Math.floor(n / 3600))}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const LETTERS = 'ABCDE';
const MAX_SCORE = challenges.reduce((s, c) => s + xpFor(c), 0);

function rankFor(score: number, win: boolean) {
  const r = score / MAX_SCORE;
  if (win && r >= 0.95) return 'ARQUITETO(A) DE DADOS LENDÁRIO(A)';
  if (r >= 0.8) return 'DBA SÊNIOR';
  if (r >= 0.6) return 'DBA PLENO';
  if (r >= 0.35) return 'DESENVOLVEDOR(A) SQL';
  return 'ESTAGIÁRIO(A) DE BANCO DE DADOS';
}

function useAnimatedNumber(value: number) {
  const [shown, setShown] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    const from = ref.current, start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      const v = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      ref.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.2, dur: 2.4 + Math.random() * 2, color: ['#2dcf92', '#ffd23f', '#ff7889', '#67cfff', '#ca9cff', '#fff'][i % 6], rot: Math.random() * 360,
  })), [count]);
  return <div className="confetti" aria-hidden="true">{pieces.map((p, i) => <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, transform: `rotate(${p.rot}deg)` }} />)}</div>;
}

function Game() {
  const [save, setSave] = useState<Save>(getSave);
  const stage: 'intro' | 'game' | 'end' = save.finished ? 'end' : save.started ? 'game' : 'intro';
  const [modal, setModal] = useState<number | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [near, setNear] = useState<NearInfo>(null);
  const [worldCard, setWorldCard] = useState<number | null>(null);
  const [warping, setWarping] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [audio, setAudio] = useState(getPrefs);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const lastGain = useRef<{ id: number; gain: number } | null>(null);
  const toastId = useRef(0);
  const victoryTimer = useRef<number | undefined>(undefined);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* armazenamento indisponível */ } }, [save]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts(t => [...t.slice(-3), { id, text, kind }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  }, []);

  const worldIdx = save.world;
  const world = worlds[worldIdx];
  const worldBugs = challenges.filter(c => c.world === worldIdx);
  const nextBug = worldBugs.find(c => !save.cleared.includes(c.id)) ?? null;
  const completed = save.cleared.length;
  const score = useAnimatedNumber(save.score);

  // ── cronômetro (relógio de parede, imune a variações do setInterval) ──
  const paused = stage === 'game' && save.paused;
  useEffect(() => {
    if (stage !== 'game' || paused) return;
    let last = performance.now(), acc = 0;
    const t = window.setInterval(() => {
      const now = performance.now();
      acc += now - last; last = now;
      if (acc < 1000) return;
      const secs = Math.floor(acc / 1000);
      acc -= secs * 1000;
      setSave(s => {
        if (s.finished) return s;
        const left = Math.max(0, s.seconds - secs);
        return left === 0 ? { ...s, seconds: 0, finished: true, outcome: s.cleared.length === TOTAL ? 'win' : 'timeout' } : { ...s, seconds: left };
      });
    }, 250);
    return () => window.clearInterval(t);
  }, [stage, paused]);

  const prevSeconds = useRef(save.seconds);
  useEffect(() => {
    const prev = prevSeconds.current, now = save.seconds;
    prevSeconds.current = now;
    if (stage !== 'game' || now >= prev) return;
    for (const [mark, msg] of [[1800, '⏱ Restam 30 minutos!'], [600, '⏱ Restam 10 minutos!'], [300, '⚠ Restam 5 minutos!'], [60, '⚠ ÚLTIMO MINUTO!']] as const)
      if (prev > mark && now <= mark) { toast(msg, 'bad'); sfx('locked'); }
    if (now <= 10 && now > 0) sfx('tick');
  }, [save.seconds, stage, toast]);

  // ── fim de jogo ──
  const prevStage = useRef(stage);
  useEffect(() => {
    if (prevStage.current === 'game' && stage === 'end') {
      setModal(null);
      stopMusic();
      sfx(save.outcome === 'win' ? 'victory' : 'gameover');
    }
    if (stage !== 'game') stopMusic();
    prevStage.current = stage;
  }, [stage, save.outcome]);

  // Recarregou a página com os 24 bugs resolvidos, mas antes de fechar o último terminal.
  useEffect(() => {
    if (stage === 'game' && save.cleared.length === TOTAL && modal === null && victoryTimer.current === undefined) finishWin(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function finishWin(delay: number) {
    victoryTimer.current = window.setTimeout(() => {
      setSave(s => {
        if (s.finished) return s;
        const bonus = Math.floor(s.seconds / 5);
        return { ...s, finished: true, outcome: 'win', bonus, score: s.score + bonus };
      });
      victoryTimer.current = undefined;
    }, delay);
  }

  // ── engine ──
  const events = useRef({
    onNear: (n: NearInfo) => setNear(n),
    onInteract: (id: number) => openChallenge(id),
    onLocked: (needed: number) => toast(`🔒 Resolva primeiro o BUG ${needed}`, 'bad'),
    onPortal: () => goNextWorld(),
    onCoin: () => setSave(s => ({ ...s, bytes: s.bytes + 1 })),
    onStomp: () => setSave(s => ({ ...s, stomps: s.stomps + 1 })),
    sfx,
  });

  useEffect(() => {
    if (stage !== 'game' || !canvas.current) return;
    const ev = events.current;
    const e = new Engine(canvas.current, {
      onNear: n => ev.onNear(n), onInteract: id => ev.onInteract(id), onLocked: n => ev.onLocked(n),
      onPortal: () => ev.onPortal(), onCoin: () => ev.onCoin(), onStomp: () => ev.onStomp(), sfx: s => ev.sfx(s),
    });
    e.load(saveRef.current.world, saveRef.current.cleared);
    engine.current = e;
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).__sqlquest = { engine: e, challenges };
    return () => { e.destroy(); engine.current = null; };
  }, [stage]);

  useEffect(() => {
    const e = engine.current;
    if (e && e.world !== save.world) e.load(save.world, save.cleared);
    if (stage === 'game' && !paused) startMusic(save.world); else stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.world, stage, paused]);

  useEffect(() => { engine.current?.setPaused(paused || modal !== null || worldCard !== null || warping || stage !== 'game'); }, [paused, modal, worldCard, warping, stage]);

  const pause = useCallback(() => {
    setSave(s => s.started && !s.finished && !s.paused ? { ...s, paused: true, pauses: s.pauses + 1 } : s);
    sfx('click');
  }, []);
  const resume = () => { unlockAudio(); setSave(s => ({ ...s, paused: false })); sfx('select'); };

  // pausa automática ao trocar de aba/minimizar
  useEffect(() => {
    const vis = () => { if (document.hidden && stageRef.current === 'game') pause(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause]);

  useEffect(() => {
    if (worldCard === null) return;
    const t = window.setTimeout(() => setWorldCard(null), 3200);
    return () => window.clearTimeout(t);
  }, [worldCard]);

  function openChallenge(id: number) {
    const s = saveRef.current;
    if (s.cleared.includes(id) || s.finished) return;
    setChoice(null); setFeedback(null); setModal(id);
    sfx('open');
  }

  function goNextWorld() {
    const s = saveRef.current;
    if (s.world >= worlds.length - 1) return;
    setWarping(true);
    window.setTimeout(() => {
      setSave(x => ({ ...x, world: Math.min(worlds.length - 1, x.world + 1) }));
      setWarping(false);
      setWorldCard(s.world + 1);
      sfx('world');
    }, 900);
  }

  const start = () => {
    unlockAudio();
    sfx('world');
    setSave(s => ({ ...s, started: true, finished: false, paused: false, name: s.name.trim() || 'JOGADOR(A) BYTE' }));
    setWorldCard(save.world);
  };

  const reset = () => {
    if (!window.confirm('Apagar progresso e reiniciar a missão?')) return;
    window.clearTimeout(victoryTimer.current);
    victoryTimer.current = undefined;
    setModal(null); setNear(null); setWorldCard(null); setWarping(false);
    stopMusic();
    setSave(makeInitial());
  };

  // ── terminal ──
  const current = modal !== null ? challenges.find(c => c.id === modal)! : null;
  const order = current ? optionOrder(save.seed, current.id, current.options.length) : [];
  const solved = current ? save.cleared.includes(current.id) : false;
  const hintOn = current ? save.hintsUsed.includes(current.id) : false;
  const wrongHere = current ? save.wrong[current.id] ?? 0 : 0;

  const select = (displayIdx: number) => {
    if (!current || solved || displayIdx >= order.length) return;
    setChoice(order[displayIdx]); setFeedback(null); sfx('select');
  };

  const solve = () => {
    if (!current || choice === null || solved) return;
    if (choice === current.correct) {
      const gain = hintOn ? hintXpFor(current) : xpFor(current);
      lastGain.current = { id: current.id, gain };
      setSave(s => s.cleared.includes(current.id) ? s : { ...s, cleared: [...s.cleared, current.id], score: s.score + gain });
      setFeedback({ ok: true, text: `✓ ${current.impact} — +${gain} XP. ${current.explanation}` });
      sfx('correct');
    } else {
      const pen = errorPenaltyFor(current);
      setSave(s => ({ ...s, errors: s.errors + 1, score: Math.max(0, s.score - pen), wrong: { ...s.wrong, [current.id]: (s.wrong[current.id] ?? 0) + 1 } }));
      setFeedback({ ok: false, text: `✕ Correção rejeitada! O incidente continua ativo. Reanalise o código e tente outra alternativa. −${pen} XP.` });
      setShakeKey(k => k + 1);
      sfx('wrong');
    }
  };

  const showHint = () => {
    if (!current || hintOn || solved) return;
    setSave(s => s.hintsUsed.includes(current.id) ? s : { ...s, hints: s.hints + 1, hintsUsed: [...s.hintsUsed, current.id] });
    sfx('hint');
  };

  const close = () => {
    if (!current) return;
    const wasSolved = save.cleared.includes(current.id);
    setModal(null); setFeedback(null); setChoice(null);
    if (!wasSolved) { sfx('click'); return; }
    const e = engine.current;
    e?.setSolved(save.cleared);
    if (lastGain.current?.id === current.id) e?.celebrate(current.id, `+${lastGain.current.gain} XP`);
    if (current.boss) toast(`☠ ${worlds[current.world].boss} DERROTADO!`, 'good');
    else toast(`✓ ${current.impact}`, 'good');
    if (save.cleared.length === TOTAL) finishWin(1800);
    else if (worldBugs.every(c => save.cleared.includes(c.id))) window.setTimeout(() => toast('🌀 O portal se abriu! Siga para a direita →', 'info'), 900);
  };

  // ── teclado ──
  const handlers = useRef({ select, solve, close, showHint, pause, resume, dismissCard: () => setWorldCard(null) });
  handlers.current = { select, solve, close, showHint, pause, resume, dismissCard: () => setWorldCard(null) };
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const modalRef = useRef(modal); modalRef.current = modal;
  const cardRef = useRef(worldCard); cardRef.current = worldCard;
  const stageRef = useRef(stage); stageRef.current = stage;
  const solvedRef = useRef(solved); solvedRef.current = solved;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const h = handlers.current;
      if (stageRef.current === 'game' && pausedRef.current) {
        if (['Enter', 'Space', 'KeyP', 'Escape'].includes(e.code) && !e.repeat) { e.preventDefault(); h.resume(); }
        return;
      }
      if (stageRef.current === 'game' && e.code === 'KeyP' && !e.repeat) { e.preventDefault(); h.pause(); return; }
      if (modalRef.current !== null) {
        if (e.repeat && e.key !== 'Enter') return;
        const letter = LETTERS.indexOf(e.key.toUpperCase());
        const digit = '12345'.indexOf(e.key);
        if (letter >= 0 && e.key.length === 1) { h.select(letter); e.preventDefault(); }
        else if (digit >= 0) { h.select(digit); e.preventDefault(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (solvedRef.current) h.close(); else h.solve(); }
        else if (e.key === 'Escape') h.close();
        return;
      }
      if (stageRef.current !== 'game') return;
      if (tg && tg.tagName === 'BUTTON') tg.blur();
      if (cardRef.current !== null) { if (['Enter', 'Space', 'KeyE', 'Escape'].includes(e.code)) { e.preventDefault(); h.dismissCard(); } return; }
      if (e.code === 'Escape') { h.pause(); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyE', 'Enter'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyE' || e.code === 'Enter') { if (!e.repeat) engine.current?.interact(); return; }
      engine.current?.keyDown(e.code, e.repeat);
    };
    const up = (e: KeyboardEvent) => engine.current?.keyUp(e.code);
    const blur = () => engine.current?.clearKeys();
    const gesture = () => { unlockAudio(); if (stageRef.current === 'game' && !pausedRef.current) startMusic(saveRef.current.world); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', gesture); window.removeEventListener('keydown', gesture);
    };
  }, []);

  const press = (code: string, down: boolean) => { const e = engine.current; if (!e) return; if (down) e.keyDown(code); else e.keyUp(code); };
  const touchBtn = (code: string, label: string) => (
    <button onPointerDown={ev => { ev.preventDefault(); press(code, true); }} onPointerUp={() => press(code, false)} onPointerLeave={() => press(code, false)} onPointerCancel={() => press(code, false)} onContextMenu={ev => ev.preventDefault()}>{label}</button>
  );

  const toggleSfx = () => { unlockAudio(); const v = !audio.sfx; setSfx(v); setAudio(a => ({ ...a, sfx: v })); };
  const toggleMusic = () => { unlockAudio(); const v = !audio.music; setMusic(v); setAudio(a => ({ ...a, music: v })); if (v && stage === 'game' && !paused) startMusic(save.world); };

  const win = save.outcome === 'win';

  return <main className="app">
    <header className="top">
      <div className="brand"><span className="pixel">▣</span><div><strong>SQL QUEST</strong><small>A MALDIÇÃO DOS BUGS</small></div></div>
      <div className="hud">
        <span title="Bugs resolvidos">💾 {completed}/{TOTAL}</span>
        <span title="Pontuação" className="xp">⚡ {score} XP</span>
        <span title="Tempo restante" className={save.seconds < 600 && stage === 'game' ? 'danger' : ''}>⏱ {fmt(save.seconds)}</span>
        <span title="Bytes coletados">🪙 {save.bytes}</span>
      </div>
      <div className="headerActions">
        <button onClick={toggleSfx} title="Efeitos sonoros" aria-pressed={audio.sfx}>{audio.sfx ? '🔊' : '🔇'}</button>
        <button onClick={toggleMusic} title="Música" aria-pressed={audio.music} className={audio.music ? '' : 'off'}>🎵</button>
        {stage === 'game' && <button onClick={pause} title="Pausar (P)" className="pauseBtn">⏸ PAUSA</button>}
        <button onClick={reset}>REINICIAR</button>
      </div>
    </header>

    {stage === 'intro' && <section className="intro panel">
      <div className="eyebrow">[ SOFTWARE ARCADE • 1995 ]</div>
      <h1 className="glitch" data-text="SQL QUEST">SQL QUEST</h1>
      <h2>A MALDIÇÃO DOS BUGS</h2>
      <p>Dr. Null espalhou <b>{TOTAL} bugs críticos</b> por <b>seis mundos</b>. Atravesse plataformas 2D, esmague bugs, encontre os terminais infectados e salve o comércio do Reino Digital resolvendo incidentes de PostgreSQL — cada bug mais difícil que o anterior.</p>
      <div className="features"><span>🎮 6 mundos</span><span>💻 {TOTAL} incidentes SQL</span><span>⏱ 2 horas</span><span>☠ 6 chefes</span><span>💡 Pistas com custo</span></div>
      <div className="ladder">{worlds.map((w, i) => <div key={i} style={{ ['--c' as string]: w.color, animationDelay: `${i * 0.08}s` }}><b>{i + 1}</b><span>{w.short}</span><small>{w.level}</small><em>{'★'.repeat(i + 1)}</em></div>)}</div>
      <label>SEU NOME<input maxLength={28} placeholder="Ex.: Ana Souza" autoComplete="name" value={save.name} onChange={e => setSave(s => ({ ...s, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); start(); } }} /></label>
      <button className="primary huge pulse" onClick={start}>▶ INICIAR MISSÃO</button>
      <small>CONTROLES: A/D ou ←/→ mover • ESPAÇO/W/↑ pular (segure para pular mais alto) • E interagir • P pausar • No terminal: A–E escolhe, ENTER confirma, ESC sai</small>
    </section>}

    {stage === 'end' && <section className={'intro panel end ' + (win ? 'win' : 'lose')}>
      {win && <Confetti />}
      <span className="eyebrow">RELATÓRIO DE MISSÃO</span>
      <h1>{win ? 'VITÓRIA!' : 'TEMPO ESGOTADO'}</h1>
      <h2>{win ? 'DR. NULL FOI DERROTADO' : 'O REINO PRECISA DE REFORÇOS'}</h2>
      <div className="rank">PATENTE: <b>{rankFor(save.score, win)}</b></div>
      <div className="results">
        <div><strong>{completed}/{TOTAL}</strong><small>BUGS RESOLVIDOS</small></div>
        <div><strong>{save.score}</strong><small>XP TOTAL</small></div>
        <div><strong>{save.errors}</strong><small>TENTATIVAS INCORRETAS</small></div>
        <div><strong>{save.hints}</strong><small>PISTAS USADAS</small></div>
        <div><strong>{fmt(save.seconds)}</strong><small>TEMPO RESTANTE</small></div>
        <div><strong>+{save.bonus}</strong><small>BÔNUS DE TEMPO</small></div>
        <div><strong>{save.bytes}</strong><small>BYTES COLETADOS</small></div>
        <div><strong>{save.stomps}</strong><small>BUGS ESMAGADOS</small></div>
        <div><strong>{save.pauses}</strong><small>PAUSAS</small></div>
      </div>
      <div className="worldsDone">{worlds.map((w, i) => { const n = challenges.filter(c => c.world === i && save.cleared.includes(c.id)).length; return <span key={i} style={{ ['--c' as string]: w.color }} className={n === BUGS_PER_WORLD ? 'ok' : ''}>{w.short} {n}/{BUGS_PER_WORLD}</span>; })}</div>
      <p>Jogador(a): <b>{save.name}</b></p>
      <button className="primary" onClick={reset}>↻ JOGAR NOVAMENTE</button>
      <button onClick={() => window.print()}>🖨 IMPRIMIR RESULTADO</button>
    </section>}

    {stage === 'game' && <>
      <section className="worldbar" style={{ ['--c' as string]: world.color }} key={worldIdx}>
        <div><small>MUNDO {worldIdx + 1}/{worlds.length} • {world.short} • DIFICULDADE {world.level} {'★'.repeat(worldIdx + 1)}</small><h2>{world.name}</h2><p>{world.story}</p></div>
        <div className="boss"><span>☠ CHEFE</span><b>{world.boss}</b><small className={worldBugs.every(c => save.cleared.includes(c.id)) ? 'ok' : ''}>{worldBugs.every(c => save.cleared.includes(c.id)) ? 'DERROTADO' : 'SISTEMA COMPROMETIDO'}</small></div>
      </section>
      <div className={'gamewrap' + (warping ? ' warping' : '')}>
        <canvas ref={canvas} width={VIEW_W} height={VIEW_H} aria-label="Jogo de plataforma 2D. Use as setas para mover, espaço para pular e E para interagir." />
        {worldCard !== null && <div className="worldCard" style={{ ['--c' as string]: worlds[worldCard].color }} onClick={() => setWorldCard(null)}>
          <small>MUNDO {worldCard + 1} DE {worlds.length}</small>
          <h2>{worlds[worldCard].name}</h2>
          <div className="stars">{'★'.repeat(worldCard + 1)}<span>{'★'.repeat(worlds.length - worldCard - 1)}</span></div>
          <p>DIFICULDADE: <b>{worlds[worldCard].level}</b> · CHEFE: <b>{worlds[worldCard].boss}</b></p>
          <p className="topics">{worlds[worldCard].topics}</p>
          <em>clique ou pressione ENTER</em>
        </div>}
        {warping && <div className="warp" />}
        <div className="gamefoot"><span>◀ ▶ ANDAR</span><span>↑ / ESPAÇO PULAR</span><span>E INVESTIGAR</span><span>P PAUSAR</span><span>PULE NOS BUGS PARA ESMAGÁ-LOS</span></div>
      </div>
      <div className="below">
        <div>{nextBug
          ? <><b>PRÓXIMO ALVO:</b> {nextBug.boss ? '☠ ' : ''}BUG {nextBug.id} — {nextBug.title} <span className="tag">{xpFor(nextBug)} XP</span></>
          : <><b>MUNDO LIMPO!</b> {worldIdx < worlds.length - 1 ? 'Siga até o portal no fim da fase →' : 'Dr. Null foi derrotado!'}</>}</div>
        {near && !near.locked && <button className="primary pulse" onClick={() => engine.current?.interact()}>💻 INVESTIGAR BUG {near.id}</button>}
        {near && near.locked && <span className="lockedMsg">🔒 Resolva primeiro o BUG {near.needed}</span>}
      </div>
      <div className="touch">
        {touchBtn('ArrowLeft', '◀')}{touchBtn('ArrowRight', '▶')}{touchBtn('Space', '▲ PULAR')}
        <button onClick={() => engine.current?.interact()} disabled={!near}>E</button>
      </div>
      <div className="progress">{worlds.map((w, wi) => <div key={wi} className={'pgroup' + (wi === worldIdx ? ' current' : '')} style={{ ['--c' as string]: w.color }}>
        <small>{w.short}</small>
        <div>{challenges.filter(c => c.world === wi).map(ch => <span key={ch.id} className={save.cleared.includes(ch.id) ? 'done' : ch === nextBug ? 'active' : ''} title={wi <= worldIdx ? ch.title : '???'}>{ch.boss ? '☠' : ch.id}</span>)}</div>
      </div>)}</div>
    </>}

    {current && <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="term-title">
      <div className={'terminal panel' + (solved ? ' solved' : '')} key={shakeKey} data-shake={shakeKey > 0 && feedback && !feedback.ok ? '1' : '0'} style={{ ['--c' as string]: worlds[current.world].color }}>
        {solved && <Confetti count={40} />}
        <div className="terminalHeader">
          <span>▣ TERMINAL #{String(current.id).padStart(2, '0')} • {current.kind.toUpperCase()} • {worlds[current.world].level}{current.boss ? ' • ☠ CHEFE' : ''}</span>
          <span className={solved ? 'okTxt' : 'blink'}>{solved ? '● INCIDENTE RESOLVIDO' : '● INCIDENTE ATIVO'}</span>
        </div>
        <div className="terminalBody">
          <div className="titleRow"><h2 id="term-title">{current.title}</h2><span className="reward">{hintOn ? <><s>{xpFor(current)}</s> {hintXpFor(current)}</> : xpFor(current)} XP · erro −{errorPenaltyFor(current)}</span></div>
          <p><b>📟 ALERTA:</b> {current.report}</p>
          <div className="codeLabel">EVIDÊNCIA SQL — SISTEMA COMPROMETIDO</div>
          <pre><code>{current.code}</code></pre>
          <h3>{current.question}</h3>
          <div className="options">{order.map((oi, di) => <button disabled={solved} key={oi}
            className={(choice === oi ? 'selected ' : '') + (solved && oi === current.correct ? 'right' : '')}
            onClick={() => select(di)}><span>{LETTERS[di]}</span>{current.options[oi]}</button>)}</div>
          {hintOn && <div className="hint">💡 PISTA: {current.hint}</div>}
          {!hintOn && !solved && wrongHere >= 2 && <div className="nudge">🤔 Travou? Descreva a anomalia com suas palavras e releia o código — ou peça uma pista.</div>}
          {feedback && <div className={'feedback ' + (feedback.ok ? 'ok' : 'bad')}>{feedback.text}</div>}
          <div className="terminalActions">
            <div>
              {!solved && <button onClick={close}>✕ SAIR</button>}
              <button onClick={showHint} disabled={hintOn || solved}>💡 {hintOn ? 'PISTA REVELADA' : `PEDIR PISTA (−${xpFor(current) - hintXpFor(current)} XP)`}</button>
            </div>
            <button className="primary" onClick={solved ? close : solve} disabled={!solved && choice === null}>{solved ? 'CONTINUAR ▶' : '⚔ CORRIGIR BUG'}</button>
          </div>
        </div>
      </div>
    </div>}

    {paused && <div className="overlay pauseOverlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="pausePanel panel">
        <span className="eyebrow">{save.pauses > 0 ? 'JOGO PAUSADO' : 'MISSÃO SALVA'}</span>
        <h2 id="pause-title">⏸ {save.pauses > 0 ? 'PAUSA' : 'BEM-VINDO DE VOLTA'}</h2>
        <p><b>{save.name}</b> · Mundo {worldIdx + 1} ({world.short}) · {completed}/{TOTAL} bugs · {save.score} XP</p>
        <div className="pauseTime">⏱ {fmt(save.seconds)} <small>CRONÔMETRO PARADO</small></div>
        <p className="muted">O progresso fica salvo neste navegador. Você pode fechar a aba e continuar depois, no mesmo computador.</p>
        <button className="primary huge pulse" onClick={resume}>▶ CONTINUAR MISSÃO</button>
        <div className="pauseRow">
          <button onClick={toggleSfx}>{audio.sfx ? '🔊 SONS: SIM' : '🔇 SONS: NÃO'}</button>
          <button onClick={toggleMusic}>{audio.music ? '🎵 MÚSICA: SIM' : '🎵 MÚSICA: NÃO'}</button>
          <button onClick={reset}>↻ REINICIAR</button>
        </div>
        <small className="muted">ENTER, P ou ESC para continuar</small>
      </div>
    </div>}

    <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}</div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Game /></StrictMode>);
