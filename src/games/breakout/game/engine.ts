import { circleRect } from './collision';
import {
  BALL_RADIUS,
  BALL_SPEED_PER_LEVEL,
  BASE_BALL_SPEED,
  BRICK_GAP,
  BRICK_HEIGHT,
  BRICK_SIDE,
  BRICK_TOP,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  EXPAND_FACTOR,
  INITIAL_LIVES,
  LAUNCH_ANGLE,
  MAX_BALLS,
  MAX_BOUNCE_ANGLE,
  MULTIBALL_SPREAD,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_WIDTH,
  PADDLE_Y,
  POINTS_PER_HP,
  POWERUP_CHANCE,
  POWERUP_DURATION,
  POWERUP_FALL_SPEED,
  POWERUP_HEIGHT,
  POWERUP_WIDTH,
  SLOW_FACTOR,
} from './constants';
import { LEVELS } from './levels';
import type { Ball, Brick, Controls, GameEvent, GameState, PowerUpType, Rect } from './types';

export type Rng = () => number;

const POWERUP_WEIGHTS: [PowerUpType, number][] = [
  ['expand', 3],
  ['multiball', 3],
  ['slow', 3],
  ['life', 1],
];

/** 공이 너무 수평으로 날아가 게임이 늘어지는 것을 막기 위한 최소 수직 성분 */
const MIN_VERTICAL = 0.25;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function buildBricks(level: number): Brick[] {
  const bricks: Brick[] = [];
  LEVELS[level].forEach((row, r) => {
    const cols = row.length;
    const w = (CANVAS_WIDTH - BRICK_SIDE * 2 - BRICK_GAP * (cols - 1)) / cols;
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const unbreakable = ch === '#';
      const hp = unbreakable ? 1 : Number(ch);
      bricks.push({
        x: BRICK_SIDE + c * (w + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_HEIGHT + BRICK_GAP),
        w,
        h: BRICK_HEIGHT,
        hp,
        maxHp: hp,
        unbreakable,
      });
    });
  });
  return bricks;
}

function resetBall(state: GameState) {
  state.balls = [{ x: state.paddle.x, y: PADDLE_Y - BALL_RADIUS, dx: 0, dy: -1, stuck: true }];
  state.powerUps = [];
  state.effects = { expand: 0, slow: 0 };
}

/** 점수와 생명은 유지한 채 스테이지를 불러온다. */
export function loadLevel(state: GameState, level: number) {
  state.level = level;
  state.paddle = { x: CANVAS_WIDTH / 2 };
  state.bricks = buildBricks(level);
  resetBall(state);
}

export function createGame(): GameState {
  const state: GameState = {
    level: 0,
    score: 0,
    lives: INITIAL_LIVES,
    paddle: { x: CANVAS_WIDTH / 2 },
    balls: [],
    bricks: [],
    powerUps: [],
    effects: { expand: 0, slow: 0 },
  };
  loadLevel(state, 0);
  return state;
}

export const paddleWidth = (state: GameState) =>
  state.effects.expand > 0 ? PADDLE_WIDTH * EXPAND_FACTOR : PADDLE_WIDTH;

export const ballSpeed = (state: GameState) =>
  (BASE_BALL_SPEED + state.level * BALL_SPEED_PER_LEVEL) * (state.effects.slow > 0 ? SLOW_FACTOR : 1);

export function paddleRect(state: GameState): Rect {
  const w = paddleWidth(state);
  return { x: state.paddle.x - w / 2, y: PADDLE_Y, w, h: PADDLE_HEIGHT };
}

export const isLevelCleared = (state: GameState) => !state.bricks.some((b) => !b.unbreakable);

export const isLastLevel = (state: GameState) => state.level >= LEVELS.length - 1;

function setDirection(ball: Ball, angle: number) {
  ball.dx = Math.sin(angle);
  ball.dy = -Math.cos(angle);
  if (Math.abs(ball.dy) < MIN_VERTICAL) {
    ball.dy = Math.sign(ball.dy || -1) * MIN_VERTICAL;
    ball.dx = Math.sign(ball.dx) * Math.sqrt(1 - MIN_VERTICAL * MIN_VERTICAL);
  }
}

/** 패들에 붙어 있는 공을 모두 발사한다. */
export function launchBalls(state: GameState, rng: Rng = Math.random) {
  for (const ball of state.balls) {
    if (!ball.stuck) continue;
    setDirection(ball, (rng() * 2 - 1) * LAUNCH_ANGLE);
    ball.stuck = false;
  }
}

/**
 * 게임을 dt초만큼 진행한다. state를 직접 변경하며 발생한 이벤트를 반환한다.
 */
export function update(state: GameState, dt: number, controls: Controls, rng: Rng = Math.random): GameEvent[] {
  if (state.lives <= 0 || isLevelCleared(state)) return [];

  state.effects.expand = Math.max(0, state.effects.expand - dt);
  state.effects.slow = Math.max(0, state.effects.slow - dt);

  movePaddle(state, dt, controls);
  moveBalls(state, dt, rng);
  movePowerUps(state, dt);

  if (isLevelCleared(state)) return ['levelClear'];
  if (state.balls.length > 0) return [];

  state.lives--;
  if (state.lives <= 0) return ['gameOver'];
  resetBall(state);
  return ['lifeLost'];
}

function movePaddle(state: GameState, dt: number, controls: Controls) {
  const half = paddleWidth(state) / 2;
  let x = state.paddle.x;
  if (controls.left || controls.right) {
    x += (Number(controls.right) - Number(controls.left)) * PADDLE_SPEED * dt;
  } else if (controls.mouseX !== null) {
    x = controls.mouseX;
  }
  state.paddle.x = clamp(x, half, CANVAS_WIDTH - half);
}

function moveBalls(state: GameState, dt: number, rng: Rng) {
  const distance = ballSpeed(state) * dt;
  // 한 스텝 이동량을 반지름의 절반 이하로 나눠 벽돌을 뚫고 지나가지 않게 한다
  const steps = Math.max(1, Math.ceil(distance / (BALL_RADIUS / 2)));
  const stepDistance = distance / steps;

  for (let i = 0; i < steps; i++) {
    for (const ball of state.balls) {
      if (ball.stuck) continue;
      ball.x += ball.dx * stepDistance;
      ball.y += ball.dy * stepDistance;
      collideWalls(ball);
      collidePaddle(state, ball);
      collideBricks(state, ball, rng);
    }
  }

  state.balls = state.balls.filter((b) => b.y - BALL_RADIUS <= CANVAS_HEIGHT);
  for (const ball of state.balls) {
    if (!ball.stuck) continue;
    ball.x = state.paddle.x;
    ball.y = PADDLE_Y - BALL_RADIUS;
  }
}

function collideWalls(ball: Ball) {
  if (ball.x < BALL_RADIUS) {
    ball.x = BALL_RADIUS;
    ball.dx = Math.abs(ball.dx);
  } else if (ball.x > CANVAS_WIDTH - BALL_RADIUS) {
    ball.x = CANVAS_WIDTH - BALL_RADIUS;
    ball.dx = -Math.abs(ball.dx);
  }
  if (ball.y < BALL_RADIUS) {
    ball.y = BALL_RADIUS;
    ball.dy = Math.abs(ball.dy);
  }
}

function collidePaddle(state: GameState, ball: Ball) {
  if (ball.dy <= 0 || ball.y > PADDLE_Y + PADDLE_HEIGHT) return;
  if (!circleRect(ball.x, ball.y, BALL_RADIUS, paddleRect(state))) return;
  // 패들 중앙에서 얼마나 떨어져 맞았는지에 따라 반사각 결정
  const offset = clamp((ball.x - state.paddle.x) / (paddleWidth(state) / 2), -1, 1);
  setDirection(ball, offset * MAX_BOUNCE_ANGLE);
  ball.y = PADDLE_Y - BALL_RADIUS;
}

function collideBricks(state: GameState, ball: Ball, rng: Rng) {
  for (let i = 0; i < state.bricks.length; i++) {
    const hit = circleRect(ball.x, ball.y, BALL_RADIUS, state.bricks[i]);
    if (!hit) continue;
    ball.x += hit.nx * hit.depth;
    ball.y += hit.ny * hit.depth;
    if (Math.abs(hit.nx) > Math.abs(hit.ny)) {
      ball.dx = Math.sign(hit.nx) * Math.abs(ball.dx);
    } else {
      ball.dy = Math.sign(hit.ny) * Math.abs(ball.dy);
    }
    hitBrick(state, i, rng);
    return; // 한 스텝에 벽돌 하나만 처리
  }
}

function hitBrick(state: GameState, index: number, rng: Rng) {
  const brick = state.bricks[index];
  if (brick.unbreakable) return;
  brick.hp--;
  if (brick.hp > 0) return;

  state.bricks.splice(index, 1);
  state.score += POINTS_PER_HP * brick.maxHp;
  if (rng() < POWERUP_CHANCE) {
    state.powerUps.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, type: pickPowerUp(rng) });
  }
}

function pickPowerUp(rng: Rng): PowerUpType {
  const total = POWERUP_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [type, weight] of POWERUP_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return type;
  }
  return POWERUP_WEIGHTS[0][0];
}

function movePowerUps(state: GameState, dt: number) {
  const paddle = paddleRect(state);
  state.powerUps = state.powerUps.filter((p) => {
    p.y += POWERUP_FALL_SPEED * dt;
    const rect = { x: p.x - POWERUP_WIDTH / 2, y: p.y - POWERUP_HEIGHT / 2, w: POWERUP_WIDTH, h: POWERUP_HEIGHT };
    if (overlaps(rect, paddle)) {
      applyPowerUp(state, p.type);
      return false;
    }
    return rect.y <= CANVAS_HEIGHT;
  });
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function applyPowerUp(state: GameState, type: PowerUpType) {
  switch (type) {
    case 'expand':
      state.effects.expand = POWERUP_DURATION;
      break;
    case 'slow':
      state.effects.slow = POWERUP_DURATION;
      break;
    case 'life':
      state.lives++;
      break;
    case 'multiball':
      addBalls(state);
      break;
  }
}

function addBalls(state: GameState) {
  const source = state.balls.find((b) => !b.stuck) ?? state.balls[0];
  if (!source) return;
  const angle = source.stuck ? 0 : Math.atan2(source.dx, -source.dy);
  for (const spread of [-MULTIBALL_SPREAD, MULTIBALL_SPREAD]) {
    if (state.balls.length >= MAX_BALLS) break;
    const ball: Ball = { x: source.x, y: source.y, dx: 0, dy: -1, stuck: false };
    setDirection(ball, angle + spread);
    state.balls.push(ball);
  }
}
