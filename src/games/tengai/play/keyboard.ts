import type { PlayerInput } from '../port/runtime';

/**
 * 키보드 → 아케이드 입력.
 *   이동: 방향키 / WASD   샷(모아쏘기는 누르고 있기): Z / J   폭탄: X / K   버튼3: C / L
 *   시작: Enter / 1       코인: 5 / Shift    일시정지: P / Esc
 */
const KEYMAP: Record<string, keyof PlayerInput> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyZ: 'b1',
  KeyJ: 'b1',
  KeyX: 'b2',
  KeyK: 'b2',
  KeyC: 'b3',
  KeyL: 'b3',
  Enter: 'start',
  Digit1: 'start',
};
const COIN_KEYS = new Set(['Digit5', 'ShiftLeft', 'ShiftRight']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);

export interface KeyboardState {
  player: PlayerInput;
  coin: boolean;
  /** 키를 아주 짧게 눌러도 게임이 읽도록, 눌림을 최소 몇 프레임 유지한다 (입력 이름 또는 'coin' → 남은 프레임) */
  pulse: Map<string, number>;
}

/** 게임은 VBLANK마다 입력을 한 번 읽으므로 짧은 눌림도 이만큼 유지한다 */
const MIN_HOLD_FRAMES = 4;

/** 이번 프레임에 게임에 줄 입력 (눌림 유지 반영). 프레임마다 한 번 부른다 */
export function frameInput(state: KeyboardState): { player: PlayerInput; coin: boolean } {
  const player = { ...state.player };
  let coin = state.coin;
  for (const [k, n] of state.pulse) {
    if (k === 'coin') coin = true;
    else player[k as keyof PlayerInput] = true;
    if (n <= 1) state.pulse.delete(k);
    else state.pulse.set(k, n - 1);
  }
  return { player, coin };
}

/** window 키 이벤트를 받아 현재 눌림 상태를 유지한다. 반환한 함수로 해제 */
export function listenKeyboard(state: KeyboardState, onPause: () => void): () => void {
  const set = (e: KeyboardEvent, down: boolean) => {
    const k = KEYMAP[e.code];
    if (k) {
      state.player[k] = down;
      if (down && !e.repeat) state.pulse.set(k, MIN_HOLD_FRAMES);
      e.preventDefault();
    } else if (COIN_KEYS.has(e.code)) {
      state.coin = down;
      if (down && !e.repeat) state.pulse.set('coin', MIN_HOLD_FRAMES);
      e.preventDefault();
    } else if (down && PAUSE_KEYS.has(e.code) && !e.repeat) {
      onPause();
      e.preventDefault();
    }
  };
  const onDown = (e: KeyboardEvent) => set(e, true);
  const onUp = (e: KeyboardEvent) => set(e, false);
  // 창을 벗어나면 눌린 키가 남지 않게 모두 뗀다
  const onBlur = () => {
    for (const k of Object.keys(state.player) as (keyof PlayerInput)[]) state.player[k] = false;
    state.coin = false;
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
  };
}
