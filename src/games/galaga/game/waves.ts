import { BOSS_HP, ENTRY_SPEED } from './constants';
import type { Slot } from './formation';
import { buildPath, mirror, type Vec } from './path';
import type { Enemy, EnemyKind } from './types';

/** 줄지어 날아오는 적 사이의 시간 간격 */
const LINE_GAP = 0.13;
const WAVE_GAP = 2.8;
const CHALLENGE_GAP = 3.2;
const CHALLENGE_SPEED = 280;

// 입장 곡선 (왼쪽 기준, mirror로 오른쪽 버전을 만든다)
const TOP_SWOOP: Vec[] = [
  { x: 200, y: -20 },
  { x: 200, y: 80 },
  { x: 150, y: 200 },
  { x: 80, y: 300 },
  { x: 60, y: 400 },
  { x: 110, y: 470 },
  { x: 180, y: 440 },
  { x: 200, y: 360 },
];

const SIDE_LOOP: Vec[] = [
  { x: -20, y: 560 },
  { x: 90, y: 500 },
  { x: 190, y: 420 },
  { x: 250, y: 330 },
  { x: 240, y: 250 },
  { x: 180, y: 220 },
  { x: 140, y: 270 },
  { x: 170, y: 340 },
  { x: 240, y: 330 },
];

const TOP_SIDE: Vec[] = [
  { x: -20, y: -20 },
  { x: 50, y: 90 },
  { x: 150, y: 200 },
  { x: 230, y: 270 },
  { x: 290, y: 250 },
  { x: 280, y: 190 },
];

// 챌린징 스테이지 곡선
const CHALLENGE_LOOP: Vec[] = [
  { x: -20, y: 120 },
  { x: 120, y: 180 },
  { x: 240, y: 300 },
  { x: 320, y: 240 },
  { x: 260, y: 160 },
  { x: 200, y: 240 },
  { x: 260, y: 380 },
  { x: 360, y: 460 },
  { x: 500, y: 520 },
];

const CHALLENGE_RISE: Vec[] = [
  { x: -20, y: 520 },
  { x: 120, y: 440 },
  { x: 220, y: 320 },
  { x: 200, y: 220 },
  { x: 120, y: 200 },
  { x: 100, y: 280 },
  { x: 200, y: 330 },
  { x: 320, y: 250 },
  { x: 400, y: 120 },
  { x: 500, y: -20 },
];

const CHALLENGE_SPIRAL: Vec[] = [
  { x: 240, y: -20 },
  { x: 240, y: 160 },
  { x: 160, y: 260 },
  { x: 240, y: 340 },
  { x: 320, y: 260 },
  { x: 240, y: 180 },
  { x: 150, y: 300 },
  { x: 220, y: 400 },
  { x: 340, y: 380 },
  { x: 500, y: 300 },
];

interface Member {
  kind: EnemyKind;
  slot: Slot | null;
}

interface Line {
  start: number;
  controls: Vec[];
  members: Member[];
}

const slots = (kind: EnemyKind, row: number, cols: number[]): Member[] => cols.map((col) => ({ kind, slot: { row, col } }));

/** 일반 스테이지: 보스 4(0행), 나비 16(1~2행), 벌 20(3~4행)이 5웨이브로 입장 */
function formationLines(): Line[] {
  const bossPairs: Member[] = [];
  for (const col of [3, 4, 5, 6]) {
    bossPairs.push({ kind: 'boss', slot: { row: 0, col } }, { kind: 'butterfly', slot: { row: 2, col } });
  }
  return [
    { start: 0, controls: TOP_SWOOP, members: slots('bee', 3, [3, 4, 5, 6]) },
    { start: 0, controls: mirror(TOP_SWOOP), members: slots('butterfly', 1, [3, 4, 5, 6]) },
    { start: WAVE_GAP, controls: SIDE_LOOP, members: bossPairs },
    {
      start: WAVE_GAP * 2,
      controls: mirror(SIDE_LOOP),
      members: [...slots('butterfly', 1, [1, 2, 7, 8]), ...slots('butterfly', 2, [1, 2, 7, 8])],
    },
    {
      start: WAVE_GAP * 3,
      controls: mirror(TOP_SIDE),
      members: [...slots('bee', 3, [0, 1, 8, 9]), ...slots('bee', 4, [0, 1, 8, 9])],
    },
    {
      start: WAVE_GAP * 4,
      controls: TOP_SIDE,
      members: [...slots('bee', 3, [2, 7]), ...slots('bee', 4, [2, 3, 4, 5, 6, 7])],
    },
  ];
}

function challengeLines(): Line[] {
  const groups: [Vec[], EnemyKind][] = [
    [CHALLENGE_LOOP, 'bee'],
    [mirror(CHALLENGE_LOOP), 'butterfly'],
    [CHALLENGE_RISE, 'butterfly'],
    [mirror(CHALLENGE_RISE), 'bee'],
    [CHALLENGE_SPIRAL, 'boss'],
  ];
  return groups.map(([controls, kind], i) => ({
    start: i * CHALLENGE_GAP,
    controls,
    members: Array.from({ length: 8 }, () => ({ kind, slot: null })),
  }));
}

export function newEnemy(id: number, kind: EnemyKind, slot: Slot | null): Enemy {
  return {
    id,
    kind,
    slot,
    x: 0,
    y: -40,
    angle: Math.PI,
    hp: kind === 'boss' && slot ? BOSS_HP : 1,
    mode: 'waiting',
    path: null,
    distance: 0,
    speed: ENTRY_SPEED,
    spawnAt: 0,
    fireTimer: Infinity,
    shotsLeft: 0,
    beamDive: false,
    beamTimer: 0,
  };
}

/** 스테이지의 적 40기를 등장 대기 상태로 만든다 */
export function buildStageEnemies(challenge: boolean, firstId: number): Enemy[] {
  const enemies: Enemy[] = [];
  let id = firstId;
  for (const line of challenge ? challengeLines() : formationLines()) {
    const path = buildPath(line.controls);
    line.members.forEach((m, i) => {
      const e = newEnemy(id++, m.kind, m.slot);
      e.path = path;
      e.spawnAt = line.start + i * LINE_GAP;
      e.speed = challenge ? CHALLENGE_SPEED : ENTRY_SPEED;
      enemies.push(e);
    });
  }
  return enemies;
}

/** 원작처럼 3스테이지, 이후 4스테이지마다 챌린징 스테이지 */
export const isChallengeStage = (stage: number) => stage >= 3 && (stage - 3) % 4 === 0;
