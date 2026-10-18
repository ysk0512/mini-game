import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, BUMPERS, createPinball, IDLE_INPUT, launchBall, nudge, pausePinball, startPinball, STEP, stepPinball, TARGETS, type PinballInput, type PinballState } from './engine';

function advance(game: PinballState, seconds: number, input: PinballInput = IDLE_INPUT) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepPinball(game, input);
}
function playing() { const game = createPinball(); startPinball(game); return game; }

describe('Orbit pinball', () => {
  it('starts with three balls and charges only while the launch control is held', () => {
    const game = playing();
    advance(game, 0.5, { ...IDLE_INPUT, launch: true });
    expect(game.waiting).toBe(true);
    expect(game.charge).toBeCloseTo(0.4);
    stepPinball(game, IDLE_INPUT);
    expect(game.waiting).toBe(false);
    expect(game.ball.vy).toBeGreaterThan(21);
    expect(game.ballNumber).toBe(1);
  });

  it('launches through the real shooter lane into the bumper area at every charge level', () => {
    for (const power of [0, 0.5, 1]) {
      const game = playing(); launchBall(game, power);
      let entered = false;
      for (let i = 0; i < 3 / STEP; i++) {
        stepPinball(game, IDLE_INPUT);
        if (game.ball.x < 2.6 && game.ball.y > 1) entered = true;
      }
      expect(entered, `launch power ${power}: ${JSON.stringify(game.ball)}`).toBe(true);
    }
  });

  it('strikes a descending ball upward with either moving flipper', () => {
    for (const left of [true, false]) {
      const game = playing(); game.waiting = false;
      Object.assign(game.ball, { x: left ? -1.2 : 1.2, y: -5.2, vx: 0, vy: -4 });
      advance(game, 0.04, { ...IDLE_INPUT, left, right: !left });
      expect(game.ball.vy).toBeGreaterThan(10);
      expect(game.events).toContain('flipper');
    }
  });

  it('scores a real bumper collision and separates the ball from its surface', () => {
    const game = playing(); game.waiting = false;
    const bumper = BUMPERS[0];
    Object.assign(game.ball, { x: bumper.x + bumper.radius + BALL_RADIUS - 0.02, y: bumper.y, vx: -3, vy: 0 });
    stepPinball(game, IDLE_INPUT);
    expect(game.score).toBe(100);
    expect(game.ball.vx).toBeGreaterThan(3);
    expect(game.bumperHits).toBe(1);
    advance(game, 0.02);
    expect(game.score).toBe(100);
  });

  it('awards an increased multiplier after ten bumper hits', () => {
    const game = playing(); game.waiting = false; game.bumperHits = 9;
    const bumper = BUMPERS[0];
    Object.assign(game.ball, { x: bumper.x + 0.85, y: bumper.y, vx: -2, vy: 0 });
    stepPinball(game, IDLE_INPUT);
    expect(game.multiplier).toBe(2);
    expect(game.events).toContain('bonus');
  });

  it('lights all five targets, awards the orbit bonus, and resets the mission', () => {
    const game = playing(); game.waiting = false;
    TARGETS.forEach(target => {
      Object.assign(game.ball, { x: target.x, y: target.y - 0.42, vx: 0, vy: 2 });
      stepPinball(game, IDLE_INPUT);
    });
    expect(game.score).toBe(5 * 250 + 2500);
    expect(game.targets.every(lit => !lit)).toBe(true);
    expect(game.events).toContain('bonus');
  });

  it('saves an early drain without consuming the next ball', () => {
    const game = playing(); launchBall(game);
    Object.assign(game.ball, { x: 0, y: -8.2, vx: 0, vy: -1 });
    stepPinball(game, IDLE_INPUT);
    expect(game.ballNumber).toBe(1);
    expect(game.waiting).toBe(true);
    expect(game.events).toContain('save');
  });

  it('consumes exactly three balls and can restart a finished game', () => {
    const game = playing();
    for (let ball = 1; ball <= 3; ball++) {
      game.waiting = false; game.ballSave = 0;
      Object.assign(game.ball, { x: 0, y: -8.2, vx: 0, vy: -1 });
      stepPinball(game, IDLE_INPUT);
      expect(game.ballNumber).toBe(Math.min(3, ball + 1));
    }
    expect(game.phase).toBe('gameover');
    game.score = 1234; startPinball(game);
    expect(game.phase).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.ballNumber).toBe(1);
  });

  it('does not trap missed balls on an invisible bottom wall', () => {
    const game = playing(); game.waiting = false;
    Object.assign(game.ball, { x: -3.2, y: -6.5, vx: 0, vy: -2 });
    advance(game, 1);
    expect(game.ballNumber).toBe(2);
    expect(game.waiting).toBe(true);
  });

  it('pauses without advancing physics and cancels unfinished charging', () => {
    const game = playing(); advance(game, 0.5, { ...IDLE_INPUT, launch: true });
    pausePinball(game);
    const ball = { ...game.ball }, time = game.time;
    advance(game, 2);
    expect(game.ball).toEqual(ball); expect(game.time).toBe(time);
    pausePinball(game); stepPinball(game, IDLE_INPUT);
    expect(game.waiting).toBe(true); expect(game.charge).toBe(0);
  });

  it('tilts after excessive nudging, disabling flippers temporarily', () => {
    const game = playing(); launchBall(game);
    for (let i = 0; i < 3; i++) { game.nudgeCooldown = 0; nudge(game); }
    expect(game.tilt).toBe(3); expect(game.ballSave).toBe(0);
    advance(game, 0.15, { ...IDLE_INPUT, left: true, right: true });
    expect(game.leftAngle).toBeCloseTo(-0.36);
    expect(game.rightAngle).toBeCloseTo(Math.PI + 0.36);
  });

  it('keeps a long play session finite and inside the table until the drain', () => {
    const game = playing();
    for (let i = 0; i < 120 / STEP; i++) {
      if (game.phase === 'gameover') break;
      if (game.waiting) launchBall(game);
      stepPinball(game, { left: i % 151 < 60, right: i % 137 < 55, launch: false });
      expect(Number.isFinite(game.ball.x + game.ball.y + game.ball.vx + game.ball.vy)).toBe(true);
      expect(Math.abs(game.ball.x)).toBeLessThan(4.2);
      expect(game.ball.y).toBeLessThan(8);
    }
    expect(game.score).toBeGreaterThan(0);
  });
});
