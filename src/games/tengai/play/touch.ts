import type { PlayerInput } from '../port/runtime';
import { frameInput, type KeyboardState } from './keyboard';

export type TouchControl = keyof PlayerInput | 'coin';

/** Each finger owns its input, so releasing one cannot release another. */
export class TouchInput {
  private pointers = new Map<number, TouchControl[]>();
  private state: KeyboardState = {
    player: { up: false, down: false, left: false, right: false, b1: false, b2: false, b3: false, start: false },
    coin: false,
    pulse: new Map(),
  };

  setPointer(id: number, controls: TouchControl[]) {
    const before = new Set(this.held());
    this.pointers.set(id, controls);
    for (const control of this.held()) if (!before.has(control)) this.state.pulse.set(control, 4);
    this.sync();
  }

  releasePointer(id: number, cancelled = false) {
    const released = this.pointers.get(id) ?? [];
    this.pointers.delete(id);
    const held = new Set(this.held());
    if (cancelled) for (const control of released) if (!held.has(control)) this.state.pulse.delete(control);
    this.sync();
  }

  held(): TouchControl[] { return [...new Set([...this.pointers.values()].flat())]; }

  clear() {
    this.pointers.clear();
    this.state.pulse.clear();
    this.sync();
  }

  addTo(input: { player: PlayerInput; coin: boolean }) {
    const touch = frameInput(this.state);
    for (const control of Object.keys(touch.player) as (keyof PlayerInput)[]) {
      if (touch.player[control]) input.player[control] = true;
    }
    input.coin ||= touch.coin;
  }

  private sync() {
    const held = new Set(this.held());
    for (const control of Object.keys(this.state.player) as (keyof PlayerInput)[]) this.state.player[control] = held.has(control);
    this.state.coin = held.has('coin');
  }
}

/** The outer thirds also allow diagonal movement. Leaving the pad releases it. */
export function padDirections(x: number, y: number): TouchControl[] {
  if (x < 0 || x > 1 || y < 0 || y > 1) return [];
  const directions: TouchControl[] = [];
  if (x < 0.36) directions.push('left');
  if (x > 0.64) directions.push('right');
  if (y < 0.36) directions.push('up');
  if (y > 0.64) directions.push('down');
  return directions;
}
