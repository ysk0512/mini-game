import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, TrimeshCollider, type TrimeshArgs } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import { Color, DoubleSide, type Group, type MeshStandardMaterial } from 'three';
import { BOOST_PAD_HALF_LENGTH, BOOST_PAD_HALF_WIDTH } from '../logic/constants';
import { headingOf, type Track } from '../logic/track';
import { buildRibbon, buildRibbonCollider, buildWall, type MeshData } from './geometry';
import { THEMES } from './themes';

const CURB_WIDTH = 0.9;
const WALL_HEIGHT = 1.6;
const COLLIDER_WALL_HEIGHT = 3;
/** 충돌용 벽 두께. 얇은 삼각형 벽은 빠른 카트가 뚫고 나가므로 두꺼운 상자를 이어 붙인다 */
const COLLIDER_WALL_THICKNESS = 1.2;
const WALL_BOX_STEP = 2;
/**
 * Rapier의 TriMeshFlags.FIX_INTERNAL_EDGES.
 * 빠르게 굴러가는 공이 삼각형 사이 모서리에 걸려 튀어 오르는 '유령 충돌'을 막는다.
 * @react-three/rapier는 args를 ColliderDesc.trimesh(vertices, indices, flags)에 그대로 넘긴다.
 */
const TRIMESH_FIX_INTERNAL_EDGES = 144;

interface WallBox {
  position: [number, number, number];
  rotationY: number;
  halfExtents: [number, number, number];
}

function wallBoxes(track: Track, side: 1 | -1): WallBox[] {
  const { samples } = track;
  const offset = side * (track.wallOffset + COLLIDER_WALL_THICKNESS / 2);
  const boxes: WallBox[] = [];
  for (let i = 0; i < samples.length; i += WALL_BOX_STEP) {
    const a = samples[i];
    const b = samples[(i + WALL_BOX_STEP) % samples.length];
    const pa = a.pos.clone().addScaledVector(a.side, offset);
    const pb = b.pos.clone().addScaledVector(b.side, offset);
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const bottom = Math.min(a.pos.y, b.pos.y) - 1;
    const top = Math.max(a.pos.y, b.pos.y) + COLLIDER_WALL_HEIGHT;
    boxes.push({
      position: [(pa.x + pb.x) / 2, (bottom + top) / 2, (pa.z + pb.z) / 2],
      rotationY: Math.atan2(dx, dz),
      // 이웃 상자와 살짝 겹쳐 틈이 없게
      halfExtents: [COLLIDER_WALL_THICKNESS / 2, (top - bottom) / 2, Math.hypot(dx, dz) / 2 + 0.4],
    });
  }
  return boxes;
}

function RibbonMesh({ data, doubleSide = false, roughness = 0.9 }: { data: MeshData; doubleSide?: boolean; roughness?: number }) {
  return (
    <mesh geometry={data.geometry}>
      <meshStandardMaterial vertexColors roughness={roughness} side={doubleSide ? DoubleSide : undefined} />
    </mesh>
  );
}

export function TrackView({ track }: { track: Track }) {
  const { course } = track;
  const theme = THEMES[course.theme];
  const half = course.width / 2;
  const wall = track.wallOffset;

  const meshes = useMemo(() => {
    const solid = (hex: string) => {
      const c = new Color(hex);
      return () => c;
    };
    const stripes = (a: string, b: string, every: number) => {
      const ca = new Color(a);
      const cb = new Color(b);
      return (i: number) => (Math.floor(i / every) % 2 ? cb : ca);
    };
    const white = new Color('#f1f5f9');
    return {
      asphalt: buildRibbon(track, -half, half, 0, solid(theme.asphalt)),
      centerLine: buildRibbon(track, -0.15, 0.15, 0.02, (i) => (i % 4 < 2 ? white : null)),
      curbs: [
        buildRibbon(track, half, half + CURB_WIDTH, 0.03, stripes('#dc2626', '#f8fafc', 2)),
        buildRibbon(track, -half - CURB_WIDTH, -half, 0.03, stripes('#dc2626', '#f8fafc', 2)),
      ],
      roadside: [
        buildRibbon(track, half + CURB_WIDTH, wall, 0.01, solid(theme.roadside)),
        buildRibbon(track, -wall, -half - CURB_WIDTH, 0.01, solid(theme.roadside)),
      ],
      walls: [wall, -wall].map((o) => buildWall(track, o, (y) => y, (y) => y + WALL_HEIGHT, stripes(theme.wallA, theme.wallB, 3))),
      // 높은 구간 아래를 받치는 옆면
      skirts: [wall, -wall].map((o) => buildWall(track, o, () => -0.1, (y) => y, solid(theme.wallA))),
      floorCollider: buildRibbonCollider(track, -wall - COLLIDER_WALL_THICKNESS, wall + COLLIDER_WALL_THICKNESS),
      wallColliders: [...wallBoxes(track, 1), ...wallBoxes(track, -1)],
    };
  }, [track, theme, half, wall]);

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider
          args={[meshes.floorCollider.positions, meshes.floorCollider.indices, TRIMESH_FIX_INTERNAL_EDGES] as unknown as TrimeshArgs}
          friction={0}
        />
        {meshes.wallColliders.map((w, i) => (
          <CuboidCollider
            key={i}
            args={w.halfExtents}
            position={w.position}
            rotation={[0, w.rotationY, 0]}
            friction={0}
            restitution={0.3}
          />
        ))}
        {/* 코스 밖으로 떨어졌을 때 받쳐 주는 바닥 */}
        <CuboidCollider args={[2000, 0.5, 2000]} position={[0, -1.2, 0]} friction={0} />
      </RigidBody>

      <RibbonMesh data={meshes.asphalt} roughness={0.95} />
      <RibbonMesh data={meshes.centerLine} />
      {meshes.curbs.map((m, i) => (
        <RibbonMesh key={`c${i}`} data={m} />
      ))}
      {meshes.roadside.map((m, i) => (
        <RibbonMesh key={`r${i}`} data={m} />
      ))}
      {meshes.walls.map((m, i) => (
        <RibbonMesh key={`w${i}`} data={m} doubleSide />
      ))}
      {meshes.skirts.map((m, i) => (
        <RibbonMesh key={`s${i}`} data={m} doubleSide />
      ))}

      <StartLine track={track} />
      {track.boostPads.map((pad) => (
        <BoostPad key={pad.index} track={track} index={pad.index} />
      ))}
    </>
  );
}

/** 트랙 i번째 지점에 진행 방향으로 놓인 그룹 (로컬 +x가 side, +z가 진행 방향) */
function placement(track: Track, index: number, lift: number) {
  const s = track.samples[index];
  return { position: [s.pos.x, s.pos.y + lift, s.pos.z] as const, rotationY: headingOf(s.tangent) };
}

function StartLine({ track }: { track: Track }) {
  const { position, rotationY } = placement(track, 0, 0.04);
  const columns = 12;
  const size = track.course.width / columns;
  const tiles = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < columns; col++) {
      tiles.push(
        <mesh key={`${row}-${col}`} position={[-track.course.width / 2 + size * (col + 0.5), 0, (row - 0.5) * size]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial color={(row + col) % 2 ? '#111' : '#f8fafc'} />
        </mesh>,
      );
    }
  }
  return (
    <group position={position} rotation-y={rotationY}>
      {tiles}
      {/* 출발선 게이트 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (track.wallOffset - 0.3), 3, 0]}>
          <boxGeometry args={[0.4, 6, 0.4]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
      ))}
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[track.wallOffset * 2, 1.2, 0.4]} />
        <meshStandardMaterial color="#1d4ed8" />
      </mesh>
    </group>
  );
}

function BoostPad({ track, index }: { track: Track; index: number }) {
  const { position, rotationY } = placement(track, index, 0.05);
  const arrows = useRef<Group>(null);
  useFrame(({ clock }) => {
    // 화살표가 앞으로 흐르듯 깜빡인다
    arrows.current?.children.forEach((child, i) => {
      const material = (child as unknown as { material: MeshStandardMaterial }).material;
      material.emissiveIntensity = 0.4 + 0.8 * Math.max(0, Math.sin(clock.elapsedTime * 10 - i * 1.2));
    });
  });
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BOOST_PAD_HALF_WIDTH * 2, BOOST_PAD_HALF_LENGTH * 2]} />
        <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.3} />
      </mesh>
      <group ref={arrows}>
        {[-1.6, 0, 1.6].map((z) => (
          <mesh key={z} position={[0, 0.02, z]} rotation-x={-Math.PI / 2}>
            {/* 진행 방향(+z)을 가리키는 삼각형 */}
            <circleGeometry args={[1.1, 3, -Math.PI / 2]} />
            <meshStandardMaterial color="#fde047" emissive="#fde047" emissiveIntensity={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
