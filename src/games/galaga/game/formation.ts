import {
  BREATH_AMOUNT,
  FORMATION_COLUMNS,
  FORMATION_SPACING_X,
  FORMATION_SPACING_Y,
  FORMATION_TOP,
  SWAY_AMPLITUDE,
  VIEW_WIDTH,
} from './constants';
import type { Vec } from './path';

export interface Slot {
  row: number;
  col: number;
}

/**
 * 편대 슬롯의 현재 좌표.
 * 모이는 동안에는 좌우로 흔들리고, 다 모인 뒤에는 위쪽 가운데를 기준으로 커졌다 작아졌다(숨쉬기) 한다.
 */
export function slotPosition(slot: Slot, time: number, assembled: boolean): Vec {
  const cx = VIEW_WIDTH / 2;
  const baseX = (slot.col - (FORMATION_COLUMNS - 1) / 2) * FORMATION_SPACING_X;
  const baseY = slot.row * FORMATION_SPACING_Y;
  if (!assembled) {
    return { x: cx + baseX + Math.sin(time * 1.2) * SWAY_AMPLITUDE, y: FORMATION_TOP + baseY };
  }
  const scale = 1 + BREATH_AMOUNT * (1 - Math.cos(time * 1.6)) * 0.5;
  return { x: cx + baseX * scale, y: FORMATION_TOP + baseY * scale };
}
