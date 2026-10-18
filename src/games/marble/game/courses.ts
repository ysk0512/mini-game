export type Vec3 = [number, number, number];
export interface Platform {
  id: string;
  at: Vec3;
  size: [number, number];
  tilt?: number;
  motion?: { axis: 'x' | 'z'; distance: number; period: number };
}
export interface Course {
  name: string; english: string; description: string; tip: string; color: string;
  par: number; start: Vec3; goal: Vec3; platforms: Platform[];
  gems: Vec3[]; checkpoints: Vec3[]; sweepers: { at: Vec3; length: number; speed: number }[];
  springs: Vec3[];
}
const tile = (id: string, x: number, y: number, z: number, width: number, depth: number, tilt?: number): Platform =>
  ({ id, at: [x, y, z], size: [width, depth], tilt });
const slope = Math.atan2(1.8, 6);

export const COURSES: Course[] = [
  {
    name: '구름 정원', english: 'CLOUD GARDEN', description: '넓은 길, 느긋한 첫걸음',
    tip: '방향을 바꾸기 전에 Shift로 속도를 줄여 보세요.', color: '#71b6a1', par: 70,
    start: [-8, 0, 8], goal: [-1, 0, -1],
    platforms: [
      tile('start', -8, 0, 8, 4, 4), tile('west', -8, 0, 1, 3.2, 14),
      tile('northwest', -8, 0, -6, 4, 4), tile('north', -0.5, 0, -6, 15, 3),
      tile('northeast', 7, 0, -6, 4, 4), tile('east', 7, 0, 0, 3, 12),
      tile('southeast', 7, 0, 6, 4, 4), tile('south', 3, 0, 6, 8, 3),
      tile('southwest', -1, 0, 6, 3.5, 3.5), tile('center', -1, 0, 2.5, 3, 7),
      tile('goal', -1, 0, -1, 4, 4),
    ],
    gems: [[-8, 0, 2], [-2, 0, -6], [7, 0, 1], [-1, 0, 3]],
    checkpoints: [[-8, 0, -6], [7, 0, 6]], sweepers: [], springs: [],
  },
  {
    name: '선셋 브리지', english: 'SUNSET BRIDGES', description: '경사로와 회전 장애물',
    tip: '경사로에서는 속도를 유지하고, 회전 막대는 Space로 넘으세요.', color: '#ce9872', par: 80,
    start: [-8, 0, 8], goal: [-4, 0, 5],
    platforms: [
      tile('start', -8, 0, 8, 4, 4), tile('approach', -8, 0, 5, 3, 6),
      tile('uphill', -8, 0.9, -1, 2.7, Math.hypot(6, 1.8), slope),
      tile('high-island', -8, 1.8, -5, 4, 3), tile('bridge', -2, 1.8, -5, 10, 2.2),
      tile('far-island', 5, 1.8, -5, 4, 4),
      tile('downhill', 5, 0.9, 0, 2.7, Math.hypot(6, 1.8), slope),
      tile('low-island', 5, 0, 5, 4, 4), tile('return', 0, 0, 5, 8, 2.4),
      tile('goal', -4, 0, 5, 3.5, 3.5),
    ],
    gems: [[-8, 0, 5], [-8, 1.8, -5], [-1, 1.8, -5], [5, 0, 5], [-4, 0, 5]],
    checkpoints: [[-8, 1.8, -5], [5, 0, 5]],
    sweepers: [{ at: [-0.5, 1.8, -5], length: 2.5, speed: 0.85 }], springs: [],
  },
  {
    name: '별빛 공장', english: 'STARLIGHT WORKS', description: '움직이는 다리와 점프대',
    tip: '민트색 이동 발판에 올라타세요. 노란 점프대에서는 오른쪽으로 달리세요.', color: '#9691cc', par: 90,
    start: [-8, 0, 8], goal: [0, 0, 4],
    platforms: [
      tile('start', -8, 0, 8, 4, 4), tile('approach', -8, 0, 5, 3, 6),
      { ...tile('ferry', -8, 0, 0, 3, 3), motion: { axis: 'z', distance: 2, period: 6 } },
      tile('arrival', -8, 0, -4, 4, 4), tile('launch', -4.75, 0, -4, 6.5, 2.5),
      tile('landing', 2, 0, -4, 4, 4), tile('east-bridge', 4.5, 0, -4, 5, 2.5),
      tile('turn', 7, 0, -4, 3.5, 3.5), tile('east', 7, 0, 0, 2.6, 8),
      tile('return-turn', 7, 0, 4, 3.5, 3.5), tile('return', 3.5, 0, 4, 7, 2.4),
      tile('goal', 0, 0, 4, 4, 4),
    ],
    gems: [[-8, 0, 6], [-8, 0, -4], [-4, 0, -4], [2, 0, -4], [7, 0, 2], [0, 0, 4]],
    checkpoints: [[-8, 0, -4], [2, 0, -4]],
    sweepers: [{ at: [7, 0, 0], length: 2.8, speed: -0.7 }], springs: [[-2.1, 0, -4]],
  },
];

export function platformPosition(platform: Platform, time: number): Vec3 {
  const at: Vec3 = [...platform.at];
  if (platform.motion) {
    const m = platform.motion;
    at[m.axis === 'x' ? 0 : 2] += Math.cos(time * Math.PI * 2 / m.period) * m.distance;
  }
  return at;
}
