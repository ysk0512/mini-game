import type { Palette, Sprite } from '../../../shared/pixelSprite';

/** 모든 스프라이트는 위를 보는 방향으로 그리고, 2배로 확대한다 */
export const SPRITE_SCALE = 2;

// 전투기 13x13
export const FIGHTER: Sprite = [
  '......W......',
  '......W......',
  '.....WWW.....',
  '.....WRW.....',
  '..R..WWW..R..',
  '..R.WWWWW.R..',
  '..WWWWRWWWW..',
  '.BWWWRRRWWWB.',
  'WWWWWWWWWWWWW',
  'WWW.WWWWW.WWW',
  'WW..WWRWW..WW',
  'W...RR.RR...W',
  'W...........W',
];

export const FIGHTER_PALETTE: Palette = { W: '#f1f5f9', R: '#ef4444', B: '#3b82f6' };
/** 보스에게 붙잡힌 전투기는 빨갛게 */
export const CAPTIVE_PALETTE: Palette = { W: '#ef4444', R: '#f1f5f9', B: '#f1f5f9' };

// 벌 12x10
export const BEE: [Sprite, Sprite] = [
  [
    'B....YY....B',
    'BB..YYYY..BB',
    '.BBYRYYRYBB.',
    '..BYYYYYYB..',
    '..BYRRRRYB..',
    '.BBYYYYYYBB.',
    'BB..YRRY..BB',
    'B....YY....B',
    '.....YY.....',
    '............',
  ],
  [
    '............',
    '....YYYY....',
    '..BYRYYRYB..',
    '.BBYYYYYYBB.',
    'BBBYRRRRYBBB',
    '.BBYYYYYYBB.',
    '..B.YRRY.B..',
    '.....YY.....',
    '.....YY.....',
    '............',
  ],
];

export const BEE_PALETTE: Palette = { Y: '#facc15', B: '#3b82f6', R: '#ef4444' };

// 나비 12x10
export const BUTTERFLY: [Sprite, Sprite] = [
  [
    '..W......W..',
    '...W....W...',
    'WW..RRRR..WW',
    'WWWRRWWRRWWW',
    'BWWRRRRRRWWB',
    'BBWWRRRRWWBB',
    '.BBW.RR.WBB.',
    '..B..RR..B..',
    '.....RR.....',
    '............',
  ],
  [
    '..W......W..',
    'BW..RRRR..WB',
    'BWWRRWWRRWWB',
    'BWWRRRRRRWWB',
    '.BWWRRRRWWB.',
    '..BW.RR.WB..',
    '....RRRR....',
    '.....RR.....',
    '............',
    '............',
  ],
];

export const BUTTERFLY_PALETTE: Palette = { R: '#ef4444', W: '#f1f5f9', B: '#3b82f6' };

// 보스 14x12
export const BOSS: [Sprite, Sprite] = [
  [
    '....GG..GG....',
    '...GGGGGGGG...',
    '..GGYGGGGYGG..',
    '..GGGGGGGGGG..',
    'GG.GGOOOOGG.GG',
    'GGGGGOOOOGGGGG',
    'GG.GGGGGGGG.GG',
    'G...GGGGGG...G',
    '.....GGGG.....',
    '....G....G....',
    '...GG....GG...',
    '..............',
  ],
  [
    'G...GG..GG...G',
    'GG.GGGGGGGG.GG',
    'GGGGYGGGGYGGGG',
    'G.GGGGGGGGGG.G',
    '...GGOOOOGG...',
    '...GGOOOOGG...',
    '....GGGGGG....',
    '.....GGGG.....',
    '.....GGGG.....',
    '....G....G....',
    '...GG....GG...',
    '..............',
  ],
];

export const BOSS_PALETTE: Palette = { G: '#22c55e', Y: '#fde047', O: '#f97316' };
/** 한 번 맞은 보스 */
export const BOSS_HURT_PALETTE: Palette = { G: '#a855f7', Y: '#fde047', O: '#f97316' };
