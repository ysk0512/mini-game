import { describe, expect, it } from 'vitest';
import { circleRect } from './collision';
import { BALL_RADIUS, CANVAS_HEIGHT, INITIAL_LIVES, PADDLE_WIDTH, PADDLE_Y } from './constants';
import { applyPowerUp, createGame, launchBalls, paddleWidth, update } from './engine';
import type { Ball, Brick, Controls, GameState } from './types';

const idle: Controls = { left: false, right: false, mouseX: null };
const noDrop = () => 0.99; // 아이템이 떨어지지 않는 난수
const dt = 1 / 60;

function brick(x: number, y: number, hp: number, unbreakable = false): Brick {
  return { x, y, w: 60, h: 20, hp, maxHp: hp, unbreakable };
}

function ball(x: number, y: number, dx: number, dy: number): Ball {
  return { x, y, dx, dy, stuck: false };
}

function gameWith(bricks: Brick[], balls: Ball[]): GameState {
  const state = createGame();
  state.bricks = bricks;
  state.balls = balls;
  return state;
}

describe('circleRect', () => {
  const rect = { x: 0, y: 0, w: 10, h: 10 };

  it('겹치지 않으면 null', () => {
    expect(circleRect(20, 5, 3, rect)).toBeNull();
  });

  it('오른쪽 면에 닿으면 법선이 +x', () => {
    const hit = circleRect(12, 5, 3, rect);
    expect(hit).not.toBeNull();
    expect(hit!.nx).toBeCloseTo(1);
    expect(hit!.ny).toBeCloseTo(0);
    expect(hit!.depth).toBeCloseTo(1);
  });
});

describe('update', () => {
  it('공이 벽돌에 맞으면 내구도가 줄고 반사된다', () => {
    const target = brick(370, 200, 2);
    const state = gameWith([target, brick(0, 0, 1)], [ball(400, 225, 0, -1)]);
    update(state, dt, idle, noDrop);
    expect(target.hp).toBe(1);
    expect(state.balls[0].dy).toBeGreaterThan(0);
    expect(state.score).toBe(0);
  });

  it('벽돌이 부서지면 원래 내구도 × 10점을 얻는다', () => {
    const state = gameWith([brick(370, 200, 1), brick(0, 0, 1)], [ball(400, 225, 0, -1)]);
    state.bricks[0].maxHp = 3;
    update(state, dt, idle, noDrop);
    expect(state.bricks).toHaveLength(1);
    expect(state.score).toBe(30);
  });

  it('파괴 불가 벽돌만 남으면 스테이지 클리어', () => {
    const state = gameWith([brick(370, 200, 1), brick(0, 0, 1, true)], [ball(400, 225, 0, -1)]);
    expect(update(state, dt, idle, noDrop)).toEqual(['levelClear']);
  });

  it('마지막 공이 바닥으로 빠지면 생명이 줄고 공이 패들에 다시 붙는다', () => {
    const state = gameWith([brick(0, 0, 1)], [ball(400, CANVAS_HEIGHT + BALL_RADIUS - 1, 0, 1)]);
    expect(update(state, dt, idle, noDrop)).toEqual(['lifeLost']);
    expect(state.lives).toBe(INITIAL_LIVES - 1);
    expect(state.balls).toHaveLength(1);
    expect(state.balls[0].stuck).toBe(true);
  });

  it('공이 남아 있으면 생명이 줄지 않는다', () => {
    const state = gameWith(
      [brick(0, 0, 1)],
      [ball(400, CANVAS_HEIGHT + BALL_RADIUS - 1, 0, 1), ball(400, 300, 0, -1)],
    );
    expect(update(state, dt, idle, noDrop)).toEqual([]);
    expect(state.lives).toBe(INITIAL_LIVES);
    expect(state.balls).toHaveLength(1);
  });

  it('생명이 0이 되면 게임 오버', () => {
    const state = gameWith([brick(0, 0, 1)], [ball(400, CANVAS_HEIGHT + BALL_RADIUS - 1, 0, 1)]);
    state.lives = 1;
    expect(update(state, dt, idle, noDrop)).toEqual(['gameOver']);
    expect(state.lives).toBe(0);
  });

  it('패들 오른쪽 끝에 맞으면 오른쪽 위로 튄다', () => {
    const state = gameWith([brick(0, 0, 1)], [ball(400 + PADDLE_WIDTH / 2 - 5, PADDLE_Y - BALL_RADIUS + 1, 0, 1)]);
    update(state, dt, idle, noDrop);
    expect(state.balls[0].dy).toBeLessThan(0);
    expect(state.balls[0].dx).toBeGreaterThan(0.5);
  });

  it('발사하면 공이 위로 움직인다', () => {
    const state = createGame();
    launchBalls(state, () => 0.5);
    expect(state.balls[0].stuck).toBe(false);
    expect(state.balls[0].dy).toBeCloseTo(-1);
  });
});

describe('powerUps', () => {
  it('멀티볼은 공 2개를 추가한다', () => {
    const state = gameWith([brick(0, 0, 1)], [ball(400, 300, 0, -1)]);
    applyPowerUp(state, 'multiball');
    expect(state.balls).toHaveLength(3);
  });

  it('확장은 패들 폭을 늘렸다가 시간이 지나면 원래대로', () => {
    const state = createGame();
    applyPowerUp(state, 'expand');
    expect(paddleWidth(state)).toBeGreaterThan(PADDLE_WIDTH);
    for (let t = 0; t < 11 * 60; t++) update(state, dt, idle, noDrop);
    expect(paddleWidth(state)).toBe(PADDLE_WIDTH);
  });
});
