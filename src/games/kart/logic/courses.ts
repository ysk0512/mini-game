export type Theme = 'sunset' | 'canyon';

export interface CourseDef {
  id: string;
  name: string;
  description: string;
  theme: Theme;
  /** 아스팔트 폭 */
  width: number;
  /** 아스팔트 양옆의 잔디(감속 구간) 폭. 그 바깥에 벽이 있다 */
  grass: number;
  /** 닫힌 곡선의 제어점 [x, y, z]. 첫 점이 출발선이고 진행 방향으로 이어진다 */
  points: [number, number, number][];
  /** 부스트 패드 위치 [x, z] (가장 가까운 트랙 지점에 놓인다) */
  boostPads: [number, number][];
  /** 아이템 박스 줄 위치 [x, z] */
  itemRows: [number, number][];
}

const scale = (points: [number, number, number][], s: number): [number, number, number][] =>
  points.map(([x, y, z]) => [x * s, y, z * s]);

export const COURSES: CourseDef[] = [
  {
    id: 'sunset',
    name: '선셋 서킷',
    description: '넓고 평평한 입문 코스. 완만한 커브에서 드리프트를 연습해 보세요.',
    theme: 'sunset',
    width: 16,
    grass: 5,
    points: scale(
      [
        [0, 0, 0],
        [0, 0, 80],
        [10, 0, 140],
        [50, 0, 170],
        [100, 0, 160],
        [120, 0, 120],
        [150, 0, 90],
        [200, 0, 100],
        [230, 0, 140],
        [270, 0, 150],
        [300, 0, 110],
        [290, 0, 40],
        [250, 0, -10],
        [180, 0, -30],
        [100, 0, -40],
        // 출발선 앞은 넓게 돌아 직선으로 들어오도록
        [30, 0, -40],
        [9, 0, -31],
        [0, 0, -10],
      ],
      1.0,
    ),
    boostPads: [
      [0, 60],
      [295, 75],
    ],
    itemRows: [
      [8, 125],
      [200, 90],
      [125, -40],
    ],
  },
  {
    id: 'canyon',
    name: '캐니언 랠리',
    description: '좁은 협곡 코스. 점프대, 헤어핀, 고갯길이 기다립니다.',
    theme: 'canyon',
    width: 12,
    grass: 4,
    points: [
      [0, 0, 0],
      [0, 0, 50],
      [0, 2, 80],
      [0, 5, 100],
      [0, 6, 108],
      [0, 1, 128],
      [0, 0, 150],
      [15, 0, 185],
      [45, 0, 200],
      [75, 0, 190],
      [85, 0, 165],
      [70, 0, 140],
      [60, 1, 100],
      [80, 5, 60],
      [120, 6, 40],
      [150, 3, 10],
      [140, 0, -30],
      [100, 0, -50],
      [50, 0, -50],
      [15, 0, -45],
      // 출발선 앞은 직선이 되도록
      [0, 0, -25],
    ],
    boostPads: [
      [0, 88],
      [100, 50],
    ],
    itemRows: [
      [0, 30],
      [30, 196],
      [120, -45],
    ],
  },
];

export const courseById = (id: string) => COURSES.find((c) => c.id === id) ?? COURSES[0];
