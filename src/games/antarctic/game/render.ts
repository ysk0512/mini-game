import { drawSprite, type Palette } from '../../../shared/pixelSprite';
import { COURSES, type Entity, type Game } from './engine';

export const WIDTH = 800;
export const HEIGHT = 520;
const HORIZON = 174;
const FOOT = 456;
const VIEW = 780;
const penguin = [
  '......kkkkkk......', '....kkbbbbbbkk....', '...kbbbbbbbbbkk...',
  '..kbbbbbbbbbbbbk..', '..kbbwwbbbbwwbbk..', '..kbwkwbbbbwkwbk..',
  '..kbbwwbooowwbbk..', '..kbbbbbooobbbbk..', '..kbbbwwwwwwbbbk..',
  '.kkbbwwwwwwwwbbkk.', 'kkkbbwwwwwwwwbbkkk', 'kkbbbwwwwwwwwbbbkk',
  'kkbbbwwwwwwwwbbbkk', '.kkbbwwwwwwwwbbkk.', '..kbbwwwwwwwwbbk..',
  '..kbbbwwwwwwbbbk..', '...kbbbwwwwbbbk...', '...kkbbbbbbbbkk...',
  '....kkkkkkkkkk....', '....ooo....ooo....', '...oooo....oooo...',
];
const seal = [
  '.....gggggg.....', '...ggllllllgg...', '..gllllllllllg..', '..glkllllllklg..',
  '..gllllkkllllg..', '.ggllwwwwwwllgg.', 'gggllllllllllggg', 'ggggllllllllgggg',
  '...gggggggggg...',
];
const fish = ['......yy...', '.c...yyyy..', '.cccyyyyyyk', '.ccccyyyyyy', '.c...yyyy..', '......yy...'];
const palette: Palette = { k: '#142e49', b: '#244a69', w: '#f5fdff', o: '#ffb347', g: '#506d94', l: '#92abc9', y: '#ffce64', c: '#ee9653' };

function polygon(ctx: CanvasRenderingContext2D, points: number[][], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
}

function project(x: number, z: number, distance: number, foot = FOOT) {
  const t = Math.max(0, Math.min(1.12, 1 - z / VIEW));
  const scale = 0.09 + 0.91 * t ** 1.65;
  const center = 400 + Math.sin(distance / 950) * 95 * t * (1 - t);
  return { x: center + x * (45 + 310 * t ** 1.5), y: HORIZON + t ** 2.1 * (foot - HORIZON), scale, center, half: 55 + 340 * t ** 1.5 };
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEntity(ctx: CanvasRenderingContext2D, item: Entity, game: Game, foot: number) {
  const p = project(item.x, item.z - game.distance, game.distance, foot);
  const s = p.scale;
  if (item.kind === 'hole' || item.kind === 'crack') {
    const width = item.width * 355 * s;
    ellipse(ctx, p.x, p.y + 4 * s, width + 7 * s, 18 * s, '#a6d8e9');
    ellipse(ctx, p.x, p.y, width, 14 * s, '#326583');
    ellipse(ctx, p.x, p.y - 3 * s, width - 4 * s, 9 * s, '#183e61');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - width * 0.7, p.y + 10 * s, width * 1.3, 3 * s);
  } else if (item.kind === 'seal') {
    ellipse(ctx, p.x, p.y + 2 * s, 39 * s, 12 * s, '#406e91');
    drawSprite(ctx, seal, palette, p.x - 40 * s, p.y - 43 * s, 5 * s);
  } else if (item.kind === 'fish') {
    ellipse(ctx, p.x, p.y, 18 * s, 5 * s, '#acd7e2');
    drawSprite(ctx, fish, palette, p.x - 22 * s, p.y - 35 * s + Math.sin(game.elapsed * 5 + item.id) * 4 * s, 4 * s);
  } else {
    ctx.fillStyle = '#426582';
    ctx.fillRect(p.x - 2 * s, p.y - 64 * s, 4 * s, 64 * s);
    polygon(ctx, [[p.x, p.y - 64 * s], [p.x + 37 * s, p.y - 58 * s], [p.x, p.y - 37 * s]], '#ef7280');
    ctx.fillStyle = '#fff4dc';
    ctx.fillRect(p.x + 6 * s, p.y - 56 * s, 9 * s, 9 * s);
  }
}

export function draw(ctx: CanvasRenderingContext2D, game: Game, height = HEIGHT) {
  const course = COURSES[game.stage];
  const foot = height - 64;
  const projectAt = (x: number, z: number) => project(x, z, game.distance, foot);
  ctx.clearRect(0, 0, WIDTH, height);
  ctx.fillStyle = course.sky;
  ctx.fillRect(0, 0, WIDTH, height);
  if (game.stage === 3) {
    for (let i = 0; i < 38; i++) {
      ctx.fillStyle = i % 3 ? '#b7d8e8' : '#fff4dc';
      ctx.fillRect((i * 137 + 31) % 800, (i * 43 + 17) % 140, 2, 2);
    }
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.12;
      polygon(ctx, [[70 + i * 25, 0], [330 + i * 35, 65], [640 + i * 15, 0], [530 + i * 20, 95], [280, 105]], '#71ffd5');
    }
    ctx.globalAlpha = 1;
  }
  ellipse(ctx, 661, 68, 27, 27, game.stage === 3 ? '#f2efca' : '#fff2ce');
  for (let i = 0; i < 4; i++) {
    const x = (i * 235 + 40 - game.distance * 0.015 + 900) % 1000 - 100;
    ctx.fillStyle = game.stage === 3 ? '#536482' : '#e5f5f5';
    ctx.fillRect(x, 54 + i % 2 * 30, 75, 12);
    ctx.fillRect(x + 17, 43 + i % 2 * 30, 39, 17);
  }
  for (let i = 0; i < 8; i++) {
    const x = i * 130 - 60;
    const peak = 92 + (i % 3) * 17;
    polygon(ctx, [[x - 90, 186], [x + 50, peak], [x + 160, 186]], '#80aecb');
    polygon(ctx, [[x + 50, peak], [x + 160, 186], [x + 68, 173]], '#b5dce7');
    polygon(ctx, [[x + 50, peak], [x + 17, peak + 24], [x + 50, peak + 18], [x + 73, peak + 28]], '#eefaff');
  }
  ctx.fillStyle = '#438fae';
  ctx.fillRect(0, HORIZON, WIDTH, height - HORIZON);
  // Ground strips and shoreline move through the same projection as obstacles.
  for (let i = 0; i < 64; i++) {
    const z1 = VIEW - i / 64 * (VIEW + 80);
    const z2 = VIEW - (i + 1) / 64 * (VIEW + 80);
    const a = projectAt(0, z1);
    const b = projectAt(0, z2);
    const stripe = Math.floor((game.distance + z1) / 85) % 2 === 0;
    polygon(ctx, [[a.center - a.half - 15, a.y], [a.center + a.half + 15, a.y], [b.center + b.half + 15, b.y], [b.center - b.half - 15, b.y]], '#acdfea');
    polygon(ctx, [[a.center - a.half, a.y], [a.center + a.half, a.y], [b.center + b.half, b.y], [b.center - b.half, b.y]], stripe ? '#edf9fa' : '#e4f3f6');
  }
  for (let i = 0; i < 24; i++) {
    const z = ((i * 83 - game.distance) % VIEW + VIEW) % VIEW;
    const p = projectAt(Math.sin(i * 17) * 0.92, z);
    ctx.fillStyle = '#c8e5ed';
    ctx.fillRect(p.x, p.y, 14 * p.scale, 2 * p.scale);
  }
  // A finish arch grows from the horizon as the base approaches.
  const remaining = course.length - game.distance;
  if (remaining < VIEW) {
    const p = projectAt(0, remaining);
    const s = p.scale;
    ctx.fillStyle = '#335c7c';
    ctx.fillRect(p.x - 250 * s, p.y - 155 * s, 10 * s, 155 * s);
    ctx.fillRect(p.x + 240 * s, p.y - 155 * s, 10 * s, 155 * s);
    ctx.fillStyle = '#f7b96d';
    ctx.fillRect(p.x - 250 * s, p.y - 155 * s, 500 * s, 40 * s);
    ctx.fillStyle = '#274965';
    ctx.font = `bold ${Math.max(6, 22 * s)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ANTARCTIC BASE', p.x, p.y - 128 * s);
  }
  const visible = game.entities.filter(e => !e.done && e.z - game.distance > -70 && e.z - game.distance < VIEW).sort((a, b) => b.z - a.z);
  for (const item of visible) if (item.z >= game.distance) drawEntity(ctx, item, game, foot);

  const px = projectAt(game.x, 0).x;
  const bob = game.status === 'playing' && game.height === 0 ? Math.sin(game.elapsed * 22) * 2 : 0;
  ellipse(ctx, px, foot + 3, 28 - game.height * 6, 8 - game.height * 2, '#8ab8ce');
  if (game.invincible === 0 || Math.floor(game.elapsed * 12) % 2 === 0) {
    ctx.save();
    ctx.translate(px, foot - game.height * 80 + bob);
    if (game.stumble > 0) ctx.rotate(Math.sin(game.elapsed * 20) * 0.3);
    drawSprite(ctx, penguin, palette, -31.5, -73.5, 3.5);
    // A little expedition scarf and alternating feet give the runner a silhouette.
    ctx.fillStyle = '#ef7280';
    ctx.fillRect(-18, -44, 38, 7);
    ctx.fillRect(15, -39, 7, 14);
    if (game.height === 0 && game.status === 'playing') {
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(Math.sin(game.elapsed * 22) > 0 ? -22 : 8, -4, 15, 6);
    }
    ctx.restore();
  }
  for (const item of visible) if (item.z < game.distance) drawEntity(ctx, item, game, foot);

  ctx.textAlign = 'left';
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = game.stage === 3 ? '#c2d8e8' : '#315c78';
  ctx.fillText(`SECTOR 0${game.stage + 1} / ANTARCTIC EXPEDITION`, 24, 28);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.max(0, Math.ceil(remaining))} m TO BASE`, 776, 28);
  if (game.messageTime > 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px system-ui';
    ctx.fillStyle = '#214763';
    ctx.fillText(game.message, 400, foot - 126);
  }
  if (game.height > 0.1) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 40, foot - 22, 4, 12);
    ctx.fillRect(px + 36, foot - 32, 4, 12);
  }
}
