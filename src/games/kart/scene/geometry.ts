import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import type { Track, TrackSample } from '../logic/track';

export interface MeshData {
  geometry: BufferGeometry;
  /** 물리 충돌체(trimesh)용 */
  positions: Float32Array;
  indices: Uint32Array;
}

/** i번째 구간의 색. null이면 그 구간은 만들지 않는다 (점선 등) */
export type SegmentColor = (i: number) => Color | null;

function finish(positions: number[], colors: number[]): MeshData {
  const pos = new Float32Array(positions);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  const indices = new Uint32Array(pos.length / 3).map((_, i) => i);
  return { geometry, positions: pos, indices };
}

function forEachSegment(track: Track, fn: (i: number, a: TrackSample, b: TrackSample) => void) {
  const { samples } = track;
  for (let i = 0; i < samples.length; i++) fn(i, samples[i], samples[(i + 1) % samples.length]);
}

const edge = (s: TrackSample, offset: number, lift: number) => s.pos.clone().addScaledVector(s.side, offset).setY(s.pos.y + lift);

/** 트랙을 따라가는 띠 (from ~ to: 중앙선 기준 옆 거리) */
export function buildRibbon(track: Track, from: number, to: number, lift: number, color: SegmentColor): MeshData {
  const positions: number[] = [];
  const colors: number[] = [];
  forEachSegment(track, (i, a, b) => {
    const c = color(i);
    if (!c) return;
    const a0 = edge(a, from, lift);
    const a1 = edge(a, to, lift);
    const b0 = edge(b, from, lift);
    const b1 = edge(b, to, lift);
    for (const v of [a0, b0, a1, a1, b0, b1]) {
      positions.push(v.x, v.y, v.z);
      colors.push(c.r, c.g, c.b);
    }
  });
  return finish(positions, colors);
}

/**
 * 바닥 충돌체용 띠. 이웃 삼각형이 꼭짓점을 공유해야 빠르게 굴러가는 공이
 * 삼각형 이음매에 걸려 튀어 오르지 않는다.
 */
export function buildRibbonCollider(track: Track, from: number, to: number) {
  const { samples } = track;
  const positions = new Float32Array(samples.length * 6);
  samples.forEach((s, i) => {
    const a = edge(s, from, 0);
    const b = edge(s, to, 0);
    positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
  });
  const indices = new Uint32Array(samples.length * 6);
  for (let i = 0; i < samples.length; i++) {
    const j = (i + 1) % samples.length;
    const [a0, a1, b0, b1] = [i * 2, i * 2 + 1, j * 2, j * 2 + 1];
    indices.set([a0, b0, a1, a1, b0, b1], i * 6);
  }
  return { positions, indices };
}

/** 트랙을 따라 세운 수직 벽. bottom·top은 그 지점 트랙 높이를 받아 실제 y를 돌려준다 */
export function buildWall(
  track: Track,
  offset: number,
  bottom: (trackY: number) => number,
  top: (trackY: number) => number,
  color: SegmentColor,
): MeshData {
  const positions: number[] = [];
  const colors: number[] = [];
  forEachSegment(track, (i, a, b) => {
    const c = color(i);
    if (!c) return;
    const pa = edge(a, offset, 0);
    const pb = edge(b, offset, 0);
    const a0 = new Vector3(pa.x, bottom(a.pos.y), pa.z);
    const a1 = new Vector3(pa.x, top(a.pos.y), pa.z);
    const b0 = new Vector3(pb.x, bottom(b.pos.y), pb.z);
    const b1 = new Vector3(pb.x, top(b.pos.y), pb.z);
    for (const v of [a0, b0, a1, a1, b0, b1]) {
      positions.push(v.x, v.y, v.z);
      colors.push(c.r, c.g, c.b);
    }
  });
  return finish(positions, colors);
}

/** 재현 가능한 난수 (장식물 배치용) */
export function seededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 트랙에서 minDistance 이상 떨어진 곳에 장식물 위치를 흩뿌린다 */
export function scatterAroundTrack(track: Track, count: number, minDistance: number, spread: number, seed: number) {
  const rand = seededRandom(seed);
  const xs = track.samples.map((s) => s.pos.x);
  const zs = track.samples.map((s) => s.pos.z);
  const minX = Math.min(...xs) - spread;
  const maxX = Math.max(...xs) + spread;
  const minZ = Math.min(...zs) - spread;
  const maxZ = Math.max(...zs) + spread;
  const result: Vector3[] = [];
  for (let tries = 0; result.length < count && tries < count * 20; tries++) {
    const p = new Vector3(minX + rand() * (maxX - minX), 0, minZ + rand() * (maxZ - minZ));
    let near = Infinity;
    for (let i = 0; i < track.samples.length; i += 2) {
      const s = track.samples[i].pos;
      near = Math.min(near, Math.hypot(s.x - p.x, s.z - p.z));
    }
    if (near > minDistance) result.push(p);
  }
  return { points: result, rand };
}
