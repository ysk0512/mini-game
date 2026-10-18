import { drawSpriteCentered } from '../../../shared/pixelSprite';
import {
  BEAM_HALF_WIDTH,
  BEAM_OPEN_TIME,
  BEAM_TIME,
  CHALLENGE_PERFECT_BONUS,
  ENEMY_COUNT,
  PLAYER_Y,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from './constants';
import { shipXs } from './engine';
import {
  BEE,
  BEE_PALETTE,
  BOSS,
  BOSS_HURT_PALETTE,
  BOSS_PALETTE,
  BUTTERFLY,
  BUTTERFLY_PALETTE,
  CAPTIVE_PALETTE,
  FIGHTER,
  FIGHTER_PALETTE,
  SPRITE_SCALE,
} from './sprites';
import type { Enemy, GalagaState } from './types';

const FONT = '"Courier New", monospace';
const STAR_COLORS = ['#f8fafc', '#fde047', '#60a5fa', '#f87171', '#a3e635'];
const STAR_COUNT = 70;
const BEAM_COLORS = ['#38bdf8', '#e0f2fe', '#6366f1'];

/** 0~1 사이의 고정 난수 (별 위치용) */
const hash = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

export function draw(ctx: CanvasRenderingContext2D, s: GalagaState) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  drawStars(ctx, s.time);

  for (const e of s.enemies) if (e.mode === 'beaming') drawBeam(ctx, e, s.time);
  for (const e of s.enemies) if (e.mode !== 'waiting') drawEnemy(ctx, e, s.time);

  const c = s.captive;
  if (c) {
    // 끌려 올라가거나 구출되어 내려올 때는 빙글빙글 돈다
    const spinning = c.state === 'rising' || c.state === 'rescued';
    const palette = c.state === 'rescued' ? FIGHTER_PALETTE : CAPTIVE_PALETTE;
    drawSpriteCentered(ctx, FIGHTER, palette, c.x, c.y, SPRITE_SCALE, spinning ? s.time * 8 : 0);
  }

  if (s.player.alive) {
    for (const x of shipXs(s.player)) drawSpriteCentered(ctx, FIGHTER, FIGHTER_PALETTE, x, PLAYER_Y - 13, SPRITE_SCALE);
  }

  ctx.fillStyle = '#fde047';
  for (const b of s.playerBullets) ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10);
  for (const b of s.enemyBullets) {
    ctx.fillStyle = '#f87171';
    ctx.fillRect(b.x - 2, b.y - 4, 4, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x - 1, b.y - 2, 2, 4);
  }

  drawExplosions(ctx, s);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = '#22d3ee';
  for (const p of s.popups) ctx.fillText(p.text, p.x, p.y);

  drawMessages(ctx, s);
}

function drawStars(ctx: CanvasRenderingContext2D, time: number) {
  for (let i = 0; i < STAR_COUNT; i++) {
    // 깜빡임
    if ((i + Math.floor(time * 3)) % 7 === 0) continue;
    const speed = 30 + (i % 3) * 30;
    const x = Math.floor(hash(i) * VIEW_WIDTH);
    const y = Math.floor((hash(i + 100) * VIEW_HEIGHT + time * speed) % VIEW_HEIGHT);
    ctx.fillStyle = STAR_COLORS[i % STAR_COLORS.length];
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number) {
  // 편대에서는 날갯짓, 비행 중에는 날개를 편 채로
  const frame = e.mode === 'formation' ? (Math.floor(time * 3 + e.id * 0.5) % 2) : 0;
  switch (e.kind) {
    case 'bee':
      drawSpriteCentered(ctx, BEE[frame], BEE_PALETTE, e.x, e.y, SPRITE_SCALE, e.angle);
      break;
    case 'butterfly':
      drawSpriteCentered(ctx, BUTTERFLY[frame], BUTTERFLY_PALETTE, e.x, e.y, SPRITE_SCALE, e.angle);
      break;
    case 'boss':
      drawSpriteCentered(ctx, BOSS[frame], e.hp > 1 ? BOSS_PALETTE : BOSS_HURT_PALETTE, e.x, e.y, SPRITE_SCALE, e.angle);
      break;
  }
}

function drawBeam(ctx: CanvasRenderingContext2D, boss: Enemy, time: number) {
  const open = Math.min(1, (BEAM_TIME - boss.beamTimer) / BEAM_OPEN_TIME);
  const top = boss.y + 14;
  const bottom = top + (PLAYER_Y + 8 - top) * open;
  ctx.globalAlpha = 0.75;
  for (let y = top; y < bottom; y += 5) {
    const t = (y - top) / (PLAYER_Y + 8 - top);
    const half = 6 + t * (BEAM_HALF_WIDTH - 6);
    ctx.fillStyle = BEAM_COLORS[Math.abs(Math.floor((y - time * 160) / 5)) % BEAM_COLORS.length];
    ctx.fillRect(boss.x - half, y, half * 2, 3);
  }
  ctx.globalAlpha = 1;
}

function drawExplosions(ctx: CanvasRenderingContext2D, s: GalagaState) {
  for (const x of s.explosions) {
    const life = x.big ? 0.9 : 0.5;
    const radius = (x.age / life) * (x.big ? 34 : 22);
    const size = x.big ? 4 : 3;
    const count = x.big ? 14 : 10;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + x.age * 2;
      ctx.fillStyle = i % 2 ? '#fff' : x.color;
      ctx.fillRect(x.x + Math.cos(a) * radius - size / 2, x.y + Math.sin(a) * radius - size / 2, size, size);
    }
  }
}

function centerText(ctx: CanvasRenderingContext2D, text: string, y: number, color: string, size = 22) {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(text, VIEW_WIDTH / 2, y);
}

function drawMessages(ctx: CanvasRenderingContext2D, s: GalagaState) {
  const mid = VIEW_HEIGHT / 2;
  switch (s.phase) {
    case 'intro':
      centerText(ctx, s.challenge ? 'CHALLENGING STAGE' : `STAGE ${s.stage}`, mid, '#22d3ee');
      break;
    case 'challengeResult': {
      const perfect = s.challengeHits === ENEMY_COUNT;
      centerText(ctx, 'NUMBER OF HITS', mid - 30, '#22d3ee');
      centerText(ctx, String(s.challengeHits), mid + 4, '#f8fafc');
      centerText(ctx, perfect ? `PERFECT!  ${CHALLENGE_PERFECT_BONUS}` : `BONUS  ${s.challengeHits * 100}`, mid + 40, '#facc15');
      break;
    }
    case 'over':
    case 'done':
      centerText(ctx, 'GAME OVER', mid, '#f87171', 28);
      break;
    case 'playing':
    case 'stageClear':
      if (s.captive?.state === 'rising') centerText(ctx, 'FIGHTER CAPTURED', mid, '#f87171');
      else if (!s.player.alive && s.lives > 0) centerText(ctx, 'READY', mid, '#22d3ee');
      break;
  }
}
