import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MuteButton, toggleMuted } from '../../shared/MuteButton';
import { melody, playSound, unlockAudio } from '../../shared/sound';
import { useHighScore } from '../../shared/useHighScore';
import { createPinball, launchBall, nudge, pausePinball, PINBALL_HIGHSCORE_KEY, startPinball, STEP, stepPinball, type PinballEvent, type PinballState } from './engine';
import { PinballScene } from './PinballScene';
import './pinball.css';

type Control = 'left' | 'right' | 'launch';
const snapshot = (game: PinballState) => ({
  phase: game.phase, waiting: game.waiting, score: game.score, ball: game.ballNumber,
  multiplier: game.multiplier, hits: game.bumperHits, targets: [...game.targets],
  charge: Math.round(game.charge * 100), saving: game.ballSave > 0 && !game.waiting,
  notice: game.noticeTime > 0 ? game.notice : '', tilt: game.tilt > 0,
});

function sound(event: PinballEvent) {
  if (event === 'bumper') playSound({ tones: [{ type: 'sine', from: 920, to: 410, duration: 0.15, volume: 0.09 }, { type: 'triangle', from: 1380, duration: 0.1, volume: 0.025 }] });
  if (event === 'target') playSound({ tones: [{ type: 'triangle', from: 1250, to: 850, duration: 0.09, volume: 0.05 }] });
  if (event === 'launch') playSound({ tones: [{ type: 'sine', from: 150, to: 780, duration: 0.22, volume: 0.07 }], noise: [{ duration: 0.1, volume: 0.04 }] });
  if (event === 'flipper') playSound({ noise: [{ duration: 0.045, volume: 0.07, from: 1500, to: 400 }] });
  if (event === 'bonus' || event === 'save') playSound({ tones: melody('triangle', [523, 659, 784, 1047], 0.065, 0.065) });
  if (event === 'drain' || event === 'tilt') playSound({ tones: [{ type: 'sine', from: 260, to: 80, duration: 0.38, volume: 0.08 }] });
  if (event === 'nudge') playSound({ noise: [{ duration: 0.08, volume: 0.08, from: 200, to: 80 }] });
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="pinball-webgl-error" role="alert"><strong>3D 화면을 열지 못했어요</strong><p>브라우저의 그래픽 가속을 켜고 다시 열어 주세요.</p></div> : this.props.children;
  }
}

export default function PinballGame() {
  const [game] = useState(createPinball);
  const [hud, setHud] = useState(() => snapshot(game));
  const [ready, setReady] = useState(false);
  const [best, submitScore] = useHighScore(PINBALL_HIGHSCORE_KEY);
  const submitted = useRef(best);
  const held = useRef(new Map<string, Control>());
  const dialog = useRef<HTMLDivElement>(null);
  const serialized = useRef('');
  const sync = useCallback(() => {
    const next = snapshot(game), text = JSON.stringify(next);
    if (text !== serialized.current) { serialized.current = text; setHud(next); }
    if (game.score > submitted.current) { submitted.current = game.score; submitScore(game.score); }
  }, [game, submitScore]);
  const clear = useCallback(() => { held.current.clear(); game.charging = false; game.charge = 0; }, [game]);
  const onReady = useCallback(() => setReady(true), []);
  const reset = useCallback(() => { clear(); Object.assign(game, createPinball()); sync(); }, [clear, game, sync]);
  const pause = useCallback(() => { clear(); pausePinball(game); sync(); }, [clear, game, sync]);
  const fire = useCallback(() => {
    if (!ready) return;
    unlockAudio();
    if (game.phase === 'paused') { startPinball(game); sync(); return; }
    if (game.phase === 'ready' || game.phase === 'gameover') { clear(); startPinball(game); }
    launchBall(game);
    sync();
  }, [clear, game, ready, sync]);
  const hold = useCallback((id: string, control: Control) => {
    if (!ready || game.phase === 'paused') return;
    unlockAudio();
    if (game.phase === 'ready' || game.phase === 'gameover') {
      if (control !== 'launch') return;
      startPinball(game);
    }
    held.current.set(id, control);
    sync();
  }, [game, ready, sync]);
  const doNudge = useCallback(() => { unlockAudio(); nudge(game); sync(); }, [game, sync]);

  useEffect(() => {
    if (hud.phase !== 'paused' && hud.phase !== 'gameover') return;
    const panel = dialog.current;
    const previous = document.activeElement;
    const buttons = panel?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.[0]?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [hud.phase]);

  useEffect(() => {
    let animation = 0, previous = performance.now(), elapsed = 0, hudTime = 0;
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - previous) / 1000));
      previous = now;
      if (game.phase === 'playing') {
        elapsed += dt;
        const controls = new Set(held.current.values());
        const input = { left: controls.has('left'), right: controls.has('right'), launch: controls.has('launch') };
        while (elapsed >= STEP && game.phase === 'playing') { stepPinball(game, input); elapsed -= STEP; }
      } else elapsed = 0;
      if (game.events.length) { new Set(game.events.splice(0)).forEach(sound); }
      if (now - hudTime >= 50) { sync(); hudTime = now; }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [game, sync]);

  useEffect(() => {
    const controls: Record<string, Control> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'launch', ArrowDown: 'launch' };
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select')) return;
      if (event.target instanceof HTMLElement && event.target.closest('button,a') && ['Enter', 'Space'].includes(event.code)) return;
      const control = controls[event.code];
      if (control) { event.preventDefault(); if (!event.repeat) hold(`key:${event.code}`, control); }
      else if (event.code === 'Enter') { event.preventDefault(); if (!event.repeat) fire(); }
      else if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(); }
      else if (event.code === 'KeyN') { event.preventDefault(); if (!event.repeat) doNudge(); }
      else if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) reset(); }
      else if (event.code === 'KeyM' && !event.repeat) toggleMuted();
    };
    const up = (event: KeyboardEvent) => {
      held.current.delete(`key:${event.code}`);
      if (event.target instanceof HTMLElement && event.target.closest('button,a') && ['Enter', 'Space'].includes(event.code)) return;
      if (controls[event.code]) event.preventDefault();
    };
    const blur = () => { clear(); if (game.phase === 'playing') pausePinball(game); sync(); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [clear, doNudge, fire, game, hold, pause, reset, sync]);

  const controlButton = (control: Control, label: string, key: string, detail: string) => <button type="button" className={`pinball-control pinball-control-${control}`} aria-label={label} disabled={!ready || hud.phase === 'paused'}
    onClick={event => {
      if (event.detail !== 0) return;
      if (control === 'launch') fire();
      else {
        hold(`assistive:${control}`, control);
        window.setTimeout(() => held.current.delete(`assistive:${control}`), 120);
      }
    }}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); hold(`pointer:${event.pointerId}`, control); }}
    onPointerUp={event => held.current.delete(`pointer:${event.pointerId}`)}
    onPointerCancel={event => held.current.delete(`pointer:${event.pointerId}`)}
    onLostPointerCapture={event => held.current.delete(`pointer:${event.pointerId}`)}
    onKeyDown={event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (!event.repeat) hold(`button:${control}`, control); } }}
    onKeyUp={event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); held.current.delete(`button:${control}`); } }}
    onBlur={() => held.current.delete(`button:${control}`)}>
    <span className="pinball-control-key">{key}</span><span><strong>{label}</strong><small>{detail}</small></span>
  </button>;
  const modal = hud.phase === 'paused' || hud.phase === 'gameover';

  return <div className="pinball-page game-page">
    <header className="pinball-heading">
      <div className="pinball-wordmark"><span className="pinball-orbit-mark" aria-hidden="true">◉</span><div><p>THE LITTLE ARCADE COLLECTION</p><h1>ORBIT<span>PINBALL CLUB</span></h1></div></div>
      <div className="pinball-edition"><span className="pinball-live-dot" /> A LITTLE SPACE TO PLAY <b>NO. 08 / 3D PINBALL</b></div>
    </header>
    <div className="pinball-layout">
      <section className="pinball-machine" aria-label="오빗 3D 핀볼 게임">
        <div className="pinball-scoreboard">
          <div><span>YOUR SCORE</span><strong aria-label={`현재 점수 ${hud.score}`}>{String(hud.score).padStart(6, '0')}</strong></div>
          <div className="pinball-ball-counter"><span>BALL</span><strong>{String(hud.ball).padStart(2, '0')}<small> / 03</small></strong></div>
          <div className="pinball-machine-tools"><MuteButton /><button type="button" aria-label={hud.phase === 'paused' ? '계속하기' : '일시정지'} disabled={hud.phase === 'ready' || hud.phase === 'gameover'} onClick={event => { pause(); event.currentTarget.blur(); }}>{hud.phase === 'paused' ? '▶' : 'Ⅱ'}</button></div>
        </div>
        <div className="pinball-stage" aria-label="3D 핀볼 테이블">
          <div className="pinball-stage-badge"><i /> {hud.tilt ? 'TILT' : hud.saving ? 'BALL SAVE ACTIVE' : 'ANTI-GRAVITY GOOD TIMES'}<span>×{hud.multiplier}</span></div>
          <SceneBoundary><PinballScene game={game} onReady={onReady} /></SceneBoundary>
          {hud.phase === 'ready' && <div className="pinball-ready-label"><span>READY WHEN YOU ARE</span><strong>궤도에 올라볼까요?</strong><button type="button" onClick={fire} disabled={!ready}>{ready ? '첫 번째 공 발사 ↗' : '테이블 준비 중…'}</button><small>SPACE를 길게 눌렀다 놓아도 시작됩니다</small></div>}
          {hud.phase === 'playing' && hud.notice && <div className={`pinball-notice ${hud.tilt ? 'is-tilt' : ''}`} role="status">{hud.notice}</div>}
          {modal && <div className="pinball-overlay"><div ref={dialog} className="pinball-dialog" role="dialog" aria-modal="true" aria-label={hud.phase === 'paused' ? '일시정지' : '게임 종료'}>
            <span className="pinball-dialog-symbol" aria-hidden="true">{hud.phase === 'paused' ? 'Ⅱ' : '✦'}</span><p>{hud.phase === 'paused' ? 'TAKE A BREATHER' : 'THAT WAS A GOOD ORBIT'}</p>
            <h2>{hud.phase === 'paused' ? '잠시, 지구 시간.' : '한 번 더, 궤도로.'}</h2>
            {hud.phase === 'gameover' ? <><strong className="pinball-final-score">{hud.score.toLocaleString()}</strong><span className="pinball-dialog-caption">{hud.score > 0 && hud.score >= best ? '새로운 나의 최고 기록!' : '모든 비행에는 다음이 있으니까요.'}</span></> : <span className="pinball-dialog-caption">공은 여기서 기다릴게요.</span>}
            <button type="button" className="pinball-primary" onClick={fire}>{hud.phase === 'paused' ? '계속 플레이' : '다시 플레이'} <span>↗</span></button>
            <button type="button" className="pinball-text-button" onClick={reset}>처음으로</button>
          </div></div>}
        </div>
        <div className="pinball-cabinet-strip"><span><i /> ALL SYSTEMS GO</span><span>DESIGNED FOR A GOOD BREAK.</span><span>● ● ●</span></div>
        <div className="pinball-touch-controls" aria-label="핀볼 터치 조작">
          {controlButton('left', '왼쪽 플리퍼', '←', 'A / ←')}
          {controlButton('launch', '발사', '↟', hud.waiting ? (hud.charge ? `${hud.charge}% 충전` : '길게 누른 뒤 놓기') : 'SPACE')}
          {controlButton('right', '오른쪽 플리퍼', '→', 'D / →')}
        </div>
        <div className="pinball-charge-track" role="progressbar" aria-label="발사 충전" aria-valuenow={hud.charge} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${hud.charge}%` }} /></div>
      </section>
      <aside className="pinball-sidebar">
        <div className="pinball-intro"><p className="pinball-eyebrow">LESS SCROLL. MORE ROLL.</p><h2>작은 공 하나,<br />우주만큼의 재미<span>✳</span></h2><p>은빛 공을 쏘아 올리고,<br />나만의 궤도를 만들어 보세요.</p></div>
        <div className="pinball-best"><span className="pinball-award" aria-hidden="true">✧</span><div><span>PERSONAL BEST</span><strong>{Math.max(best, hud.score).toLocaleString()}<small>PTS</small></strong></div><span className="pinball-best-arrow">↗</span></div>
        <section className="pinball-mission"><div className="pinball-section-label"><h3>오늘의 비행 계획</h3><span>THE MISSION</span></div><p>다섯 별을 밝혀 <b>ORBIT BONUS</b></p><div className="pinball-targets" aria-label={`${hud.targets.filter(Boolean).length} / 5 타깃 점등`}>{'ORBIT'.split('').map((letter, i) => <span key={letter} className={hud.targets[i] ? 'lit' : ''}>{letter}<i /></span>)}</div><div className="pinball-mission-reward"><span>모두 맞히면</span><strong>+2,500 <small>× 배수</small></strong></div></section>
        <section className="pinball-boost"><div><span>ORBIT BOOST</span><strong>×{hud.multiplier}</strong></div><p>범퍼를 10번 맞힐 때마다 배수 UP</p><div className="pinball-boost-track">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < hud.hits % 10 ? 'lit' : ''} />)}</div><small>{hud.hits % 10} / 10 HITS <span>MAX ×5</span></small></section>
        <section className="pinball-guide"><div className="pinball-section-label"><h3>플레이 가이드</h3><span>HOW TO ORBIT</span></div><div><kbd>←</kbd><kbd>→</kbd><p>플리퍼로 공을 튕겨주세요<small>A · D 키 또는 아래 터치 버튼</small></p></div><div><kbd>SPACE</kbd><p>길게 누르고, 놓으면 발사<small>충전할수록 더 힘차게 날아가요</small></p></div><div><kbd>N</kbd><p>위기의 순간, 살짝 흔들기<small>너무 자주 흔들면 3초간 TILT!</small></p></div></section>
        <div className="pinball-sidebar-actions"><button type="button" onClick={doNudge} disabled={hud.phase !== 'playing' || hud.waiting || hud.tilt}>흔들기 <span>N</span></button><button type="button" onClick={reset}>다시 시작 <span>R</span></button></div>
        <p className="pinball-footnote">공은 세 개. 기회는 무한대.<br />최고 기록은 이 브라우저에 저장됩니다.</p>
      </aside>
    </div>
    <footer className="pinball-footer"><span>BUILT FOR THE JOY OF IT.</span><span>일시정지 P · 사운드 M</span><span>STAY IN ORBIT ↗</span></footer>
  </div>;
}
