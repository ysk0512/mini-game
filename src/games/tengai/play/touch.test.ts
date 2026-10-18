import { describe, expect, it } from 'vitest';
import { padDirections, TouchInput } from './touch';

const empty = () => ({ player: { up: false, down: false, left: false, right: false, b1: false, b2: false, b3: false, start: false }, coin: false });
const frame = (touch: TouchInput) => { const input = empty(); touch.addTo(input); return input; };

describe('Tengai touch input', () => {
  it('holds movement and charged fire independently with multiple fingers', () => {
    const touch = new TouchInput();
    touch.setPointer(1, ['left', 'up']);
    touch.setPointer(2, ['b1']);
    for (let i = 0; i < 20; i++) expect(frame(touch).player).toMatchObject({ left: true, up: true, b1: true });
    touch.releasePointer(1);
    expect(frame(touch).player).toMatchObject({ left: false, up: false, b1: true });
    touch.releasePointer(2);
    expect(frame(touch).player.b1).toBe(false);
  });

  it('preserves very short coin/start taps for four game frames', () => {
    const touch = new TouchInput();
    touch.setPointer(1, ['coin', 'start']);
    touch.releasePointer(1);
    for (let i = 0; i < 4; i++) expect(frame(touch)).toMatchObject({ coin: true, player: { start: true } });
    expect(frame(touch)).toMatchObject({ coin: false, player: { start: false } });
  });

  it('keeps a second finger on the same control when the first is cancelled', () => {
    const touch = new TouchInput();
    touch.setPointer(1, ['b1']);
    touch.setPointer(2, ['b1']);
    touch.releasePointer(1, true);
    expect(frame(touch).player.b1).toBe(true);
    touch.releasePointer(2, true);
    expect(frame(touch).player.b1).toBe(false);
  });

  it('clears pending pulses and holds on interruption without replacing keyboard input', () => {
    const touch = new TouchInput();
    touch.setPointer(1, ['coin', 'left', 'b1']);
    touch.clear();
    const input = empty();
    input.player.right = true;
    touch.addTo(input);
    expect(input).toMatchObject({ coin: false, player: { left: false, b1: false, right: true } });
    expect(touch.held()).toEqual([]);
  });

  it('allows sliding diagonally, centering and leaving the direction pad', () => {
    expect(padDirections(.1, .1)).toEqual(['left', 'up']);
    expect(padDirections(.9, .9)).toEqual(['right', 'down']);
    expect(padDirections(.5, .5)).toEqual([]);
    expect(padDirections(1.1, .5)).toEqual([]);
  });
});
