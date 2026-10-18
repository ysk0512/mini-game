import { BALL_RADIUS, CANVAS_HEIGHT, CANVAS_WIDTH, POWERUP_HEIGHT, POWERUP_WIDTH } from './constants';
import { paddleRect } from './engine';
import type { GameState, PowerUpType } from './types';

const BRICK_COLORS = ['', '#4ade80', '#facc15', '#f87171'];
const UNBREAKABLE_COLOR = '#64748b';

export const POWERUP_STYLES: Record<PowerUpType, { color: string; label: string }> = {
  expand: { color: '#60a5fa', label: 'E' },
  multiball: { color: '#c084fc', label: 'M' },
  slow: { color: '#22d3ee', label: 'S' },
  life: { color: '#f472b6', label: '♥' },
};

export function draw(ctx: CanvasRenderingContext2D, state: GameState, showLaunchHint: boolean) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  for (const brick of state.bricks) {
    ctx.fillStyle = brick.unbreakable ? UNBREAKABLE_COLOR : BRICK_COLORS[brick.hp];
    ctx.beginPath();
    ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 4);
    ctx.fill();
    if (brick.unbreakable) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of state.powerUps) {
    const style = POWERUP_STYLES[p.type];
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.roundRect(p.x - POWERUP_WIDTH / 2, p.y - POWERUP_HEIGHT / 2, POWERUP_WIDTH, POWERUP_HEIGHT, 8);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(style.label, p.x, p.y + 1);
  }

  const paddle = paddleRect(state);
  ctx.fillStyle = state.effects.expand > 0 ? '#60a5fa' : '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 7);
  ctx.fill();

  ctx.fillStyle = state.effects.slow > 0 ? '#22d3ee' : '#ffffff';
  for (const ball of state.balls) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  if (showLaunchHint && state.balls.some((b) => b.stuck)) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText('Space 또는 클릭으로 발사', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80);
  }
}
