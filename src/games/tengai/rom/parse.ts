/**
 * 텐가이(Psikyo 68EC020 기판) ROM 데이터 해석.
 * 브라우저와 테스트에서 함께 쓰도록 DOM에 의존하지 않는 순수 함수만 둔다.
 *
 * 프로그램 ROM 0x30000에 "PROJECTCODESH505" 헤더와 리소스 디렉터리가 있고,
 * 각 리소스 앞 8바이트에 'PALETTE ', 'BGMAPTBL' 같은 라벨이 붙어 있다.
 */

export interface TengaiRom {
  /** 68EC020 프로그램 (빅엔디언, 인터리브·바이트 스왑 완료) */
  prog: Uint8Array;
  /** 스프라이트 타일 16x16 4bpp packed (u20, u22, u21) */
  sprites: Uint8Array;
  /** 스프라이트 코드 → 타일 번호 (u1, 리틀엔디언 u16) */
  spriteLut: Uint16Array;
  /** 배경 레이어 타일 16x16 4bpp packed (u34) */
  layers: Uint8Array;
  /** 사운드 Z80 프로그램 (1-u63). 없으면 소리 없이 돈다 */
  soundCpu?: Uint8Array;
  /** YMF278B PCM 샘플 (u61 + u62) */
  samples?: Uint8Array;
}

export const TILE_BYTES = 128;
export const LAYER_BANK_TILES = 0x2000;

const RESOURCE_DIR = 0x30020;
const RESOURCE_COUNT = 8;
const PALETTE_START = 0x30048;
const PALETTE_COUNT = 546;
const BGMAP_TABLE = 0x34490;
export interface PaletteSetTable {
  start: number;
  /** 다음 표 시작 주소 (표들이 연달아 붙어 있다) */
  end: number;
  setSize: number;
}
/** 배경 레이어 팔레트 세트 표 두 개(세트당 8개)와 스프라이트 팔레트 세트 표(세트당 32개). 마지막 표는 'OBJDT' 라벨 직전까지 */
export const LAYER_PALSET_TABLES: readonly PaletteSetTable[] = [
  { start: 0x65fd4, end: 0x66354, setSize: 8 },
  { start: 0x66354, end: 0x666f4, setSize: 8 },
];
export const SPRITE_PALSET_TABLE: PaletteSetTable = { start: 0x666f4, end: 0x673f4, setSize: 32 };
const NO_PALETTE = 0xffffffff;

export const read16 = (rom: Uint8Array, a: number) => (rom[a] << 8) | rom[a + 1];
export const read32 = (rom: Uint8Array, a: number) => ((rom[a] << 24) | (rom[a + 1] << 16) | (rom[a + 2] << 8) | rom[a + 3]) >>> 0;

export function spriteLutFrom(bytes: Uint8Array): Uint16Array {
  const out = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  return out;
}

// ---------------------------------------------------------------- 리소스 디렉터리

export interface Resource {
  addr: number;
  /** 바로 앞 8바이트가 출력 가능한 ASCII면 그 라벨 */
  label: string | null;
}

export function readResources(prog: Uint8Array): Resource[] {
  const out: Resource[] = [];
  for (let i = 0; i < RESOURCE_COUNT; i++) {
    const addr = read32(prog, RESOURCE_DIR + i * 4);
    const bytes = prog.subarray(addr - 8, addr);
    const printable = bytes.every((b) => b >= 0x20 && b < 0x7f);
    out.push({ addr, label: printable ? String.fromCharCode(...bytes).trimEnd() : null });
  }
  return out;
}

// ---------------------------------------------------------------- 팔레트

/** xRGB555(상위 비트부터 R, G, B)를 캔버스 ImageData용 RGBA(리틀엔디언 Uint32 = 0xAABBGGRR)로 */
export function rgb555ToAbgr(v: number): number {
  const r = (v >> 10) & 31;
  const g = (v >> 5) & 31;
  const b = v & 31;
  const e = (c: number) => (c << 3) | (c >> 2);
  return (0xff000000 | (e(b) << 16) | (e(g) << 8) | e(r)) >>> 0;
}

/** ROM 주소의 16색 팔레트 */
export function readPalette(prog: Uint8Array, addr: number): Uint32Array {
  const out = new Uint32Array(16);
  for (let i = 0; i < 16; i++) out[i] = rgb555ToAbgr(read16(prog, addr + i * 2));
  return out;
}

/** 'PALETTE ' 리소스의 모든 팔레트 주소 */
export function allPaletteAddrs(): number[] {
  return Array.from({ length: PALETTE_COUNT }, (_, i) => PALETTE_START + i * 32);
}

/** 팔레트 세트 = 팔레트 주소 배열 (빈 칸은 null) */
export type PaletteSet = (number | null)[];

export function readPaletteSets(prog: Uint8Array, { start: table, end, setSize }: PaletteSetTable): PaletteSet[] {
  const sets: PaletteSet[] = [];
  const paletteEnd = PALETTE_START + PALETTE_COUNT * 32;
  const count = Math.floor((end - table) / (setSize * 4));
  for (let s = 0; s < count; s++) {
    const set: PaletteSet = [];
    for (let i = 0; i < setSize; i++) {
      const p = read32(prog, table + (s * setSize + i) * 4);
      if (p === NO_PALETTE) set.push(null);
      else if (p >= PALETTE_START && p < paletteEnd && (p - PALETTE_START) % 2 === 0) set.push(p);
      else return sets;
    }
    sets.push(set);
  }
  return sets;
}

// ---------------------------------------------------------------- 배경 맵

export interface BgMap {
  index: number;
  addr: number;
  rows: number;
  cols: number;
  /** 행 우선으로 펼친 항목. 상위 3비트 = 팔레트, 하위 13비트 = 뱅크 안 타일 번호 */
  cells: Uint16Array;
}

export const cellTile = (cell: number) => cell & 0x1fff;
export const cellColor = (cell: number) => cell >> 13;

/**
 * BGMAP: u16 행 수, u16 열 쌍 수, 4바이트(용도 미확인), 이어서 항목.
 * 항목은 2타일 폭 세로 띠 단위로 저장된다: (c>>1)번째 띠의 r행에 [왼쪽, 오른쪽].
 */
export function readBgMaps(prog: Uint8Array): BgMap[] {
  const maps: BgMap[] = [];
  for (let index = 0; ; index++) {
    const addr = read32(prog, BGMAP_TABLE + index * 4);
    if (addr < 0x30000 || addr >= prog.length) break;
    const rows = read16(prog, addr);
    const cols = read16(prog, addr + 2) * 2;
    const cells = new Uint16Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = (c >> 1) * rows * 2 + r * 2 + (c & 1);
        cells[r * cols + c] = read16(prog, addr + 8 + k * 2);
      }
    }
    maps.push({ index, addr, rows, cols, cells });
  }
  return maps;
}

// ---------------------------------------------------------------- 타일

/** 16x16 4bpp packed 타일 하나를 픽셀 인덱스 256개로 (상위 니블이 왼쪽 픽셀) */
export function decodeTile(gfx: Uint8Array, tile: number, out = new Uint8Array(256)): Uint8Array {
  const base = tile * TILE_BYTES;
  for (let i = 0; i < 128; i++) {
    const b = gfx[base + i] ?? 0;
    out[i * 2] = b >> 4;
    out[i * 2 + 1] = b & 15;
  }
  return out;
}

/**
 * 맵이 어느 타일 뱅크를 쓰는지는 스테이지 데이터에 있다(미해석).
 * 그 전까지는 이웃 타일 경계의 픽셀 차이가 가장 작은 뱅크를 고른다.
 */
export function guessLayerBank(layers: Uint8Array, map: BgMap): number {
  const banks = Math.floor(layers.length / TILE_BYTES / LAYER_BANK_TILES);
  let best = 0;
  let bestScore = Infinity;
  const a = new Uint8Array(256);
  const b = new Uint8Array(256);
  for (let bank = 0; bank < banks; bank++) {
    let diff = 0;
    let n = 0;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c + 1 < map.cols; c++) {
        const left = map.cells[r * map.cols + c];
        const right = map.cells[r * map.cols + c + 1];
        if (cellTile(left) === 0 && cellTile(right) === 0) continue;
        decodeTile(layers, bank * LAYER_BANK_TILES + cellTile(left), a);
        decodeTile(layers, bank * LAYER_BANK_TILES + cellTile(right), b);
        for (let y = 0; y < 16; y++) diff += a[y * 16 + 15] === b[y * 16] ? 0 : 1;
        n += 16;
      }
    }
    const score = n ? diff / n : Infinity;
    if (score < bestScore) {
      bestScore = score;
      best = bank;
    }
  }
  return best;
}
