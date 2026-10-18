import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BackSide, Color, Object3D, Vector3, type InstancedMesh, type Mesh } from 'three';
import type { Track } from '../logic/track';
import { scatterAroundTrack } from './geometry';
import { THEMES } from './themes';

interface Instance {
  position: Vector3;
  scale: Vector3;
  rotationY: number;
}

function Instances({ items, children }: { items: Instance[]; children: React.ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    items.forEach((it, i) => {
      dummy.position.copy(it.position);
      dummy.scale.copy(it.scale);
      dummy.rotation.set(0, it.rotationY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 top;
uniform vec3 bottom;
varying vec3 vDir;
void main() {
  float h = smoothstep(-0.05, 0.45, vDir.y);
  gl_FragColor = vec4(mix(bottom, top, h), 1.0);
}`;

function Sky({ top, bottom }: { top: string; bottom: string }) {
  const ref = useRef<Mesh>(null);
  const uniforms = useMemo(() => ({ top: { value: new Color(top) }, bottom: { value: new Color(bottom) } }), [top, bottom]);
  // 하늘은 카메라를 따라다녀 끝이 보이지 않게
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} renderOrder={-1}>
      <sphereGeometry args={[900, 24, 12]} />
      <shaderMaterial vertexShader={SKY_VERTEX} fragmentShader={SKY_FRAGMENT} uniforms={uniforms} side={BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

export function Scenery({ track }: { track: Track }) {
  const theme = THEMES[track.course.theme];
  const canyon = track.course.theme === 'canyon';

  const { near, far } = useMemo(() => {
    const scatter = (count: number, minDistance: number, spread: number, seed: number, size: [number, number]) => {
      const { points, rand } = scatterAroundTrack(track, count, minDistance, spread, seed);
      return points.map((p) => {
        const s = size[0] + rand() * (size[1] - size[0]);
        return { position: p, scale: new Vector3(s, s * (0.8 + rand() * 0.6), s), rotationY: rand() * Math.PI * 2 };
      });
    };
    return {
      near: scatter(canyon ? 90 : 150, track.wallOffset + 5, 70, 7, canyon ? [1.5, 5] : [0.8, 1.6]),
      far: scatter(canyon ? 30 : 24, 60, 260, 13, canyon ? [12, 28] : [30, 60]),
    };
  }, [track, canyon]);

  return (
    <>
      <Sky top={theme.skyTop} bottom={theme.skyBottom} />
      <fog attach="fog" args={[theme.fog, 140, 520]} />
      <hemisphereLight args={[theme.skyTop, theme.ground, 0.9]} />
      <directionalLight position={[120, 180, 60]} intensity={1.6} color={theme.sun} />
      <ambientLight intensity={0.2} />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]}>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color={theme.ground} roughness={1} />
      </mesh>

      {canyon ? (
        <>
          <Instances items={near}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#a75d2c" roughness={1} flatShading />
          </Instances>
          {/* 멀리 보이는 메사(탁상지) */}
          <Instances items={far.map((f) => ({ ...f, scale: new Vector3(f.scale.x, f.scale.x * 0.8, f.scale.z) }))}>
            <cylinderGeometry args={[1, 1.25, 1.6, 7]} />
            <meshStandardMaterial color="#b45a2a" roughness={1} flatShading />
          </Instances>
        </>
      ) : (
        <>
          <Instances items={near.map((t) => ({ ...t, position: t.position.clone().setY((1.6 + 2.25) * t.scale.y) }))}>
            <coneGeometry args={[1.6, 4.5, 7]} />
            <meshStandardMaterial color="#2f7d32" roughness={1} flatShading />
          </Instances>
          <Instances items={near.map((t) => ({ ...t, position: t.position.clone().setY(0.8 * t.scale.y) }))}>
            <cylinderGeometry args={[0.3, 0.4, 1.6, 6]} />
            <meshStandardMaterial color="#7c4a1e" roughness={1} />
          </Instances>
          {/* 지평선의 산 */}
          <Instances items={far}>
            <coneGeometry args={[1, 0.7, 6]} />
            <meshStandardMaterial color="#8b6fa8" roughness={1} flatShading />
          </Instances>
        </>
      )}
    </>
  );
}

