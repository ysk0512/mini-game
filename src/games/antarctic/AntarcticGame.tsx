import { useEffect, useRef, useState } from 'react';
import { useGameLoop } from '../../shared/useGameLoop';
import { useHiDpiCanvas } from '../../shared/useHiDpiCanvas';
import { useHighScore } from '../../shared/useHighScore';
import { MuteButton, toggleMuted } from '../../shared/MuteButton';
import { melody, playSound, unlockAudio } from '../../shared/sound';
import { COURSES, createGame, nextCourse, update, type Game, type GameEvent } from './game/engine';
import { draw, HEIGHT, WIDTH } from './game/render';
import './antarctic.css';

export const ANTARCTIC_HIGHSCORE_KEY = 'antarctic-highscore';
const snapshot = (g: Game) => ({
  status: g.status, stage: g.stage, score: g.score, lives: g.lives,
  time: Math.ceil(g.time), distance: Math.floor(g.distance / 10) * 10,
  fish: g.fish, bonus: g.bonus, message: g.message,
});

function sound(event: GameEvent) {
  if (event === 'jump') playSound({ tones: [{ type: 'square', from: 280, to: 680, duration: 0.16, volume: 0.035 }] });
  if (event === 'fish' || event === 'flag') playSound({ tones: melody('square', event === 'fish' ? [784, 1047] : [659, 880, 1175], 0.07, 0.04) });
  if (event === 'hit') playSound({ tones: [{ type: 'triangle', from: 240, to: 70, duration: 0.35, volume: 0.15 }], noise: [{ duration: 0.2, volume: 0.06 }] });
  if (event === 'clear') playSound({ tones: melody('square', [523, 659, 784, 1047, 784, 1047], 0.13, 0.045) });
  if (event === 'gameOver') playSound({ tones: melody('triangle', [392, 330, 262, 196], 0.2, 0.12) });
}

export default function AntarcticGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 560px)').matches);
  const canvasHeight = compact ? 760 : HEIGHT;
  useHiDpiCanvas(canvas, WIDTH, canvasHeight);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 560px)');
    const resize = () => setCompact(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  const [initial] = useState(createGame);
  const game = useRef(initial);
  const [hud, setHud] = useState(() => snapshot(initial));
  const previousHud = useRef(JSON.stringify(hud));
  const keys = useRef(new Set<string>());
  const jump = useRef(false);
  const [highScore, submitScore] = useHighScore(ANTARCTIC_HIGHSCORE_KEY);
  const record = useRef(false);
  const sync = () => {
    const next = snapshot(game.current);
    const serialized = JSON.stringify(next);
    if (serialized !== previousHud.current) {
      previousHud.current = serialized;
      setHud(next);
    }
  };
  const action = () => {
    unlockAudio();
    const g = game.current;
    keys.current.clear();
    jump.current = false;
    if (g.status === 'clear') nextCourse(g);
    else if (g.status === 'gameOver' || g.status === 'victory') {
      game.current = createGame();
      game.current.status = 'playing';
      record.current = false;
    } else if (g.status === 'ready' || g.status === 'paused') g.status = 'playing';
    sync();
  };
  const pause = () => {
    const g = game.current;
    if (g.status === 'playing') g.status = 'paused';
    else if (g.status === 'paused') g.status = 'playing';
    keys.current.clear();
    jump.current = false;
    sync();
  };
  const doJump = () => {
    unlockAudio();
    if (game.current.status === 'playing') jump.current = true;
    else action();
  };
  const handlers = useRef({ action, pause, doJump, sync });
  useEffect(() => { handlers.current = { action, pause, doJump, sync }; });
  useEffect(() => {
    const directions = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('button, a, input, textarea, select')) return;
      if (directions.includes(event.code)) {
        keys.current.add(event.code);
      } else if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) {
        if (!event.repeat) handlers.current.doJump();
      } else if (event.code === 'Enter') {
        if (!event.repeat) handlers.current.action();
      } else if (event.code === 'Escape' || event.code === 'KeyP') {
        if (!event.repeat) handlers.current.pause();
      } else if (event.code === 'KeyM') {
        if (!event.repeat) toggleMuted();
      } else return;
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => { keys.current.delete(event.code); };
    const blur = () => {
      keys.current.clear();
      jump.current = false;
      if (game.current.status === 'playing') {
        game.current.status = 'paused';
        handlers.current.sync();
      }
    };
    const hidden = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  useGameLoop(dt => {
    const g = game.current;
    const events = update(g, dt, {
      left: keys.current.has('ArrowLeft') || keys.current.has('KeyA') || keys.current.has('touch-left'),
      right: keys.current.has('ArrowRight') || keys.current.has('KeyD') || keys.current.has('touch-right'),
      jump: jump.current,
    });
    jump.current = false;
    events.forEach(sound);
    if (events.some(e => e === 'fish' || e === 'flag' || e === 'clear' || e === 'gameOver')) {
      record.current = submitScore(g.score) || record.current;
    }
    sync();
    const ctx = canvas.current?.getContext('2d');
    if (ctx) draw(ctx, g, canvasHeight);
  });

  const course = COURSES[hud.stage];
  const title = hud.status === 'ready' ? '작은 펭귄의 큰 모험'
    : hud.status === 'paused' ? '잠깐, 쉬어 가요'
    : hud.status === 'clear' ? `${course.name} 도착!`
    : hud.status === 'victory' ? '남극 일주 성공!'
    : '다시 떠나 볼까요?';
  const isResult = hud.status === 'gameOver' || hud.status === 'victory';
  return (
    <div className="game-page antarctic-page">
      <header className="antarctic-heading">
        <div><p className="antarctic-eyebrow">A LITTLE POLAR ADVENTURE</p><h1>남극탐험 <span>ANTARCTIC</span></h1></div>
        <span className="antarctic-edition">ARCADE / 05</span>
      </header>
      <div className="board antarctic-board">
        <div className="antarctic-hud">
          <div><span>점수</span><strong>{String(hud.score).padStart(6, '0')}</strong></div>
          <div><span>최고 기록</span><strong>{String(Math.max(highScore, hud.score)).padStart(6, '0')}</strong></div>
          <div className={hud.time <= 10 ? 'antarctic-urgent' : ''}><span>남은 시간</span><strong>{hud.time}<small> 초</small></strong></div>
          <div><span>남은 기회</span><strong className="antarctic-hearts" aria-label={`생명 ${hud.lives}개`}>{'♥'.repeat(hud.lives)}<i>{'♡'.repeat(3 - hud.lives)}</i></strong></div>
          <div className="antarctic-tools">
            <MuteButton />
            <button type="button" aria-label={hud.status === 'paused' ? '계속하기' : '일시정지'} disabled={!['playing', 'paused'].includes(hud.status)} onClick={e => { pause(); e.currentTarget.blur(); }}>{hud.status === 'paused' ? '▶' : 'Ⅱ'}</button>
          </div>
        </div>
        <div className="stage antarctic-stage">
          <canvas ref={canvas} className="game-canvas antarctic-canvas" aria-label="남극탐험 게임 화면. 좌우 방향키로 이동하고 스페이스 키로 점프하세요." onPointerDown={e => { e.preventDefault(); doJump(); }} />
          {hud.status !== 'playing' && (
            <div className="antarctic-overlay">
              <div className="antarctic-dialog" role="dialog" aria-label={title}>
                <p className="antarctic-eyebrow">{hud.status === 'ready' ? 'READY FOR AN EXPEDITION?' : hud.status === 'clear' || hud.status === 'victory' ? 'EXPEDITION COMPLETE' : 'TAKE A BREATH'}</p>
                <h2>{title}</h2>
                {hud.status === 'ready' && <><p>얼음길을 달려 네 개의 기지에 도착하세요.<br />구멍과 물개는 피하고, 물고기는 냠냠!</p><div className="antarctic-instructions"><span><kbd>←</kbd> <kbd>→</kbd> 이동</span><span><kbd>SPACE</kbd> 점프</span></div></>}
                {hud.status === 'paused' && <p>준비되면 다시 출발해요.<br />P 또는 Esc 키로 계속할 수 있어요.</p>}
                {hud.status === 'clear' && <p>남은 시간 보너스 <b>+{hud.bonus}</b><br />다음 목적지 · {COURSES[hud.stage + 1].name}</p>}
                {isResult && <><p>{hud.status === 'victory' ? '모든 기지에 발자국을 남겼어요.' : hud.message}<br />물고기 {hud.fish}마리 · 점수 <b>{hud.score.toLocaleString()}</b></p>{record.current && <span className="antarctic-record">NEW BEST · 최고 기록 달성!</span>}</>}
                <button className="antarctic-start" type="button" onClick={e => { action(); e.currentTarget.blur(); }}>{hud.status === 'ready' ? '탐험 시작' : hud.status === 'paused' ? '계속 달리기' : hud.status === 'clear' ? '다음 기지로' : '다시 탐험하기'} <span>→</span></button>
                {hud.status === 'ready' && <small>ENTER 또는 SPACE로 시작</small>}
              </div>
            </div>
          )}
        </div>
        <div className="antarctic-route">
          <div className="antarctic-route-track"><span style={{ width: `${(hud.stage + hud.distance / course.length) / COURSES.length * 100}%` }} /></div>
          <ol>{COURSES.map((c, i) => <li key={c.name} className={i === hud.stage ? 'current' : i < hud.stage ? 'complete' : ''}><span>{i < hud.stage ? '✓' : `0${i + 1}`}</span>{c.name}</li>)}</ol>
        </div>
      </div>
      <div className="antarctic-bottom"><p>물고기 <b>+100</b> <span>·</span> 깃발 <b>+250 & 2초</b></p><p>코스 {hud.stage + 1}/4 <span>·</span> {course.subtitle}</p></div>
      <div className="antarctic-controls" aria-label="터치 조작">
        {(['left', 'right'] as const).map(direction => <button key={direction} type="button" aria-label={direction === 'left' ? '왼쪽 이동' : '오른쪽 이동'} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(`touch-${direction}`); }} onPointerUp={() => keys.current.delete(`touch-${direction}`)} onPointerCancel={() => keys.current.delete(`touch-${direction}`)} onLostPointerCapture={() => keys.current.delete(`touch-${direction}`)}>{direction === 'left' ? '←' : '→'}</button>)}
        <button type="button" className="antarctic-jump" onPointerDown={e => { e.preventDefault(); doJump(); }} onClick={e => { if (e.detail === 0) doJump(); }}>점프 <span>↑</span></button>
      </div>
      <p className="help antarctic-help">← → / A D 이동 · Space / ↑ 점프 · P / Esc 일시정지 · M 소리</p>
    </div>
  );
}
