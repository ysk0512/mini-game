/** 문자 하나가 픽셀 하나인 도트 스프라이트. '.'은 투명 */
export type Sprite = string[];
export type Palette = Record<string, string>;

export const SCALE = 3;

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, palette: Palette, x: number, y: number) {
  const left = Math.round(x);
  const top = Math.round(y);
  sprite.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(left + c * SCALE, top + r * SCALE, SCALE, SCALE);
    }
  });
}

// 찰리: 10x16 → 30x48
const CHARLIE_TOP: Sprite = [
  '...RRRR...',
  '..RRRRRR..',
  '..SSSSSS..',
  '..SKSSKS..',
  '..SSRRSS..',
  '...SSSS...',
  '..WWWWWW..',
  '.BBBYYBBB.',
  'SBBBYYBBBS',
  'S.BBYYBB.S',
];

export const CHARLIE_STAND: Sprite = [
  ...CHARLIE_TOP,
  '..BBBBBB..',
  '..BB..BB..',
  '..BB..BB..',
  '..BB..BB..',
  '..RR..RR..',
  '.RRR..RRR.',
];

export const CHARLIE_WALK: Sprite = [
  ...CHARLIE_TOP,
  '..BBBBBB..',
  '.BB....BB.',
  '.BB....BB.',
  'BB......BB',
  'RR......RR',
  'RR......RR',
];

/** 팔을 머리 위로 든 자세 (그네·점프) */
export const CHARLIE_ARMS_UP: Sprite = [
  'S..RRRR..S',
  'S.RRRRRR.S',
  'S.SSSSSS.S',
  'S.SKSSKS.S',
  'SSSSRRSSSS',
  '.B.SSSS.B.',
  '.BWWWWWWB.',
  '..BBYYBB..',
  '..BBYYBB..',
  '..BBYYBB..',
  '..BBBBBB..',
  '..BB..BB..',
  '..BB..BB..',
  '..BB..BB..',
  '..RR..RR..',
  '.RRR..RRR.',
];

export const CHARLIE_PALETTE: Palette = {
  R: '#e53935',
  S: '#ffcc99',
  K: '#1a1a1a',
  W: '#ffffff',
  B: '#2563eb',
  Y: '#facc15',
};

// 사자: 20x12 → 60x36 (오른쪽을 봄)
const LION_TOP: Sprite = [
  '...............MMM..',
  '.............MMMMMM.',
  '............MMOOOOMM',
  'T...........MMOKOOMM',
  '.T..........MMOOOOKM',
  '..OOOOOOOOOOMMOOOOM.',
  '..OOOOOOOOOOOMMMMM..',
  '..OOOOOOOOOOOOO.....',
  '..OOOOOOOOOOOOO.....',
];

export const LION_STAND: Sprite = [...LION_TOP, '..OO..OO...OO..OO...', '..OO..OO...OO..OO...', '..KK..KK...KK..KK...'];

export const LION_RUN: Sprite = [...LION_TOP, '.OO....OO.OO....OO..', 'OO......OOO......OO.', 'KK.......KK.......KK'];

export const LION_PALETTE: Palette = {
  O: '#e8a33d',
  M: '#9a4a1c',
  K: '#1a1a1a',
  T: '#9a4a1c',
};

// 원숭이: 8x10 → 24x30
export const MONKEY: Sprite = [
  '..NNNN..',
  '.NSSSSN.',
  'NNSKSKNN',
  '.NSSSSN.',
  '..NNNN..',
  '.NNNNNN.',
  'NNNNNNNN',
  'S.NNNN.S',
  '..N..N..',
  '.NN..NN.',
];

export const MONKEY_WALK: Sprite = [...MONKEY.slice(0, 8), '.N....N.', 'NN....NN'];

export const BROWN_MONKEY_PALETTE: Palette = { N: '#8b4513', S: '#f5c49b', K: '#1a1a1a' };
export const BLUE_MONKEY_PALETTE: Palette = { N: '#2563eb', S: '#f5c49b', K: '#1a1a1a' };
