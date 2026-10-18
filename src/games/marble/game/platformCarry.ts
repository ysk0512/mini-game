import type { RigidBody } from '@dimforge/rapier3d-compat';

/** Carry the resting marble by the platform's displacement, without fighting its own steering. */
export function carryByPlatform(ball: RigidBody, support: RigidBody | null) {
  if (!support?.isKinematic() || ball.linvel().y > 0.5) return;
  const current = support.translation();
  const next = support.nextTranslation();
  const position = ball.translation();
  ball.setTranslation({ x: position.x + next.x - current.x, y: position.y + next.y - current.y, z: position.z + next.z - current.z }, true);
}
