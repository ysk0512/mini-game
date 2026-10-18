import { useEffect, useState, type PointerEvent } from 'react';
import { padDirections, TouchInput, type TouchControl } from './touch';

export function TouchControls({ input, disabled }: { input: TouchInput; disabled: boolean }) {
  const [held, setHeld] = useState<TouchControl[]>([]);
  const refresh = () => setHeld(input.held());

  useEffect(() => {
    const clear = () => { input.clear(); setHeld([]); };
    clear();
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      clear();
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [input, disabled]);

  const release = (event: PointerEvent<HTMLElement>) => {
    input.releasePointer(event.pointerId, event.type !== 'pointerup');
    refresh();
  };
  const capture = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePad = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = event.currentTarget.getBoundingClientRect();
    input.setPointer(event.pointerId, padDirections((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height));
    refresh();
  };
  const button = (control: TouchControl, label: string, text: string) => (
    <button type="button" className={`tengai-touch-button tengai-touch-${control}`} aria-label={label}
      aria-pressed={held.includes(control)} disabled={disabled}
      onPointerDown={event => {
        if (['up', 'down', 'left', 'right'].includes(control)) return;
        if (event.button !== 0) return;
        capture(event);
        input.setPointer(event.pointerId, [control]);
        refresh();
      }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onClick={event => {
        // Keyboard and assistive activation have no pointerdown event.
        if (event.detail !== 0 || disabled) return;
        input.setPointer(-1, [control]);
        input.releasePointer(-1);
      }}>{text}</button>
  );

  return (
    <div className="tengai-touch-controls" aria-label="터치 게임 조작" onContextMenu={event => event.preventDefault()}>
      <div className="tengai-touch-pad" role="group" aria-label="이동 방향패드"
        onPointerDown={event => { if (!disabled && event.button === 0) { capture(event); movePad(event); } }}
        onPointerMove={movePad} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
        {button('up', '위로 이동', '▲')}
        {button('left', '왼쪽으로 이동', '◀')}
        <span className="tengai-touch-center" aria-hidden="true">✦</span>
        {button('right', '오른쪽으로 이동', '▶')}
        {button('down', '아래로 이동', '▼')}
      </div>
      <div className="tengai-touch-actions">
        <div className="tengai-touch-start-row">{button('coin', '코인 넣기', '코인')}{button('start', '게임 시작', '시작')}</div>
        <div className="tengai-touch-fire-row">{button('b2', '폭탄 사용', '폭탄')}{button('b1', '샷 · 길게 눌러 모아쏘기', '샷')}</div>
        <small>샷을 길게 누르면 모아쏘기</small>
      </div>
    </div>
  );
}
