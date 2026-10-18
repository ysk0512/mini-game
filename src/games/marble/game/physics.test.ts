import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { COURSES, platformPosition, type Vec3 } from './courses';
import { drive, MARBLE_RADIUS, STEP } from './engine';
import { carryByPlatform } from './platformCarry';

beforeAll(async () => { await RAPIER.init(); });

/** Exercise the shipped course geometry in Rapier, including joins and slopes. */
function simulation(stage: number, start?: Vec3) {
  const world = new RAPIER.World({ x: 0, y: -16, z: 0 });
  world.timestep = STEP;
  const movers: { body: RAPIER.RigidBody; index: number }[] = [];
  COURSES[stage].platforms.forEach((p, index) => {
    const at = platformPosition(p, 0);
    const angle = p.tilt ?? 0;
    const body = world.createRigidBody((p.motion ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed())
      .setTranslation(...at).setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }));
    world.createCollider(RAPIER.ColliderDesc.cuboid(p.size[0] / 2, 0.35, p.size[1] / 2).setTranslation(0, -0.35, 0).setFriction(p.motion ? 0 : 1).setFrictionCombineRule(p.motion ? RAPIER.CoefficientCombineRule.Min : RAPIER.CoefficientCombineRule.Average).setRestitution(0.05), body);
    if (p.motion) movers.push({ body, index });
  });
  const spawn = start ?? COURSES[stage].start;
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn[0], spawn[1] + MARBLE_RADIUS + 0.04, spawn[2]).setCcdEnabled(true).setCanSleep(false).setAngularDamping(0.6));
  world.createCollider(RAPIER.ColliderDesc.ball(MARBLE_RADIUS).setMass(1).setFriction(0.7).setRestitution(0.12), ball);
  let time = 0;
  function step(target?: Vec3, jump = false) {
    time += STEP;
    movers.forEach(({ body, index }) => {
      const [x, y, z] = platformPosition(COURSES[stage].platforms[index], time);
      body.setNextKinematicTranslation({ x, y, z });
    });
    const pos = ball.translation();
    const hit = world.castRay(new RAPIER.Ray(pos, { x: 0, y: -1, z: 0 }), MARBLE_RADIUS + 0.13, true, undefined, undefined, undefined, ball);
    carryByPlatform(ball, hit?.collider.parent() ?? null);
    const velocity = ball.linvel();
    const dx = (target?.[0] ?? pos.x) - pos.x;
    const dz = (target?.[2] ?? pos.z) - pos.z;
    const distance = Math.hypot(dx, dz);
    const desiredSpeed = Math.min(3.5, distance * 2.5);
    const ax = distance > 0.02 ? ((dx / distance * desiredSpeed - velocity.x) * 4 + velocity.x * 0.65) / 10 : 0;
    const az = distance > 0.02 ? ((dz / distance * desiredSpeed - velocity.z) * 4 + velocity.z * 0.65) / 10 : 0;
    const v = drive(velocity, { x: 0.8 * ax - 0.6 * az, y: 0.6 * ax + 0.8 * az, brake: false, jump }, STEP);
    if (jump) v.y = 6.5;
    ball.setLinvel(v, true);
    world.step();
  }
  function go(target: Vec3, seconds = 10) {
    for (let i = 0; i < seconds / STEP; i++) {
      step(target);
      const p = ball.translation();
      if (p.y < -2) return false;
      if (Math.hypot(p.x - target[0], p.z - target[2]) < 0.22 && Math.abs(p.y - target[1] - MARBLE_RADIUS) < 0.2) return true;
    }
    return false;
  }
  return { world, ball, step, go };
}

describe('실제 구슬 물리와 코스 연결', () => {
  it('첫 코스의 모든 모서리와 바닥 연결을 굴러서 통과한다', () => {
    const sim = simulation(0);
    try {
      for (const point of [[-8, 0, 2], [-8, 0, -6], [-2, 0, -6], [7, 0, -6], [7, 0, 1], [7, 0, 6], [-1, 0, 6], [-1, 0, 3], [-1, 0, -1]] as Vec3[]) {
        expect(sim.go(point), `목표 ${point}, 실제 위치 ${JSON.stringify(sim.ball.translation())}`).toBe(true);
      }
    } finally { sim.world.free(); }
  });
  it('두 번째 코스는 경사로를 올라가고 내려와 골까지 연결된다', () => {
    const sim = simulation(1);
    try {
      for (const point of [[-8, 0, 5], [-8, 0, 2], [-8, 1.8, -5], [-1, 1.8, -5], [5, 1.8, -5], [5, 0, 5], [-4, 0, 5]] as Vec3[]) {
        expect(sim.go(point), `목표 ${point}, 실제 위치 ${JSON.stringify(sim.ball.translation())}`).toBe(true);
      }
    } finally { sim.world.free(); }
  });
  it('민트색 발판 위에 올라탄 구슬은 낙하하지 않고 반대편까지 이동한다', () => {
    const sim = simulation(2, [-8, 0, 0.8]);
    try {
      for (let i = 0; i < 160; i++) sim.step();
      const position = sim.ball.translation();
      expect(position.y).toBeGreaterThan(0.1);
      expect(position.z).toBeLessThan(-1.5);
    } finally { sim.world.free(); }
  });
  it('점프대의 속도로 마지막 코스의 틈을 건널 수 있다', () => {
    const sim = simulation(2, [-2.1, 0, -4]);
    try {
      for (let i = 0; i < 15; i++) sim.step();
      sim.ball.setLinvel({ x: 4.4, y: 6.5, z: 0 }, true);
      for (let i = 0; i < 90; i++) sim.step([2, 0, -4]);
      const position = sim.ball.translation();
      expect(position.y).toBeGreaterThan(0.1);
      expect(position.x).toBeGreaterThan(0.5);
    } finally { sim.world.free(); }
  });
});
