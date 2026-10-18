import {
  BALL_TOP,
  BONUS_DRAIN,
  BONUS_TRANSFER_RATE,
  CAMERA_LEAD,
  CLEAR_TIME,
  DYING_TIME,
  FLOOR_Y,
  GOAL_AREA,
  INITIAL_LIVES,
  INTRO_TIME,
  MARKER_SPACING,
  PLAYER_START_X,
  ROPE_Y,
  START_BONUS,
  START_PLATFORM_END,
  TRAPEZE_GRAVITY,
  VIEW_WIDTH,
} from './constants';
import { newPlayer, type Rng, type StepResult } from './physics';
import { createBalls, respawnBalls, updateBalls } from './stages/balls';
import { createLion, respawnLion, updateLion } from './stages/lion';
import { createRope, respawnRope, updateRope } from './stages/rope';
import { createTrapeze, placeOnTrapeze, respawnTrapeze, TRAPEZE_GOAL_X, updateTrapeze } from './stages/trapeze';
import type { CircusEvent, CircusState, Input, Level, StageKind } from './types';

export interface StageDef {
  kind: StageKind;
  name: string;
  /** 골 지점의 x */
  length: number;
}

export const STAGES: StageDef[] = [
  { kind: 'lion', name: '사자 타고 불링 넘기', length: 3000 },
  { kind: 'rope', name: '외줄타기', length: 3000 },
  { kind: 'balls', name: '공 굴리기', length: 3000 },
  { kind: 'trapeze', name: '공중그네', length: TRAPEZE_GOAL_X },
];

/** 화면 표시용으로 10점 단위로 내린 보너스 */
export const displayBonus = (s: CircusState) => Math.floor(s.bonus / 10) * 10;

export function createCircus(rng: Rng = Math.random): CircusState {
  const s: CircusState = {
    stage: 0,
    score: 0,
    lives: INITIAL_LIVES,
    bonus: START_BONUS,
    time: 0,
    phase: 'intro',
    phaseTimer: INTRO_TIME,
    checkpointX: PLAYER_START_X,
    cameraX: 0,
    player: newPlayer(PLAYER_START_X, FLOOR_Y),
    level: createLion(STAGES[0].length, rng),
    deathCause: null,
  };
  startStage(s, 0, rng);
  return s;
}

function createLevel(def: StageDef, checkpointX: number, rng: Rng): Level {
  switch (def.kind) {
    case 'lion':
      return createLion(def.length, rng);
    case 'rope':
      return createRope();
    case 'balls':
      return createBalls(checkpointX);
    case 'trapeze':
      return createTrapeze();
  }
}

export function startStage(s: CircusState, index: number, rng: Rng = Math.random) {
  s.stage = index;
  s.checkpointX = PLAYER_START_X;
  s.level = createLevel(STAGES[index], s.checkpointX, rng);
  beginLife(s);
}

function respawn(s: CircusState) {
  const level = s.level;
  switch (level.kind) {
    case 'lion':
      respawnLion(level, s.checkpointX);
      break;
    case 'rope':
      respawnRope(level);
      break;
    case 'balls':
      respawnBalls(level, s.checkpointX);
      break;
    case 'trapeze':
      respawnTrapeze(level);
      break;
  }
  beginLife(s);
}

function beginLife(s: CircusState) {
  const level = s.level;
  const groundY = level.kind === 'lion' ? FLOOR_Y : level.kind === 'rope' ? ROPE_Y : BALL_TOP;
  s.player = newPlayer(s.checkpointX, groundY);
  if (level.kind === 'trapeze') {
    s.player.x = START_PLATFORM_END - 40;
    placeOnTrapeze(s.player, level, s.time);
  }
  s.bonus = START_BONUS;
  s.phase = 'intro';
  s.phaseTimer = INTRO_TIME;
  s.deathCause = null;
  updateCamera(s);
}

function stepLevel(s: CircusState, dt: number, input: Input, rng: Rng): StepResult {
  const length = STAGES[s.stage].length;
  const level = s.level;
  switch (level.kind) {
    case 'lion':
      return updateLion(s, level, dt, input, rng, length);
    case 'rope':
      return updateRope(s, level, dt, input, rng, length);
    case 'balls':
      return updateBalls(s, level, dt, input, rng, length);
    case 'trapeze':
      return updateTrapeze(s, level, dt, input);
  }
}

/** 땅에 서 있을 때 지나온 마지막 거리 표지판을 체크포인트로 삼는다 */
function updateCheckpoint(s: CircusState) {
  if (s.level.kind === 'trapeze' || !s.player.grounded) return;
  const marker = Math.floor(s.player.x / MARKER_SPACING) * MARKER_SPACING;
  if (marker > s.checkpointX) s.checkpointX = marker;
}

function updateCamera(s: CircusState) {
  const max = STAGES[s.stage].length + GOAL_AREA - VIEW_WIDTH;
  s.cameraX = Math.max(0, Math.min(max, s.player.x - CAMERA_LEAD));
}

/**
 * 게임을 dt초만큼 진행한다. state를 직접 변경하며 게임 종료 이벤트를 반환한다.
 */
export function update(s: CircusState, dt: number, input: Input, rng: Rng = Math.random): CircusEvent[] {
  s.time += dt;
  const events: CircusEvent[] = [];

  switch (s.phase) {
    case 'intro':
      // 그네는 계속 흔들리므로 매달린 플레이어도 따라 움직여야 한다
      if (s.level.kind === 'trapeze') placeOnTrapeze(s.player, s.level, s.time);
      s.phaseTimer -= dt;
      if (s.phaseTimer <= 0) s.phase = 'playing';
      break;

    case 'playing': {
      s.bonus = Math.max(0, s.bonus - BONUS_DRAIN * dt);
      const result = stepLevel(s, dt, input, rng);
      if (result === 'clear') {
        s.phase = 'clear';
        s.phaseTimer = CLEAR_TIME;
        s.bonus = displayBonus(s);
      } else if (result) {
        s.phase = 'dying';
        s.phaseTimer = DYING_TIME;
        s.deathCause = result;
      } else {
        updateCheckpoint(s);
      }
      break;
    }

    case 'dying':
      if (s.deathCause === 'fall' && s.level.kind === 'trapeze') {
        s.player.vy += TRAPEZE_GRAVITY * dt;
        s.player.y += s.player.vy * dt;
      }
      s.phaseTimer -= dt;
      if (s.phaseTimer <= 0) {
        s.lives--;
        if (s.lives <= 0) {
          s.phase = 'done';
          events.push('gameOver');
        } else {
          respawn(s);
        }
      }
      break;

    case 'clear': {
      // 남은 보너스를 점수로 옮긴다
      const moved = Math.min(s.bonus, Math.ceil((BONUS_TRANSFER_RATE * dt) / 10) * 10);
      s.bonus -= moved;
      s.score += moved;
      s.phaseTimer -= dt;
      if (s.phaseTimer <= 0 && s.bonus === 0) {
        if (s.stage >= STAGES.length - 1) {
          s.phase = 'done';
          events.push('victory');
        } else {
          startStage(s, s.stage + 1, rng);
        }
      }
      break;
    }

    case 'done':
      break;
  }

  if (s.phase !== 'dying') updateCamera(s);
  return events;
}
