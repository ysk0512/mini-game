export const PINBALL_HIGHSCORE_KEY = 'orbit-pinball-highscore';
export const STEP = 1 / 240;
export const BALL_RADIUS = 0.22;
export const FLIPPER_LENGTH = 2.28;
export type Point = readonly [number, number];
export type Segment = readonly [Point, Point];
export type PinballEvent = 'launch' | 'bumper' | 'target' | 'flipper' | 'drain' | 'save' | 'bonus' | 'nudge' | 'tilt';
export interface PinballInput { left: boolean; right: boolean; launch: boolean }
export const IDLE_INPUT: PinballInput = { left: false, right: false, launch: false };
export const BUMPERS = [
  { x: -1.25, y: 2.7, radius: 0.66, color: '#ff7248' },
  { x: 1.12, y: 2.9, radius: 0.66, color: '#71dacb' },
  { x: -0.08, y: 4.65, radius: 0.66, color: '#ffc857' },
] as const;
export const TARGETS = [
  { x: -2.85, y: 5.3 }, { x: -1.65, y: 6.6 },
  { x: 0.1, y: 6.95 }, { x: 1.8, y: 6.4 }, { x: 2.45, y: 5.05 },
] as const;
export const WALLS: readonly Segment[] = [
  [[-3.65, -7.5], [-3.65, 5.4]], [[-3.65, 5.4], [-3, 6.9]],
  [[-3, 6.9], [-1.8, 7.6]], [[-1.8, 7.6], [1.9, 7.6]],
  [[1.9, 7.6], [3.2, 6.8]], [[3.2, 6.8], [3.7, 5.5]],
  [[3.7, 5.5], [3.7, -7.5]],
  // The shooter lane opens above the divider, sending the ball into the table.
  [[2.95, -7.5], [2.95, 5.25]],
  [[-3.65, -3], [-2.65, -5.15]], [[2.95, -3], [2.65, -5.15]],
  [[2.95, -7.5], [3.7, -7.5]],
];
export const SLINGS: readonly Segment[] = [
  [[-2.85, -1.2], [-1.55, -3.75]], [[-1.55, -3.75], [-2.85, -3.25]],
  [[-2.85, -3.25], [-2.85, -1.2]],
  [[2.4, -1.2], [1.35, -3.75]], [[1.35, -3.75], [2.4, -3.25]],
  [[2.4, -3.25], [2.4, -1.2]],
];
export interface PinballState {
  phase: 'ready' | 'playing' | 'paused' | 'gameover';
  ball: { x: number; y: number; vx: number; vy: number };
  waiting: boolean;
  ballNumber: number;
  score: number;
  multiplier: number;
  time: number;
  charge: number;
  charging: boolean;
  leftAngle: number;
  rightAngle: number;
  bumperHits: number;
  bumperFlash: number[];
  targetFlash: number[];
  targets: boolean[];
  cooldowns: number[];
  slingCooldown: number;
  ballSave: number;
  nudgeHeat: number;
  nudgeCooldown: number;
  tilt: number;
  notice: string;
  noticeTime: number;
  events: PinballEvent[];
}

export function createPinball(): PinballState {
  return {
    phase: 'ready', ball: { x: 3.32, y: -6.45, vx: 0, vy: 0 },
    waiting: true, ballNumber: 1, score: 0, multiplier: 1, time: 0,
    charge: 0, charging: false, leftAngle: -0.36, rightAngle: Math.PI + 0.36,
    bumperHits: 0, bumperFlash: [0, 0, 0], targetFlash: TARGETS.map(() => 0),
    targets: TARGETS.map(() => false), cooldowns: BUMPERS.map(() => 0),
    slingCooldown: 0, ballSave: 0, nudgeHeat: 0, nudgeCooldown: 0, tilt: 0,
    notice: '발사 버튼을 길게 눌렀다 놓으세요', noticeTime: 4, events: [],
  };
}

export function startPinball(game: PinballState) {
  if (game.phase === 'gameover') Object.assign(game, createPinball());
  if (game.phase === 'ready' || game.phase === 'paused') game.phase = 'playing';
}

export function pausePinball(game: PinballState) {
  if (game.phase === 'playing') game.phase = 'paused';
  else if (game.phase === 'paused') game.phase = 'playing';
  game.charging = false;
  game.charge = 0;
}

function notice(game: PinballState, text: string) { game.notice = text; game.noticeTime = 2.4; }

export function launchBall(game: PinballState, power = 0.75) {
  if (game.phase !== 'playing' || !game.waiting) return;
  game.waiting = false;
  game.charging = false;
  game.charge = 0;
  game.ball.vx = 0;
  game.ball.vy = 19 + Math.max(0, Math.min(1, power)) * 6;
  game.ballSave = 8;
  game.events.push('launch');
  notice(game, '8초 동안 BALL SAVE');
}

export function nudge(game: PinballState) {
  if (game.phase !== 'playing' || game.waiting || game.nudgeCooldown > 0 || game.tilt > 0) return;
  game.nudgeHeat += 1;
  game.nudgeCooldown = 0.65;
  if (game.nudgeHeat >= 2.8) {
    game.tilt = 3;
    game.ballSave = 0;
    game.events.push('tilt');
    notice(game, 'TILT! 3초 동안 플리퍼가 멈춥니다');
    return;
  }
  game.ball.vy = Math.max(game.ball.vy, 0) + 4;
  game.ball.vx += game.ball.x > 0 ? -1.4 : 1.4;
  game.events.push('nudge');
  notice(game, game.nudgeHeat > 1.7 ? '조심하세요 · 한 번 더 흔들면 TILT' : '살짝 흔들기');
}

/** Resolve a sub-stepped ball against a capsule in playfield coordinates. */
function collide(game: PinballState, a: Point, b: Point, radius: number, restitution: number,
  surfaceX = 0, surfaceY = 0) {
  const ball = game.ball;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((ball.x - a[0]) * dx + (ball.y - a[1]) * dy) / lengthSq)) : 0;
  const px = a[0] + t * dx, py = a[1] + t * dy;
  const bx = ball.x - px, by = ball.y - py;
  const distance = Math.hypot(bx, by);
  const limit = BALL_RADIUS + radius;
  if (distance >= limit) return false;
  const nx = distance > 0.00001 ? bx / distance : 0;
  const ny = distance > 0.00001 ? by / distance : 1;
  ball.x += nx * (limit - distance + 0.001);
  ball.y += ny * (limit - distance + 0.001);
  const speed = (ball.vx - surfaceX) * nx + (ball.vy - surfaceY) * ny;
  if (speed >= 0) return false;
  ball.vx -= (1 + restitution) * speed * nx;
  ball.vy -= (1 + restitution) * speed * ny;
  return true;
}

function flipper(game: PinballState, left: boolean, held: boolean, dt: number) {
  const pivot: Point = [left ? -2.4 : 2.4, -4.9];
  const before = left ? game.leftAngle : game.rightAngle;
  const target = left ? (held ? 0.48 : -0.36) : Math.PI + (held ? -0.48 : 0.36);
  const angle = before + Math.max(-23 * dt, Math.min(23 * dt, target - before));
  if (left) game.leftAngle = angle; else game.rightAngle = angle;
  const tip: Point = [pivot[0] + Math.cos(angle) * FLIPPER_LENGTH, pivot[1] + Math.sin(angle) * FLIPPER_LENGTH];
  const omega = (angle - before) / dt;
  const surfaceX = -omega * (game.ball.y - pivot[1]);
  const surfaceY = omega * (game.ball.x - pivot[0]);
  if (collide(game, pivot, tip, 0.14, 0.65, surfaceX, surfaceY)) {
    if (held && Math.abs(omega) > 1) {
      game.ball.vy = Math.max(game.ball.vy, 13);
      game.ball.vx += left ? 1.7 : -1.7;
      game.events.push('flipper');
    }
  }
}

export function stepPinball(game: PinballState, input: PinballInput, dt = STEP) {
  if (game.phase !== 'playing') return;
  game.time += dt;
  game.noticeTime = Math.max(0, game.noticeTime - dt);
  game.ballSave = Math.max(0, game.ballSave - dt);
  game.tilt = Math.max(0, game.tilt - dt);
  game.nudgeHeat = Math.max(0, game.nudgeHeat - dt * 0.13);
  game.nudgeCooldown = Math.max(0, game.nudgeCooldown - dt);
  game.slingCooldown = Math.max(0, game.slingCooldown - dt);
  for (let i = 0; i < BUMPERS.length; i++) {
    game.bumperFlash[i] = Math.max(0, game.bumperFlash[i] - dt * 3);
    game.cooldowns[i] = Math.max(0, game.cooldowns[i] - dt);
  }
  for (let i = 0; i < TARGETS.length; i++) game.targetFlash[i] = Math.max(0, game.targetFlash[i] - dt * 2);

  // Flippers move while a ball is in the shooter lane, too.
  flipper(game, true, input.left && game.tilt <= 0, dt);
  flipper(game, false, input.right && game.tilt <= 0, dt);
  if (game.waiting) {
    if (input.launch) { game.charging = true; game.charge = Math.min(1, game.charge + dt * 0.8); }
    else if (game.charging) launchBall(game, game.charge);
    return;
  }

  const ball = game.ball;
  ball.vy -= 5.6 * dt;
  ball.vx *= Math.exp(-0.065 * dt);
  ball.vy *= Math.exp(-0.065 * dt);
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > 28) { ball.vx *= 28 / speed; ball.vy *= 28 / speed; }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  for (const [a, b] of WALLS) collide(game, a, b, 0.07, 0.82);
  // A one-way launch gate lets weak shots return to the plunger without losing a ball.
  if (ball.x > 3.05 && ball.y < -6.45 && ball.vy < 0) {
    Object.assign(ball, { x: 3.32, y: -6.45, vx: 0, vy: 0 });
    game.waiting = true;
    game.ballSave = 0;
    notice(game, '조금 더 길게 충전해서 발사하세요');
    return;
  }
  for (const [a, b] of SLINGS) {
    if (collide(game, a, b, 0.09, 1.08) && game.slingCooldown <= 0) {
      ball.vy = Math.max(ball.vy, 5.5);
      ball.vx += ball.x < 0 ? 2.7 : -2.7;
      game.slingCooldown = 0.14;
      game.score += 25 * game.multiplier;
      game.events.push('target');
    }
  }
  BUMPERS.forEach((bumper, i) => {
    if (!collide(game, [bumper.x, bumper.y], [bumper.x, bumper.y], bumper.radius, 1.12)) return;
    if (game.cooldowns[i] > 0) return;
    const dx = ball.x - bumper.x, dy = ball.y - bumper.y, length = Math.hypot(dx, dy) || 1;
    ball.vx += dx / length * 5;
    ball.vy += dy / length * 5;
    game.cooldowns[i] = 0.14;
    game.bumperFlash[i] = 1;
    game.bumperHits++;
    game.score += 100 * game.multiplier;
    game.events.push('bumper');
    if (game.bumperHits % 10 === 0) {
      game.multiplier = Math.min(5, game.multiplier + 1);
      game.events.push('bonus');
      notice(game, `ORBIT BOOST · 점수 ×${game.multiplier}`);
    }
  });
  TARGETS.forEach((target, i) => {
    if (!collide(game, [target.x, target.y], [target.x, target.y], 0.21, 0.9)) return;
    if (game.targetFlash[i] > 0) return;
    game.targetFlash[i] = 1;
    game.targets[i] = true;
    game.score += 250 * game.multiplier;
    game.events.push('target');
    if (game.targets.every(Boolean)) {
      game.score += 2500 * game.multiplier;
      game.targets.fill(false);
      game.events.push('bonus');
      notice(game, `ORBIT COMPLETE · +${(2500 * game.multiplier).toLocaleString()}`);
    }
  });
  if (ball.y < -8.1) {
    Object.assign(ball, { x: 3.32, y: -6.45, vx: 0, vy: 0 });
    game.waiting = true;
    game.charging = false;
    game.charge = 0;
    if (game.ballSave > 0) {
      game.events.push('save');
      notice(game, 'BALL SAVED · 다시 발사하세요');
    } else if (game.ballNumber < 3) {
      game.ballNumber++;
      game.multiplier = 1;
      game.nudgeHeat = 0;
      game.events.push('drain');
      notice(game, `BALL ${game.ballNumber} · 다시 궤도로`);
    } else {
      game.phase = 'gameover';
      game.events.push('drain');
      notice(game, '멋진 비행이었어요');
    }
  }
}
