import { BallCollider, interactionGroups, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import type { Group } from 'three';
import { KART_RADIUS } from '../logic/constants';
import type { KartState } from '../logic/kart';
import { KartModel } from './KartModel';

const KART_GROUPS = interactionGroups(1, [0]);

interface Props {
  kart: KartState;
  onBody: (id: number, body: RapierRigidBody | null) => void;
  onVisual: (id: number, group: Group | null) => void;
}

/**
 * 물리 몸체는 회전하지 않는 공(BallCollider)이고, 보이는 카트는 그 안에서 heading만큼 돌린다.
 * 속도는 RaceDriver가 매 프레임 정해 준다.
 */
export function KartView({ kart, onBody, onVisual }: Props) {
  return (
    <RigidBody
      ref={(b) => onBody(kart.id, b)}
      colliders={false}
      position={[kart.position.x, kart.position.y, kart.position.z]}
      lockRotations
      ccd
      canSleep={false}
    >
      {/* 카트끼리는 물리 충돌을 끄고(그룹 1은 트랙 그룹 0과만 충돌) 레이스 로직에서 밀어낸다 */}
      <BallCollider args={[KART_RADIUS]} friction={0} restitution={0.2} collisionGroups={KART_GROUPS} />
      <KartModel kart={kart} groupRef={(g) => onVisual(kart.id, g)} />
    </RigidBody>
  );
}
