import type { PlayerInput } from '../port/runtime';

/**
 * 게임패드 → 아케이드 입력 (브라우저 표준 배치 기준).
 *   이동: 십자키 / 왼쪽 스틱   샷: A(0)   폭탄: B(1)   버튼3: X(2)   시작: Start(9)   코인: Select(8)
 */
const BUTTONS: [number, keyof PlayerInput][] = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
  [0, 'b1'],
  [1, 'b2'],
  [2, 'b3'],
  [9, 'start'],
];
const COIN_BUTTON = 8;
const STICK_DEAD_ZONE = 0.5;

/** 연결된 모든 패드의 입력을 키보드 입력에 더한다. 프레임마다 한 번 부른다 */
export function addGamepadInput(input: { player: PlayerInput; coin: boolean }) {
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
    for (const [i, k] of BUTTONS) if (pressed(i)) input.player[k] = true;
    if (pressed(COIN_BUTTON)) input.coin = true;
    const [x = 0, y = 0] = pad.axes;
    if (x < -STICK_DEAD_ZONE) input.player.left = true;
    if (x > STICK_DEAD_ZONE) input.player.right = true;
    if (y < -STICK_DEAD_ZONE) input.player.up = true;
    if (y > STICK_DEAD_ZONE) input.player.down = true;
  }
}
