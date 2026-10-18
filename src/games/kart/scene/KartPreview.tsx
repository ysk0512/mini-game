import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { createKart, type KartState } from '../logic/kart';
import type { CharacterDef, KartDef } from '../logic/roster';
import { KartModel } from './KartModel';

/** 진열대 위에서 천천히 도는 카트 */
function Turntable({ kart }: { kart: KartState }) {
  useFrame((_, delta) => {
    kart.heading += delta * 0.8;
  });
  return <KartModel kart={kart} />;
}

export function KartPreview({ character, kartDef }: { character: CharacterDef; kartDef: KartDef }) {
  // 연출용 가짜 상태 (정지·직진). 고를 때마다 새로 만든다
  const kart = useMemo(() => {
    const k = createKart(0, character, kartDef, true, null);
    k.heading = -0.6;
    return k;
  }, [character, kartDef]);

  return (
    <Canvas className="kart-preview" camera={{ position: [3.4, 2.1, 3.4], fov: 40 }} dpr={[1, 2]} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
      <hemisphereLight args={['#bfdbfe', '#334155', 1.1]} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.72, 0]}>
        <circleGeometry args={[2.2, 40]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <Turntable kart={kart} />
    </Canvas>
  );
}
