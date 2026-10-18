import { Component, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MuteButton, toggleMuted } from '../../shared/MuteButton';
import { useHighScore } from '../../shared/useHighScore';
import { melody, playSound, unlockAudio } from '../../shared/sound';
import { COURSES } from './game/courses';
import { createMarble, formatTime, MARBLE_HIGHSCORE_KEY, togglePause, type MarbleEvent, type MarbleGame as GameState, type MarbleInput } from './game/engine';
import { readRecords, saveRecord } from './records';
import { MarbleScene } from './scene/MarbleScene';
import './marble.css';

const snapshot = (g: GameState) => ({
  phase: g.phase, time: Math.floor(g.time * 10) / 10, score: g.score, falls: g.falls,
  gems: g.collected.size, checkpoint: g.checkpoint, stars: g.stars, bonus: g.bonus,
  notice: g.noticeTime > 0 ? g.notice : '',
});
function playEvent(event: MarbleEvent) {
  if (event === 'gem') playSound({ tones: melody('sine', [880, 1320, 1760], 0.055, 0.07) });
  if (event === 'checkpoint') playSound({ tones: melody('triangle', [523, 659, 784], 0.1, 0.07) });
  if (event === 'fall') playSound({ tones: [{ type: 'sine', from: 350, to: 90, duration: 0.45, volume: 0.08 }] });
  if (event === 'spring') playSound({ tones: [{ type: 'triangle', from: 260, to: 900, duration: 0.25, volume: 0.06 }] });
  if (event === 'clear') playSound({ tones: melody('triangle', [523, 659, 784, 1047, 988, 1047], 0.14, 0.09) });
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="marble-unavailable" role="alert"><h2>3D 화면을 열지 못했어요</h2><p>브라우저의 그래픽 가속을 켠 뒤 새로고침해 주세요.</p></div> : this.props.children;
  }
}

export default function MarbleGame() {
  const [run, setRun] = useState({ stage: 0, score: 0, id: 0 });
  const change = (stage: number, score = 0) => setRun(current => ({ stage, score, id: current.id + 1 }));
  return <MarbleSession key={run.id} stage={run.stage} initialScore={run.score} onSelect={change} />;
}

function MarbleSession({ stage, initialScore, onSelect }: { stage: number; initialScore: number; onSelect: (stage: number, score?: number) => void }) {
  const [game] = useState(() => createMarble(stage, initialScore));
  const [hud, setHud] = useState(() => snapshot(game));
  const lastHud = useRef(JSON.stringify(hud));
  const [loaded, setLoaded] = useState(false);
  const [overview, setOverview] = useState(false);
  const [records, setRecords] = useState(readRecords);
  const [highScore, submitScore] = useHighScore(MARBLE_HIGHSCORE_KEY);
  const keys = useRef(new Set<string>());
  const jumpQueued = useRef(false);
  const course = COURSES[stage];
  const sync = useCallback(() => {
    const next = snapshot(game);
    const serialized = JSON.stringify(next);
    if (serialized !== lastHud.current) { lastHud.current = serialized; setHud(next); }
  }, [game]);
  const clearInput = useCallback(() => { keys.current.clear(); jumpQueued.current = false; }, []);
  const onReady = useCallback(() => setLoaded(true), []);
  const onEvents = useCallback((events: MarbleEvent[]) => {
    events.forEach(playEvent);
    if (events.includes('gem') || events.includes('clear')) submitScore(game.score);
    if (events.includes('clear')) {
      setRecords(saveRecord(game.stage, game.time, game.stars));
      clearInput();
    }
    sync();
  }, [clearInput, game, submitScore, sync]);
  const readInput = useCallback((): MarbleInput => {
    const held = (...codes: string[]) => codes.some(code => keys.current.has(code));
    const input = {
      x: Number(held('ArrowRight', 'KeyD', 'right')) - Number(held('ArrowLeft', 'KeyA', 'left')),
      y: Number(held('ArrowDown', 'KeyS', 'down')) - Number(held('ArrowUp', 'KeyW', 'up')),
      brake: held('ShiftLeft', 'ShiftRight', 'brake'), jump: jumpQueued.current,
    };
    jumpQueued.current = false;
    return input;
  }, []);
  const action = () => {
    if (!loaded) return;
    unlockAudio();
    clearInput();
    if (game.phase === 'ready') game.phase = 'playing';
    else if (game.phase === 'paused') togglePause(game);
    else if (game.phase === 'clear') onSelect(stage + 1, game.score);
    else if (game.phase === 'victory') onSelect(0);
    sync();
  };
  const pause = () => { togglePause(game); clearInput(); sync(); };
  const doJump = () => {
    unlockAudio();
    if (game.phase === 'playing') jumpQueued.current = true;
    else if (game.phase === 'ready') action();
  };
  const handlers = useRef({ action, pause, doJump, restart: () => onSelect(stage, initialScore) });
  useEffect(() => { handlers.current = { action, pause, doJump, restart: () => onSelect(stage, initialScore) }; });
  useEffect(() => {
    const movement = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight']);
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        if (event.target.closest('input, textarea, select')) return;
        if (event.target.closest('button, a') && ['Enter', 'Space'].includes(event.code)) return;
      }
      if (movement.has(event.code)) keys.current.add(event.code);
      else if (event.code === 'Space') { if (!event.repeat) handlers.current.doJump(); }
      else if (event.code === 'Enter') { if (!event.repeat) handlers.current.action(); }
      else if (event.code === 'KeyP' || event.code === 'Escape') { if (!event.repeat) handlers.current.pause(); }
      else if (event.code === 'KeyR') { if (!event.repeat) handlers.current.restart(); }
      else if (event.code === 'KeyM') { if (!event.repeat) toggleMuted(); }
      else return;
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const blur = () => {
      clearInput();
      if (game.phase === 'playing' || game.phase === 'falling') { togglePause(game); sync(); }
    };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
    };
  }, [clearInput, game, sync]);

  const playing = hud.phase === 'playing' || hud.phase === 'falling';
  const finished = hud.phase === 'clear' || hud.phase === 'victory';
  const title = hud.phase === 'ready' ? '작은 구슬, 커다란 모험'
    : hud.phase === 'paused' ? '잠깐 쉬어 가요'
    : hud.phase === 'victory' ? '마지막 미로 클리어!'
    : '멋지게 골인!';
  return <div className="game-page marble-page" style={{ '--marble-accent': course.color } as CSSProperties}>
    <header className="marble-heading">
      <div><p className="marble-eyebrow">LITTLE WORLDS / BIG ADVENTURES</p><h1>구슬 미로 <span>MARBLE LAB</span></h1><p className="marble-subtitle">조금씩 굴려, 끝까지.</p></div>
      <div className="marble-best"><span>PERSONAL BEST</span><strong>{Math.max(highScore, hud.score).toLocaleString()} <small>pts</small></strong></div>
    </header>
    <div className="marble-shell">
      <div className="marble-hud">
        <div className="marble-course-label"><span className="marble-number">0{stage + 1}</span><div><span>현재 코스</span><strong>{course.name}</strong></div></div>
        <div><span>보석</span><strong className="marble-gems">◆ {hud.gems}<small> / {course.gems.length}</small></strong></div>
        <div><span>시간</span><strong>{formatTime(hud.time)}<small>.{Math.floor(hud.time * 10) % 10}</small></strong></div>
        <div className="marble-falls"><span>떨어짐</span><strong>{hud.falls}<small> 회</small></strong></div>
        <div className="marble-toolbar"><MuteButton /><button type="button" aria-label="코스 다시 시작" title="코스 다시 시작 (R)" onClick={() => onSelect(stage, initialScore)}>↻</button><button type="button" aria-label={hud.phase === 'paused' ? '계속하기' : '일시정지'} disabled={!playing && hud.phase !== 'paused'} onClick={e => { pause(); e.currentTarget.blur(); }}>{hud.phase === 'paused' ? '▶' : 'Ⅱ'}</button></div>
      </div>
      <div className="marble-stage" aria-label="3D 구슬 미로 게임 화면">
        <SceneBoundary><MarbleScene game={game} paused={!playing} overview={overview} readInput={readInput} onEvents={onEvents} onTick={sync} onReady={onReady} /></SceneBoundary>
        <div className="marble-scene-label"><span>THE FLOATING COLLECTION</span><strong>{course.english}</strong></div>
        <div className="marble-score">SCORE <strong>{String(hud.score).padStart(5, '0')}</strong></div>
        {playing && <div className="marble-in-scene-help"><span className="marble-ball-dot" /> 분홍 구슬을 조종하세요 <span>·</span> 화면 기준 이동</div>}
        {playing && <button type="button" className="marble-camera" aria-pressed={overview} onClick={e => { setOverview(value => !value); e.currentTarget.blur(); }}>{overview ? '구슬 따라가기' : '전체 미로 보기'} ⤢</button>}
        {playing && hud.notice && <div className="marble-notice" role="status">{hud.notice}</div>}
        {!playing && <div className="marble-overlay">
          <div className="marble-dialog" role="dialog" aria-label={title}>
            <p className="marble-eyebrow">{finished ? 'BEAUTIFULLY DONE' : hud.phase === 'paused' ? 'TAKE YOUR TIME' : 'ROLL INTO A LITTLE WORLD'}</p>
            {finished ? <div className="marble-stars" aria-label={`별 ${hud.stars}개`}>{'★'.repeat(hud.stars)}<span>{'☆'.repeat(3 - hud.stars)}</span></div> : <div className="marble-orb" aria-hidden="true" />}
            <h2>{title}</h2>
            {hud.phase === 'ready' && <><p>보석을 모두 모아 빛나는 골에 도착하세요.<br />떨어져도 괜찮아요. 체크포인트가 기다려요.</p><div className="marble-instructions"><span><kbd>W A S D</kbd> 이동</span><span><kbd>Shift</kbd> 브레이크</span><span><kbd>Space</kbd> 점프</span></div></>}
            {hud.phase === 'paused' && <p>굴러가던 순간 그대로.<br />준비되면 다시 출발해요.</p>}
            {finished && <><div className="marble-result"><div><span>완주 시간</span><b>{formatTime(hud.time)}</b></div><div><span>떨어짐</span><b>{hud.falls}회</b></div><div><span>완주 보너스</span><b>+{hud.bonus}</b></div></div><p>{hud.stars === 3 ? '빠르고 완벽한 주행이었어요!' : `떨어지지 않고 ${course.par}초 안에 도착하면 별 세 개!`}</p></>}
            <button type="button" className="marble-primary" disabled={!loaded} onClick={e => { action(); e.currentTarget.blur(); }}>{!loaded ? '작은 세계를 만드는 중…' : hud.phase === 'ready' ? '굴려 볼까요?' : hud.phase === 'paused' ? '계속 굴리기' : hud.phase === 'clear' ? '다음 미로로' : '처음부터 다시'} <span>→</span></button>
            {hud.phase === 'ready' && <small>ENTER로 시작 · 아래 버튼으로 터치 조작</small>}
            {(finished || hud.phase === 'paused') && <button type="button" className="marble-secondary" onClick={() => onSelect(stage, initialScore)}>이 코스 다시 도전</button>}
          </div>
        </div>}
      </div>
      <div className="marble-statusbar"><span><i /> {hud.checkpoint < 0 ? '출발 지점' : `체크포인트 ${hud.checkpoint + 1} 저장됨`}</span><span>◆ {course.gems.length}개의 보석 <b>→</b> ◎ 골인</span><span className="marble-target">별 세 개 목표 {course.par}초</span></div>
    </div>
    <div className="marble-underboard">
      <div className="marble-tip"><span>작은 힌트</span><p>{course.tip}</p><small>방향키 / WASD 이동 · Shift 브레이크 · Space 점프 · P 일시정지 · R 다시 시작</small></div>
      <div className="marble-touch" aria-label="터치 게임 조작">
        <div className="marble-dpad">{([{ code: 'up', label: '위로 이동', text: '↑' }, { code: 'left', label: '왼쪽 이동', text: '←' }, { code: 'brake', label: '브레이크', text: '●' }, { code: 'right', label: '오른쪽 이동', text: '→' }, { code: 'down', label: '아래로 이동', text: '↓' }]).map(({ code, label, text }) => <button key={code} className={`marble-pad-${code}`} type="button" aria-label={label}
          onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(code); }}
          onPointerUp={() => keys.current.delete(code)} onPointerCancel={() => keys.current.delete(code)} onLostPointerCapture={() => keys.current.delete(code)}
          onKeyDown={e => { if (e.code === 'Space' || e.code === 'Enter') keys.current.add(code); }} onKeyUp={() => keys.current.delete(code)} onBlur={() => keys.current.delete(code)}>{text}</button>)}</div>
        <button type="button" className="marble-jump" onPointerDown={e => { e.preventDefault(); doJump(); }} onClick={e => { if (e.detail === 0) doJump(); }}>↟<span>점프</span></button>
      </div>
    </div>
    <section className="marble-courses" aria-label="코스 선택"><div className="marble-course-heading"><h2>다음 모험은 어디로?</h2><span>3개의 작은 세계</span></div><div className="marble-course-grid">{COURSES.map((c, i) => <button type="button" key={c.name} className={`marble-course-card ${i === stage ? 'selected' : ''}`} aria-pressed={i === stage} onClick={() => onSelect(i)} style={{ '--course-color': c.color } as CSSProperties}>
      <span className="marble-course-icon" aria-hidden="true">{['▧', '▱', '✧'][i]}</span><span className="marble-course-text"><small>WORLD 0{i + 1}</small><strong>{c.name}</strong><span>{c.description}</span></span><span className="marble-course-record">{records[i] ? <>{'★'.repeat(records[i].stars)}<small>{formatTime(records[i].time)}</small></> : '→'}</span>
    </button>)}</div></section>
  </div>;
}
