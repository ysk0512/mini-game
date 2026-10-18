export const COURSES = [
  { name: '해안 기지', subtitle: '첫 발자국', length: 3200, time: 43, speed: 110, sky: '#78cbe4' },
  { name: '빙하 계곡', subtitle: '얼음 사이로', length: 4000, time: 46, speed: 122, sky: '#9bb8ea' },
  { name: '노을 설원', subtitle: '해가 지기 전에', length: 4800, time: 49, speed: 134, sky: '#e8acb8' },
  { name: '오로라 기지', subtitle: '마지막 탐험', length: 5600, time: 52, speed: 146, sky: '#263963' },
] as const;

export type Status = 'ready' | 'playing' | 'paused' | 'clear' | 'gameOver' | 'victory';
export type Kind = 'hole' | 'seal' | 'crack' | 'fish' | 'flag';
export interface Entity { id: number; kind: Kind; x: number; z: number; width: number; done: boolean }
export interface Input { left: boolean; right: boolean; jump: boolean }
export type GameEvent = 'jump' | 'fish' | 'flag' | 'hit' | 'clear' | 'gameOver';
export interface Game {
  status: Status; stage: number; distance: number; time: number; score: number;
  lives: number; fish: number; x: number; height: number; vy: number;
  elapsed: number; invincible: number; stumble: number; bonus: number;
  entities: Entity[]; message: string; messageTime: number;
}

// Fixed courses make retries learnable. Every obstacle row leaves an open path.
export function makeCourse(stage: number): Entity[] {
  const entities: Entity[] = [];
  const lanes = [-0.66, 0, 0.66];
  const add = (kind: Kind, x: number, z: number, width: number) =>
    entities.push({ id: entities.length, kind, x, z, width, done: false });
  let row = 0;
  for (let z = 430; z < COURSES[stage].length - 350; z += 175 - stage * 12) {
    const lane = (row * 2 + Math.floor(row / 3) + stage) % 3;
    const kind: Kind = row % 5 === 3 ? 'crack' : row % 3 === 1 ? 'seal' : 'hole';
    add(kind, lanes[lane], z, kind === 'crack' ? 0.43 : 0.25);
    if (stage > 0 && row % 4 === 2) add('hole', lanes[(lane + 1) % 3], z, 0.25);
    add('fish', lanes[(lane + 2) % 3], z + 65, 0.22);
    if (row % 6 === 4) add('flag', lanes[(lane + 1) % 3], z + 110, 0.22);
    row++;
  }
  add('fish', 0, 210, 0.22);
  return entities.sort((a, b) => a.z - b.z);
}

export function createGame(): Game {
  return {
    status: 'ready', stage: 0, distance: 0, time: COURSES[0].time, score: 0,
    lives: 3, fish: 0, x: 0, height: 0, vy: 0, elapsed: 0,
    invincible: 0, stumble: 0, bonus: 0, entities: makeCourse(0), message: '', messageTime: 0,
  };
}

export function nextCourse(game: Game) {
  if (game.status !== 'clear' || game.stage >= COURSES.length - 1) return;
  game.stage++;
  Object.assign(game, {
    status: 'playing', distance: 0, time: COURSES[game.stage].time,
    x: 0, height: 0, vy: 0, invincible: 0, stumble: 0, bonus: 0,
    entities: makeCourse(game.stage), message: '', messageTime: 0,
  });
}

export function update(game: Game, dt: number, input: Input): GameEvent[] {
  const events: GameEvent[] = [];
  if (game.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return events;
  dt = Math.min(dt, 1 / 30);
  game.elapsed += dt;
  game.time = Math.max(0, game.time - dt);
  game.invincible = Math.max(0, game.invincible - dt);
  game.messageTime = Math.max(0, game.messageTime - dt);
  if (game.time === 0) {
    game.status = 'gameOver';
    game.message = '시간이 다 되었어요';
    return ['gameOver'];
  }
  if (game.stumble > 0) {
    game.stumble = Math.max(0, game.stumble - dt);
    return events;
  }
  game.x = Math.max(-0.94, Math.min(0.94, game.x + (Number(input.right) - Number(input.left)) * 1.8 * dt));
  if (input.jump && game.height === 0) {
    game.vy = 4.8;
    events.push('jump');
  }
  game.height = Math.max(0, game.height + game.vy * dt - 5.4 * dt * dt);
  game.vy = game.height > 0 ? game.vy - 10.8 * dt : 0;
  const previous = game.distance;
  game.distance = Math.min(COURSES[game.stage].length, game.distance + COURSES[game.stage].speed * dt);
  for (const item of game.entities) {
    if (item.done || item.z + 15 < previous || item.z - 15 > game.distance) continue;
    if (Math.abs(item.x - game.x) > item.width + 0.09) continue;
    if (item.kind === 'fish' || item.kind === 'flag') {
      item.done = true;
      const isFish = item.kind === 'fish';
      game.score += isFish ? 100 : 250;
      if (isFish) game.fish++;
      else game.time += 2;
      game.message = isFish ? '물고기 +100' : '깃발 +250 · 시간 +2초';
      game.messageTime = 1.2;
      events.push(item.kind);
    } else if (game.height < (item.kind === 'seal' ? 0.48 : 0.28) && game.invincible === 0) {
      item.done = true;
      game.lives--;
      game.stumble = 0.8;
      game.invincible = 2.4;
      game.height = 0;
      game.vy = 0;
      game.message = item.kind === 'seal' ? '앗, 물개! 조심해요' : '풍덩! 얼음 구멍을 조심해요';
      game.messageTime = 1.5;
      events.push('hit');
      if (game.lives <= 0) {
        game.status = 'gameOver';
        events.push('gameOver');
      }
      break;
    }
  }
  if (game.status === 'playing' && game.distance >= COURSES[game.stage].length) {
    game.bonus = Math.ceil(game.time) * 50 + 500;
    game.score += game.bonus;
    game.status = game.stage === COURSES.length - 1 ? 'victory' : 'clear';
    events.push('clear');
  }
  return events;
}
