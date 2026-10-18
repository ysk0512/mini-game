import { describe, expect, it } from 'vitest';
import {
  BEAM_STOP_Y,
  CAPTIVE_OFFSET_Y,
  CHALLENGE_PERFECT_BONUS,
  ENEMY_COUNT,
  INITIAL_LIVES,
  PLAYER_Y,
  SCORES,
  VIEW_WIDTH,
} from './constants';
import { slotPosition } from './formation';
import { createGalaga, shipXs, startBeamDive, startDive, startStage, update } from './engine';
import { buildPath, pointAt } from './path';
import type { Enemy, GalagaState, Input } from './types';
import { isChallengeStage, newEnemy } from './waves';

const dt = 1 / 60;
const idle: Input = { left: false, right: false, fire: false };
const fire: Input = { ...idle, fire: true };
const noRandom = () => 0.99; // 입장 사격·급강하 없음

function run(s: GalagaState, frames: number, input: (f: number) => Input = () => idle, rng = noRandom) {
  for (let f = 0; f < frames; f++) update(s, dt, input(f), rng);
}

/** 적을 직접 배치한 playing 상태 */
function arena(enemies: Enemy[]): GalagaState {
  const s = createGalaga();
  s.phase = 'playing';
  s.enemies = enemies;
  s.assembled = true;
  s.diveTimer = Infinity;
  return s;
}

function enemyAt(id: number, kind: Enemy['kind'], x: number, y: number, mode: Enemy['mode'] = 'formation'): Enemy {
  const e = newEnemy(id, kind, { row: kind === 'boss' ? 0 : 3, col: 4 });
  e.x = x;
  e.y = y;
  e.mode = mode;
  return e;
}

/** 움직이지 않는 적: 편대 슬롯 대신 고정 좌표에 둔다 */
function frozen(e: Enemy) {
  e.slot = null;
  return e;
}

describe('path', () => {
  it('거리 기준으로 등속 이동하고 끝점에 도달한다', () => {
    const path = buildPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    const start = pointAt(path, 0);
    const end = pointAt(path, path.length + 50);
    expect(start).toMatchObject({ x: 0, y: 0 });
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(100);
    // 같은 거리만큼 이동하면 직선 거리도 거의 같다
    const a = pointAt(path, 10);
    const b = pointAt(path, 20);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(10, 0);
    // 처음엔 오른쪽(+x)으로 진행 → 위쪽 기준 각도 π/2
    expect(start.angle).toBeCloseTo(Math.PI / 2, 1);
  });
});

describe('입장', () => {
  it('일정 시간이 지나면 40기 모두 편대에 자리 잡는다', () => {
    const s = createGalaga();
    expect(s.enemies).toHaveLength(ENEMY_COUNT);
    run(s, 60 * 30);
    expect(s.enemies.every((e) => e.mode === 'formation')).toBe(true);
    expect(s.assembled).toBe(true);
    for (const e of s.enemies) {
      const slot = slotPosition(e.slot!, s.formationTime, true);
      expect(Math.hypot(e.x - slot.x, e.y - slot.y)).toBeLessThan(2);
    }
  });
});

describe('사격', () => {
  it('벌은 한 방, 보스는 두 방에 격추되고 점수가 맞다', () => {
    const bee = frozen(enemyAt(1, 'bee', VIEW_WIDTH / 2, 300));
    const s = arena([bee]);
    run(s, 40, (f) => (f === 0 ? fire : idle));
    expect(s.enemies).toHaveLength(0);
    expect(s.score).toBe(SCORES.bee.formation);

    const boss = frozen(enemyAt(2, 'boss', VIEW_WIDTH / 2, 300));
    const t = arena([boss, frozen(enemyAt(3, 'bee', 20, 20))]);
    run(t, 40, (f) => (f === 0 ? fire : idle));
    expect(boss.hp).toBe(1);
    expect(t.score).toBe(0);
    run(t, 40, (f) => (f === 0 ? fire : idle));
    expect(t.enemies).toHaveLength(1);
    expect(t.score).toBe(SCORES.boss.formation);
    expect(t.hits).toBe(2);
  });

  it('급강하 중인 적은 더 높은 점수', () => {
    const bee = frozen(enemyAt(1, 'bee', VIEW_WIDTH / 2, 300, 'diving'));
    bee.path = buildPath([
      { x: VIEW_WIDTH / 2, y: 300 },
      { x: VIEW_WIDTH / 2, y: 301 },
    ]);
    bee.speed = 0;
    const s = arena([bee]);
    run(s, 40, (f) => (f === 0 ? fire : idle));
    expect(s.score).toBe(SCORES.bee.diving);
  });

  it('화면에 내 총알은 최대 2발', () => {
    const s = arena([frozen(enemyAt(1, 'bee', 20, 20))]);
    run(s, 30, () => fire);
    expect(s.playerBullets.length).toBeLessThanOrEqual(2);
    expect(s.shots).toBe(2);
  });
});

describe('피격', () => {
  it('적 총알에 맞으면 생명이 줄고 잠시 뒤 부활한다', () => {
    const s = arena([frozen(enemyAt(1, 'bee', 20, 20))]);
    s.enemyBullets.push({ x: s.player.x, y: PLAYER_Y - 30, vx: 0, vy: 250 });
    run(s, 10);
    expect(s.player.alive).toBe(false);
    expect(s.lives).toBe(INITIAL_LIVES - 1);
    run(s, 60 * 3);
    expect(s.player.alive).toBe(true);
  });

  it('마지막 생명을 잃으면 gameOver', () => {
    const s = arena([frozen(enemyAt(1, 'bee', 20, 20))]);
    s.lives = 1;
    s.enemyBullets.push({ x: s.player.x, y: PLAYER_Y - 30, vx: 0, vy: 250 });
    const events: string[] = [];
    for (let f = 0; f < 60 * 3; f++) events.push(...update(s, dt, idle, noRandom));
    expect(events).toEqual(['gameOver']);
  });
});

describe('트랙터 빔과 듀얼 파이터', () => {
  /** 보스가 플레이어 머리 위에서 빔을 쏘아 포로를 잡아갈 때까지 진행 */
  function captured() {
    const boss = enemyAt(1, 'boss', VIEW_WIDTH / 2, 92);
    const s = arena([boss, frozen(enemyAt(2, 'bee', 20, 20))]);
    startBeamDive(s, boss);
    run(s, 60 * 12);
    return { s, boss };
  }

  it('빔에 걸리면 포로가 되어 보스와 함께 편대로 돌아가고 생명이 준다', () => {
    const { s, boss } = captured();
    expect(s.captive?.state).toBe('held');
    expect(s.lives).toBe(INITIAL_LIVES - 1);
    expect(boss.mode).toBe('formation');
    expect(s.captive!.y).toBeCloseTo(boss.y + CAPTIVE_OFFSET_Y, 0);
    expect(s.player.alive).toBe(true); // 새 전투기로 부활
  });

  it('빔 밖에 있으면 잡히지 않는다', () => {
    const boss = enemyAt(1, 'boss', VIEW_WIDTH / 2, 92);
    const s = arena([boss, frozen(enemyAt(2, 'bee', 20, 20))]);
    startBeamDive(s, boss);
    s.player.x = 40; // 빔은 보스가 출발할 때의 플레이어 위치로 내려온다
    run(s, 60 * 12);
    expect(s.captive).toBeNull();
    expect(s.lives).toBe(INITIAL_LIVES);
  });

  it('포로를 데리고 급강하하는 보스를 격추하면 듀얼 파이터, 듀얼 피격 시 한 대만 잃는다', () => {
    const { s, boss } = captured();
    startDive(s, boss, [
      { x: boss.x, y: boss.y },
      { x: s.player.x, y: 300 },
      { x: s.player.x, y: 301 },
    ], noRandom);
    // 급강하 경로 끝(플레이어 위 y=300 근처)에 세워 둔다
    boss.distance = boss.path!.length - 2;
    boss.speed = 0;
    boss.shotsLeft = 0;
    run(s, 1);
    boss.hp = 1;
    run(s, 40, (f) => (f === 0 ? fire : idle));
    expect(s.enemies.find((e) => e.id === boss.id)).toBeUndefined();
    expect(s.captive?.state).toBe('rescued');
    run(s, 60 * 4);
    expect(s.captive).toBeNull();
    expect(s.player.dual).toBe(true);

    const lives = s.lives;
    const [left] = shipXs(s.player);
    s.enemyBullets.push({ x: left, y: PLAYER_Y - 30, vx: 0, vy: 250 });
    run(s, 10);
    expect(s.player.alive).toBe(true);
    expect(s.player.dual).toBe(false);
    expect(s.lives).toBe(lives);
  });

  it('편대에 있는 보스를 격추하면 포로는 날아가 사라진다', () => {
    const { s, boss } = captured();
    boss.hp = 1;
    s.player.x = boss.x;
    run(s, 60, (f) => (f === 0 ? fire : idle));
    expect(s.captive === null || s.captive.state === 'leaving').toBe(true);
    run(s, 60 * 2);
    expect(s.captive).toBeNull();
    expect(s.player.dual).toBe(false);
  });

  it('빔은 BEAM_STOP_Y 높이에서 멈춰 쏜다', () => {
    const boss = enemyAt(1, 'boss', VIEW_WIDTH / 2, 92);
    const s = arena([boss, frozen(enemyAt(2, 'bee', 20, 20))]);
    s.player.x = 40;
    startBeamDive(s, boss);
    for (let f = 0; f < 60 * 6 && boss.mode !== 'beaming'; f++) run(s, 1);
    expect(boss.mode).toBe('beaming');
    expect(boss.y).toBeCloseTo(BEAM_STOP_Y, 0);
  });
});

describe('스테이지 진행', () => {
  it('적을 모두 잡으면 다음 스테이지로 간다', () => {
    const s = arena([]);
    run(s, 1);
    expect(s.phase).toBe('stageClear');
    run(s, 60 * 2);
    expect(s.stage).toBe(2);
    expect(s.phase).toBe('intro');
  });

  it('3스테이지는 챌린징: 적이 쏘지 않고 날아갔다 사라진다', () => {
    expect([1, 2, 3, 4, 7, 11].map(isChallengeStage)).toEqual([false, false, true, false, true, true]);
    const s = createGalaga();
    startStage(s, 3);
    expect(s.challenge).toBe(true);
    s.phase = 'playing';
    // 난수가 0이어도(= 항상 사격 확률 통과) 쏘지 않는다
    let bullets = 0;
    for (let f = 0; f < 60 * 40 && s.phase === 'playing'; f++) {
      run(s, 1, () => idle, () => 0);
      bullets = Math.max(bullets, s.enemyBullets.length);
    }
    expect(bullets).toBe(0);
    expect(s.phase).toBe('challengeResult');
    expect(s.lives).toBe(INITIAL_LIVES);
    expect(s.challengeHits).toBe(0);
  });

  it('챌린징 스테이지에서 40기를 다 맞히면 퍼펙트 보너스', () => {
    const s = createGalaga();
    startStage(s, 3);
    s.phase = 'playing';
    s.challengeHits = ENEMY_COUNT - 1;
    s.enemies = [frozen(enemyAt(1, 'bee', VIEW_WIDTH / 2, 300, 'challenge'))];
    s.enemies[0].path = buildPath([
      { x: VIEW_WIDTH / 2, y: 300 },
      { x: VIEW_WIDTH / 2, y: 301 },
    ]);
    s.enemies[0].speed = 0;
    run(s, 40, (f) => (f === 0 ? fire : idle));
    expect(s.phase).toBe('challengeResult');
    expect(s.challengeHits).toBe(ENEMY_COUNT);
    expect(s.score).toBe(100 + CHALLENGE_PERFECT_BONUS);
  });

  it('20000점이 되면 생명이 하나 늘어난다', () => {
    const s = arena([frozen(enemyAt(1, 'bee', 20, 20))]);
    s.score = 19990;
    const bee = frozen(enemyAt(2, 'bee', VIEW_WIDTH / 2, 300));
    s.enemies.push(bee);
    run(s, 40, (f) => (f === 0 ? fire : idle));
    expect(s.lives).toBe(INITIAL_LIVES + 1);
    expect(s.sounds).toContain('extraLife');
  });
});
