import {
  BEAM_HALF_WIDTH,
  BEAM_OPEN_TIME,
  BEAM_STOP_Y,
  BEAM_TIME,
  CAPTIVE_OFFSET_Y,
  CAPTIVE_RISE_SPEED,
  CHALLENGE_HIT_SCORE,
  CHALLENGE_PERFECT_BONUS,
  CHALLENGE_RESULT_TIME,
  DIVE_BASE_SPEED,
  DIVE_SPEED_PER_STAGE,
  DUAL_OFFSET,
  ENEMY_BULLET_SPEED,
  ENEMY_COUNT,
  ENEMY_RADIUS,
  EXTRA_LIFE_SCORES,
  FIRE_COOLDOWN,
  GAME_OVER_DELAY,
  INITIAL_LIVES,
  INTRO_TIME,
  MAX_PLAYER_SHOTS,
  PLAYER_BULLET_SPEED,
  PLAYER_SPEED,
  PLAYER_Y,
  RESCUE_SPEED,
  RESPAWN_TIME,
  SCORES,
  SHIP_HALF_WIDTH,
  SHIP_HEIGHT,
  SLOT_SPEED,
  STAGE_CLEAR_TIME,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from './constants';
import { slotPosition } from './formation';
import { buildPath, headingOf, pointAt, translate, type Vec } from './path';
import type { Bullet, Enemy, GalagaEvent, GalagaState, Input, Player } from './types';
import { buildStageEnemies, isChallengeStage } from './waves';

export type Rng = () => number;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** -π ~ π 로 정규화 */
const normalizeAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 스테이지가 오를수록 공격이 거세진다 */
export function difficulty(stage: number) {
  return {
    diveInterval: Math.max(0.7, 2.6 - 0.18 * stage),
    maxDivers: Math.min(6, 2 + Math.floor(stage / 2)),
    diveShots: stage >= 2 ? 2 : 1,
    entryFireChance: Math.min(0.4, 0.06 * stage),
    diveSpeed: DIVE_BASE_SPEED + DIVE_SPEED_PER_STAGE * stage,
  };
}

export const shipXs = (p: Player) => (p.dual ? [p.x - DUAL_OFFSET, p.x + DUAL_OFFSET] : [p.x]);

const isAttacking = (e: Enemy) => e.mode === 'diving' || e.mode === 'beaming';

export function createGalaga(): GalagaState {
  const s: GalagaState = {
    stage: 1,
    challenge: false,
    score: 0,
    lives: INITIAL_LIVES,
    phase: 'intro',
    phaseTimer: INTRO_TIME,
    time: 0,
    stageTime: 0,
    assembled: false,
    formationTime: 0,
    diveTimer: 0,
    player: { x: VIEW_WIDTH / 2, alive: true, dual: false, respawnTimer: 0, fireCooldown: 0 },
    enemies: [],
    playerBullets: [],
    enemyBullets: [],
    captive: null,
    explosions: [],
    popups: [],
    nextEnemyId: 1,
    shots: 0,
    hits: 0,
    challengeHits: 0,
    extraLivesGiven: 0,
    sounds: [],
  };
  startStage(s, 1);
  return s;
}

export function startStage(s: GalagaState, stage: number) {
  s.stage = stage;
  s.challenge = isChallengeStage(stage);
  s.enemies = buildStageEnemies(s.challenge, s.nextEnemyId);
  s.nextEnemyId += s.enemies.length;
  s.playerBullets = [];
  s.enemyBullets = [];
  if (s.captive?.state === 'leaving') s.captive = null;
  s.phase = 'intro';
  s.phaseTimer = INTRO_TIME;
  s.stageTime = 0;
  s.assembled = false;
  s.formationTime = 0;
  s.diveTimer = difficulty(stage).diveInterval + 1;
  s.challengeHits = 0;
  if (!s.player.alive && s.lives > 0) respawnPlayer(s);
  s.sounds.push('stageStart');
}

function respawnPlayer(s: GalagaState) {
  const p = s.player;
  p.alive = true;
  p.dual = false;
  p.x = VIEW_WIDTH / 2;
  p.respawnTimer = 0;
  s.enemyBullets = [];
}

/**
 * 게임을 dt초만큼 진행한다. state를 직접 변경하며 게임 종료 이벤트를 반환한다.
 */
export function update(s: GalagaState, dt: number, input: Input, rng: Rng = Math.random): GalagaEvent[] {
  s.time += dt;
  updateEffects(s, dt);

  switch (s.phase) {
    case 'intro':
      updatePlayer(s, dt, input);
      updateBullets(s, dt);
      s.phaseTimer -= dt;
      if (s.phaseTimer <= 0) s.phase = 'playing';
      break;

    case 'playing':
      s.stageTime += dt;
      s.formationTime += dt;
      updatePlayer(s, dt, input);
      updateEnemies(s, dt, rng);
      if (!s.challenge) scheduleDives(s, dt, rng);
      updateCaptive(s, dt);
      updateBullets(s, dt);
      handleCollisions(s);
      checkExtraLife(s);
      updateRespawn(s, dt);
      checkStageEnd(s);
      break;

    case 'stageClear':
    case 'challengeResult':
      updatePlayer(s, dt, input);
      updateBullets(s, dt);
      s.phaseTimer -= dt;
      if (s.phaseTimer <= 0) startStage(s, s.stage + 1);
      break;

    case 'over':
      s.formationTime += dt;
      updateEnemies(s, dt, rng);
      updateBullets(s, dt);
      s.phaseTimer -= dt;
      if (s.phaseTimer <= 0) {
        s.phase = 'done';
        return ['gameOver'];
      }
      break;

    case 'done':
      break;
  }
  return [];
}

// ---------- 플레이어 ----------

function updatePlayer(s: GalagaState, dt: number, input: Input) {
  const p = s.player;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  if (!p.alive) return;

  const half = (p.dual ? DUAL_OFFSET : 0) + SHIP_HALF_WIDTH + 4;
  p.x = clamp(p.x + (Number(input.right) - Number(input.left)) * PLAYER_SPEED * dt, half, VIEW_WIDTH - half);

  const ships = shipXs(p);
  if (input.fire && p.fireCooldown === 0 && s.playerBullets.length < MAX_PLAYER_SHOTS * ships.length) {
    for (const x of ships) s.playerBullets.push({ x, y: PLAYER_Y - SHIP_HEIGHT, vx: 0, vy: -PLAYER_BULLET_SPEED });
    s.shots += ships.length;
    p.fireCooldown = FIRE_COOLDOWN;
    s.sounds.push('shoot');
  }
}

function updateRespawn(s: GalagaState, dt: number) {
  const p = s.player;
  if (p.alive || s.phase !== 'playing' || s.captive?.state === 'rising') return;
  p.respawnTimer -= dt;
  // 원작처럼 급강하 중인 적이 모두 돌아간 뒤에 부활한다
  if (p.respawnTimer <= 0 && !s.enemies.some(isAttacking)) respawnPlayer(s);
}

function checkExtraLife(s: GalagaState) {
  const next = EXTRA_LIFE_SCORES[s.extraLivesGiven];
  if (next !== undefined && s.score >= next) {
    s.lives++;
    s.extraLivesGiven++;
    s.sounds.push('extraLife');
  }
}

// ---------- 적 ----------

/** 경로를 따라 이동. 끝까지 갔으면 true */
function followPath(e: Enemy, dt: number) {
  if (!e.path) return true;
  e.distance += e.speed * dt;
  const pt = pointAt(e.path, e.distance);
  e.x = pt.x;
  e.y = pt.y;
  e.angle = pt.angle;
  return e.distance >= e.path.length;
}

/** 편대 자리로 이동. 도착했으면 true */
function moveToSlot(s: GalagaState, e: Enemy, dt: number) {
  if (!e.slot) return true;
  const target = slotPosition(e.slot, s.formationTime, s.assembled);
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const dist = Math.hypot(dx, dy);
  const step = SLOT_SPEED * dt;
  if (dist <= step) {
    e.x = target.x;
    e.y = target.y;
    return true;
  }
  e.x += (dx / dist) * step;
  e.y += (dy / dist) * step;
  if (dist > 4) e.angle = headingOf(dx, dy);
  return false;
}

function updateEnemies(s: GalagaState, dt: number, rng: Rng) {
  const d = difficulty(s.stage);
  const finished = new Set<Enemy>();

  for (const e of s.enemies) {
    switch (e.mode) {
      case 'waiting':
        if (s.stageTime < e.spawnAt) break;
        e.mode = s.challenge ? 'challenge' : 'entering';
        e.distance = 0;
        followPath(e, 0);
        if (!s.challenge && rng() < d.entryFireChance) {
          e.shotsLeft = 1;
          e.fireTimer = 0.6 + rng() * 1.2;
        }
        break;

      case 'entering':
        if (followPath(e, dt)) e.mode = 'toSlot';
        break;

      case 'challenge':
        if (followPath(e, dt)) finished.add(e);
        break;

      case 'diving':
        if (!followPath(e, dt)) break;
        if (e.beamDive) {
          e.mode = 'beaming';
          e.beamTimer = BEAM_TIME;
          e.angle = Math.PI;
          s.sounds.push('beam');
        } else if (e.slot) {
          // 화면 아래로 빠져나갔으면 위에서 다시 들어와 제자리로
          e.x = slotPosition(e.slot, s.formationTime, s.assembled).x;
          e.y = -30;
          e.mode = 'toSlot';
        }
        break;

      case 'beaming':
        updateBeam(s, e, dt);
        break;

      case 'toSlot':
        if (moveToSlot(s, e, dt)) e.mode = 'formation';
        break;

      case 'formation':
        moveToSlot(s, e, dt);
        e.angle = normalizeAngle(e.angle) * Math.max(0, 1 - dt * 8);
        break;
    }

    if (e.shotsLeft > 0 && (e.mode === 'entering' || e.mode === 'diving')) {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && s.player.alive && e.y > 0 && e.y < PLAYER_Y - 140) {
        s.enemyBullets.push({
          x: e.x,
          y: e.y + 10,
          vx: clamp((s.player.x - e.x) * 0.6, -120, 120),
          vy: ENEMY_BULLET_SPEED,
        });
        e.shotsLeft--;
        e.fireTimer = 0.35 + rng() * 0.4;
      }
    }
  }

  if (finished.size) s.enemies = s.enemies.filter((e) => !finished.has(e));

  // 숨쉬기로 바뀌면 자리가 살짝 달라지지만, formation 상태도 moveToSlot으로 따라가므로 부드럽게 이어진다
  if (!s.assembled && !s.challenge && s.enemies.every((e) => e.mode === 'formation' || isAttacking(e))) {
    s.assembled = true;
    s.formationTime = 0;
  }
}

function updateBeam(s: GalagaState, boss: Enemy, dt: number) {
  const elapsed = BEAM_TIME - boss.beamTimer;
  const p = s.player;
  if (
    elapsed >= BEAM_OPEN_TIME &&
    !s.captive &&
    p.alive &&
    !p.dual &&
    Math.abs(p.x - boss.x) < BEAM_HALF_WIDTH
  ) {
    s.captive = { state: 'rising', x: p.x, y: PLAYER_Y, bossId: boss.id };
    p.alive = false;
    p.respawnTimer = Infinity;
    s.sounds.push('capture');
  }
  // 전투기를 끌어올리는 동안에는 빔을 유지한다
  if (s.captive?.bossId === boss.id && s.captive.state === 'rising') return;

  boss.beamTimer -= dt;
  if (boss.beamTimer > 0) return;
  // 아무도 못 잡았으면 아래로 빠져나간다
  boss.beamDive = false;
  boss.mode = 'diving';
  boss.distance = 0;
  boss.path = buildPath([
    { x: boss.x, y: boss.y },
    { x: boss.x, y: boss.y + 80 },
    { x: boss.x, y: VIEW_HEIGHT + 40 },
  ]);
}

function diveControls(e: Enemy, targetX: number, rng: Rng): Vec[] {
  const side = e.x < VIEW_WIDTH / 2 ? -1 : 1;
  const tx = clamp(targetX + (rng() * 2 - 1) * 50, 30, VIEW_WIDTH - 30);
  return [
    { x: e.x, y: e.y },
    { x: e.x + side * 24, y: e.y - 34 },
    { x: e.x + side * 56, y: e.y - 12 },
    { x: e.x + side * 50, y: e.y + 40 },
    { x: (e.x + tx) / 2, y: 320 },
    { x: tx, y: 500 },
    { x: tx - side * 70, y: VIEW_HEIGHT + 40 },
  ];
}

export function startDive(s: GalagaState, e: Enemy, controls: Vec[], rng: Rng) {
  const d = difficulty(s.stage);
  e.path = buildPath(controls);
  e.distance = 0;
  e.mode = 'diving';
  e.speed = d.diveSpeed;
  e.beamDive = false;
  e.shotsLeft = d.diveShots;
  e.fireTimer = 0.4 + rng() * 0.6;
}

export function startBeamDive(s: GalagaState, boss: Enemy) {
  const side = boss.x < VIEW_WIDTH / 2 ? -1 : 1;
  const tx = clamp(s.player.x, 60, VIEW_WIDTH - 60);
  boss.path = buildPath([
    { x: boss.x, y: boss.y },
    { x: boss.x + side * 24, y: boss.y - 34 },
    { x: boss.x + side * 56, y: boss.y - 12 },
    { x: boss.x + side * 50, y: boss.y + 40 },
    { x: (boss.x + tx) / 2, y: 240 },
    { x: tx, y: BEAM_STOP_Y },
  ]);
  boss.distance = 0;
  boss.mode = 'diving';
  boss.speed = difficulty(s.stage).diveSpeed;
  boss.beamDive = true;
  boss.shotsLeft = 0;
}

function scheduleDives(s: GalagaState, dt: number, rng: Rng) {
  if (!s.assembled || !s.player.alive || s.captive?.state === 'rising' || s.captive?.state === 'rescued') return;
  s.diveTimer -= dt;
  if (s.diveTimer > 0) return;
  const d = difficulty(s.stage);
  s.diveTimer = d.diveInterval * (0.7 + rng() * 0.6);

  if (s.enemies.filter(isAttacking).length >= d.maxDivers) return;
  const candidates = s.enemies.filter((e) => e.mode === 'formation');
  if (!candidates.length) return;
  const leader = candidates[Math.floor(rng() * candidates.length)];

  if (leader.kind === 'boss') {
    const canBeam = !s.captive && !s.player.dual && !s.enemies.some((e) => e.beamDive || e.mode === 'beaming');
    if (canBeam && rng() < 0.5) {
      startBeamDive(s, leader);
      return;
    }
    // 보스는 옆자리 나비를 최대 2기 호위로 데리고 내려온다
    const controls = diveControls(leader, s.player.x, rng);
    startDive(s, leader, controls, rng);
    const escorts = candidates
      .filter((e) => e.kind === 'butterfly' && e.slot && leader.slot && e.slot.row === 1)
      .filter((e) => Math.abs(e.slot!.col - leader.slot!.col) <= 1)
      .slice(0, 2);
    for (const esc of escorts) startDive(s, esc, translate(controls, esc.x - leader.x, esc.y - leader.y), rng);
    return;
  }
  startDive(s, leader, diveControls(leader, s.player.x, rng), rng);
}

// ---------- 포로 전투기 ----------

function updateCaptive(s: GalagaState, dt: number) {
  const c = s.captive;
  if (!c) return;
  const boss = s.enemies.find((e) => e.id === c.bossId);

  switch (c.state) {
    case 'rising': {
      if (!boss) {
        c.state = 'rescued';
        break;
      }
      const targetY = boss.y + CAPTIVE_OFFSET_Y;
      c.x += (boss.x - c.x) * Math.min(1, dt * 3);
      c.y -= CAPTIVE_RISE_SPEED * dt;
      if (c.y > targetY) break;
      c.y = targetY;
      c.state = 'held';
      boss.mode = 'toSlot';
      boss.beamDive = false;
      s.lives--;
      if (s.lives <= 0) {
        s.phase = 'over';
        s.phaseTimer = GAME_OVER_DELAY;
      } else {
        s.player.respawnTimer = RESPAWN_TIME;
      }
      break;
    }

    case 'held':
      if (!boss) {
        c.state = 'leaving';
        break;
      }
      c.x = boss.x;
      c.y = boss.y + CAPTIVE_OFFSET_Y;
      break;

    case 'rescued': {
      const p = s.player;
      const tx = p.alive ? p.x + DUAL_OFFSET * 2 : c.x;
      const dx = tx - c.x;
      const dy = PLAYER_Y - c.y;
      const dist = Math.hypot(dx, dy);
      const step = RESCUE_SPEED * dt;
      if (dist > step) {
        c.x += (dx / dist) * step;
        c.y += (dy / dist) * step;
        break;
      }
      // 합체: 원래 전투기가 왼쪽, 구출한 전투기가 오른쪽
      if (p.alive) {
        p.dual = true;
        p.x = clamp(p.x + DUAL_OFFSET, DUAL_OFFSET + SHIP_HALF_WIDTH + 4, VIEW_WIDTH - DUAL_OFFSET - SHIP_HALF_WIDTH - 4);
      } else {
        respawnPlayer(s);
        p.x = clamp(tx, SHIP_HALF_WIDTH + 4, VIEW_WIDTH - SHIP_HALF_WIDTH - 4);
      }
      s.captive = null;
      s.sounds.push('rescue');
      break;
    }

    case 'leaving':
      c.y -= 200 * dt;
      if (c.y < -40) s.captive = null;
      break;
  }
}

// ---------- 총알·충돌 ----------

function updateBullets(s: GalagaState, dt: number) {
  const move = (b: Bullet) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    return b.y > -20 && b.y < VIEW_HEIGHT + 20;
  };
  s.playerBullets = s.playerBullets.filter(move);
  s.enemyBullets = s.enemyBullets.filter(move);
}

function killEnemy(s: GalagaState, e: Enemy) {
  const attacking = isAttacking(e) || e.mode === 'entering';
  const points: number = s.challenge ? CHALLENGE_HIT_SCORE : attacking ? SCORES[e.kind].diving : SCORES[e.kind].formation;
  if (s.challenge) s.challengeHits++;
  s.score += points;
  if (attacking && e.kind === 'boss' && !s.challenge) s.popups.push({ x: e.x, y: e.y, text: String(points), age: 0 });
  s.explosions.push({ x: e.x, y: e.y, age: 0, big: e.kind === 'boss', color: e.kind === 'bee' ? '#facc15' : '#f87171' });
  s.sounds.push('explode');

  const c = s.captive;
  if (c?.bossId === e.id) {
    if (c.state === 'rising') c.state = 'rescued';
    else if (c.state === 'held') c.state = isAttacking(e) ? 'rescued' : 'leaving';
  }
}

function hitShip(s: GalagaState, shipIndex: number) {
  const p = s.player;
  const xs = shipXs(p);
  s.explosions.push({ x: xs[shipIndex], y: PLAYER_Y - SHIP_HEIGHT / 2, age: 0, big: true, color: '#e2e8f0' });
  s.sounds.push('playerDie');
  if (p.dual) {
    p.dual = false;
    p.x = xs[1 - shipIndex];
    return;
  }
  p.alive = false;
  s.lives--;
  if (s.lives <= 0) {
    s.phase = 'over';
    s.phaseTimer = GAME_OVER_DELAY;
  } else {
    p.respawnTimer = RESPAWN_TIME;
  }
}

const shipHit = (shipX: number, x: number, y: number, pad: number) =>
  Math.abs(x - shipX) < SHIP_HALF_WIDTH + pad && y > PLAYER_Y - SHIP_HEIGHT - pad && y < PLAYER_Y + pad;

function handleCollisions(s: GalagaState) {
  // 내 총알 → 적·포로
  s.playerBullets = s.playerBullets.filter((b) => {
    const c = s.captive;
    if (c?.state === 'held' && Math.hypot(b.x - c.x, b.y - c.y) < ENEMY_RADIUS) {
      s.explosions.push({ x: c.x, y: c.y, age: 0, big: true, color: '#ef4444' });
      s.sounds.push('explode');
      s.captive = null;
      return false;
    }
    const target = s.enemies.find((e) => e.mode !== 'waiting' && e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < ENEMY_RADIUS);
    if (!target) return true;
    s.hits++;
    target.hp--;
    if (target.hp > 0) s.sounds.push('bossHit');
    else killEnemy(s, target);
    return false;
  });
  s.enemies = s.enemies.filter((e) => e.hp > 0);

  const p = s.player;
  if (!p.alive) return;

  // 적 총알 → 전투기
  for (let i = 0; i < s.enemyBullets.length; i++) {
    const b = s.enemyBullets[i];
    const ship = shipXs(p).findIndex((x) => shipHit(x, b.x, b.y, 1));
    if (ship < 0) continue;
    s.enemyBullets.splice(i, 1);
    hitShip(s, ship);
    if (!p.alive) return;
    i--;
  }

  // 적 몸통 → 전투기 (부딪힌 적도 격추된다). 챌린징 스테이지는 보너스 라운드라 부딪혀도 괜찮다
  for (const e of s.enemies) {
    if (e.mode === 'waiting' || e.mode === 'formation' || e.mode === 'challenge') continue;
    const ship = shipXs(p).findIndex((x) => shipHit(x, e.x, e.y, ENEMY_RADIUS - 4));
    if (ship < 0) continue;
    e.hp = 0;
    killEnemy(s, e);
    hitShip(s, ship);
    if (!p.alive) break;
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}

function checkStageEnd(s: GalagaState) {
  if (s.phase !== 'playing' || s.enemies.length > 0) return;
  // 구출 중인 전투기가 내려올 때까지 기다린다
  if (s.captive && s.captive.state !== 'leaving') return;
  if (s.challenge) {
    if (s.challengeHits === ENEMY_COUNT) s.score += CHALLENGE_PERFECT_BONUS;
    s.phase = 'challengeResult';
    s.phaseTimer = CHALLENGE_RESULT_TIME;
  } else {
    s.phase = 'stageClear';
    s.phaseTimer = STAGE_CLEAR_TIME;
  }
}

function updateEffects(s: GalagaState, dt: number) {
  for (const x of s.explosions) x.age += dt;
  s.explosions = s.explosions.filter((x) => x.age < (x.big ? 0.9 : 0.5));
  for (const p of s.popups) {
    p.age += dt;
    p.y -= 20 * dt;
  }
  s.popups = s.popups.filter((p) => p.age < 1.2);
}
