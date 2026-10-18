import {
  BALL_RADIUS,
  BALL_TOP,
  FLOOR_Y,
  GOAL_AREA,
  HANG_LENGTH,
  MARKER_SPACING,
  PLATFORM_TOP,
  POT_HALF_WIDTH,
  PX_PER_METER,
  RIDER_BOTTOM,
  RING_BOTTOM,
  RING_TOP,
  ROPE_Y,
  START_PLATFORM_END,
  TRAPEZE_ANCHOR_Y,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from './constants';
import { displayBonus, STAGES } from './engine';
import {
  BLUE_MONKEY_PALETTE,
  BROWN_MONKEY_PALETTE,
  CHARLIE_ARMS_UP,
  CHARLIE_PALETTE,
  CHARLIE_STAND,
  CHARLIE_WALK,
  drawSprite,
  LION_PALETTE,
  LION_RUN,
  LION_STAND,
  MONKEY,
  MONKEY_WALK,
  type Sprite,
} from './sprites';
import { barPosition, TRAPEZE_GOAL_X } from './stages/trapeze';
import type { BallLevel, CircusState, LionLevel, Player, Ring, RopeLevel, StageKind, TrapezeLevel } from './types';

const FONT = '"Courier New", monospace';
const AUDIENCE_COLORS = ['#f87171', '#fbbf24', '#60a5fa', '#a3e635', '#f472b6', '#e2e8f0'];
const BALL_COLORS = ['#ef4444', '#3b82f6', '#22c55e'];

export function draw(ctx: CanvasRenderingContext2D, s: CircusState) {
  const kind = s.level.kind;
  drawBackground(ctx, s, kind);

  ctx.save();
  ctx.translate(-Math.round(s.cameraX), 0);
  switch (s.level.kind) {
    case 'lion':
      drawLionStage(ctx, s, s.level);
      break;
    case 'rope':
      drawRopeStage(ctx, s, s.level);
      break;
    case 'balls':
      drawBallStage(ctx, s, s.level);
      break;
    case 'trapeze':
      drawTrapezeStage(ctx, s, s.level);
      break;
  }
  ctx.restore();

  drawBanner(ctx, s);
}

// ---------- 배경 ----------

function drawBackground(ctx: CanvasRenderingContext2D, s: CircusState, kind: StageKind) {
  ctx.fillStyle = '#14061f';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  // 천막 줄무늬 (먼 배경일수록 천천히 움직인다)
  const stripe = 40;
  const tentOffset = -((s.cameraX * 0.2) % (stripe * 2));
  for (let x = tentOffset - stripe * 2; x < VIEW_WIDTH + stripe; x += stripe) {
    const odd = Math.round((x - tentOffset) / stripe) % 2 === 0;
    ctx.fillStyle = odd ? '#b91c1c' : '#f5f5f4';
    ctx.fillRect(x, 0, stripe, 36);
    ctx.beginPath();
    ctx.arc(x + stripe / 2, 36, stripe / 2, 0, Math.PI);
    ctx.fill();
  }

  // 관중석
  const standsTop = 90;
  const standsBottom = kind === 'trapeze' ? VIEW_HEIGHT : kind === 'rope' ? 410 : FLOOR_Y - 40;
  const crowdOffset = -((s.cameraX * 0.5) % 18);
  for (let row = 0, y = standsTop; y < standsBottom - 10; row++, y += 22) {
    ctx.fillStyle = row % 2 ? '#2a0f3d' : '#341450';
    ctx.fillRect(0, y, VIEW_WIDTH, 22);
    for (let col = -1, x = crowdOffset + (row % 2) * 9; x < VIEW_WIDTH + 18; col++, x += 18) {
      const seed = Math.abs((col + Math.floor(s.cameraX * 0.5 / 18)) * 7 + row * 13);
      ctx.fillStyle = AUDIENCE_COLORS[seed % AUDIENCE_COLORS.length];
      const cheer = Math.sin(s.time * 6 + seed) > 0.75 ? -3 : 0;
      ctx.fillRect(Math.round(x), y + 8 + cheer, 8, 8);
    }
  }

  if (kind === 'trapeze') {
    // 떨어지면 끝인 아래쪽을 어둡게
    const pit = ctx.createLinearGradient(0, VIEW_HEIGHT - 120, 0, VIEW_HEIGHT);
    pit.addColorStop(0, 'rgba(0, 0, 0, 0)');
    pit.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = pit;
    ctx.fillRect(0, VIEW_HEIGHT - 120, VIEW_WIDTH, 120);
  } else {
    // 관중석 앞 난간
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, standsBottom, VIEW_WIDTH, 40);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, standsBottom, VIEW_WIDTH, 4);
  }

  // 바닥
  if (kind === 'lion' || kind === 'balls') {
    ctx.fillStyle = '#c2884a';
    ctx.fillRect(0, FLOOR_Y, VIEW_WIDTH, VIEW_HEIGHT - FLOOR_Y);
    ctx.fillStyle = '#a8703a';
    ctx.fillRect(0, FLOOR_Y, VIEW_WIDTH, 4);
  } else if (kind === 'rope') {
    ctx.fillStyle = '#c2884a';
    ctx.fillRect(0, 450, VIEW_WIDTH, VIEW_HEIGHT - 450);
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, length: number, y: number) {
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let m = MARKER_SPACING; m < length; m += MARKER_SPACING) {
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(m - 24, y, 48, 22);
    ctx.fillStyle = '#7f1d1d';
    ctx.fillText(`${(length - m) / PX_PER_METER}m`, m, y + 12);
  }
}

function drawGoalFlag(ctx: CanvasRenderingContext2D, x: number, baseY: number) {
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(x + 40, baseY - 140, 4, 140);
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(x + 44, baseY - 140);
  ctx.lineTo(x + 100, baseY - 124);
  ctx.lineTo(x + 44, baseY - 108);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('GOAL', x + 50, baseY - 123);
}

/** 빨강·흰색 줄무늬 단상 */
function drawPodium(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, bottom: number) {
  for (let i = 0; i * 20 < w; i++) {
    ctx.fillStyle = i % 2 ? '#f5f5f4' : '#dc2626';
    ctx.fillRect(x + i * 20, top, Math.min(20, w - i * 20), bottom - top);
  }
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x, top, w, 5);
}

// ---------- 찰리 ----------

const blinking = (s: CircusState) => s.phase === 'dying' && s.deathCause === 'hit' && Math.floor(s.time * 12) % 2 === 0;

function charlieSprite(p: Player): Sprite {
  if (!p.grounded) return CHARLIE_STAND;
  return Math.floor(p.anim * 8) % 2 ? CHARLIE_WALK : CHARLIE_STAND;
}

function drawCharlie(ctx: CanvasRenderingContext2D, s: CircusState, feetY = s.player.y, sprite = charlieSprite(s.player)) {
  if (blinking(s)) return;
  drawSprite(ctx, sprite, CHARLIE_PALETTE, s.player.x - 15, feetY - 48);
}

// ---------- 1. 사자 ----------

function drawRingHalf(ctx: CanvasRenderingContext2D, ring: Ring, front: boolean, time: number) {
  const cy = (RING_TOP + RING_BOTTOM) / 2;
  const ry = (RING_BOTTOM - RING_TOP) / 2;
  const from = front ? Math.PI / 2 : -Math.PI / 2;
  const to = front ? Math.PI * 1.5 : Math.PI / 2;
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ea580c';
  ctx.beginPath();
  ctx.ellipse(ring.x, cy, 16, ry, 0, from, to);
  ctx.stroke();
  // 일렁이는 불꽃
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#fde047';
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -time * 60;
  ctx.beginPath();
  ctx.ellipse(ring.x, cy, 16, ry, 0, from, to);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPot(ctx: CanvasRenderingContext2D, x: number, time: number) {
  const w = POT_HALF_WIDTH * 2;
  ctx.fillStyle = '#92400e';
  ctx.fillRect(x - POT_HALF_WIDTH, FLOOR_Y - 20, w, 20);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - POT_HALF_WIDTH - 2, FLOOR_Y - 22, w + 4, 4);
  for (let i = 0; i < 3; i++) {
    const h = 8 + Math.abs(Math.sin(time * 14 + x + i * 2)) * 8;
    ctx.fillStyle = i === 1 ? '#fde047' : '#f97316';
    ctx.fillRect(x - POT_HALF_WIDTH + 1 + i * 6, FLOOR_Y - 22 - h, 6, h);
  }
}

function drawLionStage(ctx: CanvasRenderingContext2D, s: CircusState, level: LionLevel) {
  const length = STAGES[s.stage].length;
  drawMarkers(ctx, length, FLOOR_Y + 30);
  drawPodium(ctx, length, FLOOR_Y - 6, GOAL_AREA, FLOOR_Y);
  drawGoalFlag(ctx, length + 100, FLOOR_Y - 6);

  for (const pot of level.pots) drawPot(ctx, pot.x, s.time);
  for (const ring of level.rings) drawRingHalf(ctx, ring, false, s.time);

  const p = s.player;
  if (!blinking(s)) {
    const running = p.grounded && p.vx !== 0 && Math.floor(p.anim * 8) % 2 === 1;
    drawSprite(ctx, running || !p.grounded ? LION_RUN : LION_STAND, LION_PALETTE, p.x - 30, p.y - 36);
  }
  drawCharlie(ctx, s, p.y - RIDER_BOTTOM + 4, CHARLIE_STAND);

  for (const ring of level.rings) drawRingHalf(ctx, ring, true, s.time);
}

// ---------- 2. 외줄 ----------

function drawRopeStage(ctx: CanvasRenderingContext2D, s: CircusState, level: RopeLevel) {
  const length = STAGES[s.stage].length;
  // 줄을 받치는 기둥
  ctx.fillStyle = '#78716c';
  for (let m = MARKER_SPACING; m < length; m += MARKER_SPACING) ctx.fillRect(m - 3, ROPE_Y, 6, 450 - ROPE_Y);
  drawMarkers(ctx, length, ROPE_Y + 40);

  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, ROPE_Y + 1);
  ctx.lineTo(length, ROPE_Y + 1);
  ctx.stroke();
  drawPodium(ctx, length, ROPE_Y, GOAL_AREA, 450);
  drawGoalFlag(ctx, length + 100, ROPE_Y);

  for (const m of level.monkeys) {
    const walking = m.y >= ROPE_Y && Math.floor(s.time * 8 + m.x) % 2 === 0;
    drawSprite(ctx, walking ? MONKEY_WALK : MONKEY, m.blue ? BLUE_MONKEY_PALETTE : BROWN_MONKEY_PALETTE, m.x - 12, m.y - 30);
  }
  drawCharlie(ctx, s);
}

// ---------- 3. 공 ----------

function drawBall(ctx: CanvasRenderingContext2D, x: number, id: number) {
  const cy = FLOOR_Y - BALL_RADIUS;
  const rot = x / BALL_RADIUS;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#f8fafc' : BALL_COLORS[id % BALL_COLORS.length];
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.arc(x, cy, BALL_RADIUS, rot + (i * Math.PI) / 3, rot + ((i + 1) * Math.PI) / 3);
    ctx.fill();
  }
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, cy, BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBallStage(ctx: CanvasRenderingContext2D, s: CircusState, level: BallLevel) {
  const length = STAGES[s.stage].length;
  drawMarkers(ctx, length, FLOOR_Y + 30);
  drawPodium(ctx, length, BALL_TOP, GOAL_AREA, FLOOR_Y);
  drawGoalFlag(ctx, length + 100, BALL_TOP);
  for (const b of level.balls) drawBall(ctx, b.x, b.id);
  drawCharlie(ctx, s);
}

// ---------- 4. 공중그네 ----------

function drawTrapezeStage(ctx: CanvasRenderingContext2D, s: CircusState, level: TrapezeLevel) {
  ctx.fillStyle = '#44403c';
  ctx.fillRect(0, TRAPEZE_ANCHOR_Y - 8, TRAPEZE_GOAL_X + GOAL_AREA, 8);

  drawPodium(ctx, 0, PLATFORM_TOP, START_PLATFORM_END, VIEW_HEIGHT);
  drawPodium(ctx, TRAPEZE_GOAL_X, PLATFORM_TOP, GOAL_AREA, VIEW_HEIGHT);
  drawGoalFlag(ctx, TRAPEZE_GOAL_X + 100, PLATFORM_TOP);

  for (const t of level.trapezes) {
    const bar = barPosition(t, s.time);
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.ax - 2, t.ay);
    ctx.lineTo(bar.x - 16, bar.y);
    ctx.moveTo(t.ax + 2, t.ay);
    ctx.lineTo(bar.x + 16, bar.y);
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(bar.x - 18, bar.y - 3, 36, 6);
    ctx.fillStyle = '#78716c';
    ctx.fillRect(t.ax - 5, t.ay - 4, 10, 6);
  }

  const airborne = level.holding !== null || (!level.standing && !s.player.grounded);
  if (airborne) drawCharlie(ctx, s, s.player.y - HANG_LENGTH + 50, CHARLIE_ARMS_UP);
  else drawCharlie(ctx, s);
}

// ---------- 안내 문구 ----------

function drawBanner(ctx: CanvasRenderingContext2D, s: CircusState) {
  let title: string;
  let subtitle: string;
  if (s.phase === 'intro') {
    title = `STAGE ${s.stage + 1}`;
    subtitle = STAGES[s.stage].name;
  } else if (s.phase === 'clear') {
    title = 'STAGE CLEAR!';
    subtitle = `BONUS ${displayBonus(s)}`;
  } else {
    return;
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(VIEW_WIDTH / 2 - 190, 120, 380, 100);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#facc15';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText(title, VIEW_WIDTH / 2, 155);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(subtitle, VIEW_WIDTH / 2, 195);
}
