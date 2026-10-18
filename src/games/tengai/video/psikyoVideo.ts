/**
 * Psikyo 68EC020 기판(텐가이)의 화면 합성을 그대로 옮긴 소프트웨어 렌더러.
 * MAME psikyo_v.cpp(screen_update, get_sprites, draw_sprites)와 같은 규칙을 따른다.
 *
 * 입력은 하드웨어 메모리 이미지(빅엔디언 바이트 배열)라서
 * MAME 캡처를 그대로 넣어 검증할 수 있고, 게임 엔진도 같은 형식으로 상태를 채워 그린다.
 */
import { TILE_BYTES, rgb555ToAbgr } from '../rom/parse';

export const SCREEN_W = 320;
export const SCREEN_H = 224;

/** 0x400000 스프라이트 RAM 크기 */
export const SPRITE_RAM_BYTES = 0x2000;
/** 0x600000 팔레트 RAM 크기 (0x1000색) */
export const PALETTE_RAM_BYTES = 0x2000;
/** 0x800000 레이어0 VRAM, 0x802000 레이어1 VRAM, 0x804000 레지스터(라인 스크롤 포함) */
export const VRAM_BYTES = 0x8000;

export interface VideoState {
  spriteRam: Uint8Array;
  paletteRam: Uint8Array;
  vram: Uint8Array;
  /** 0xC00007에 쓴 값: 비트 4-5 = 레이어0 타일 뱅크, 6-7 = 레이어1 타일 뱅크 */
  bankByte: number;
}

export interface VideoGfx {
  sprites: Uint8Array;
  spriteLut: Uint16Array;
  layers: Uint8Array;
}

export function createVideoState(): VideoState {
  return {
    spriteRam: new Uint8Array(SPRITE_RAM_BYTES),
    paletteRam: new Uint8Array(PALETTE_RAM_BYTES),
    vram: new Uint8Array(VRAM_BYTES),
    bankByte: 0,
  };
}

const r16 = (m: Uint8Array, a: number) => (m[a] << 8) | m[a + 1];

const TILEMAP_W = 4096;
const TILEMAP_H = 2048;
const VREGS = 0x4000;

/** MAME tile_scan: 레지스터의 크기 설정에 따라 (열, 행) → VRAM 항목 번호 */
function tileScan(size: number, col: number, row: number): number {
  switch (size) {
    case 0:
      return (col & 0x3f) | ((row & 0x3f) << 6) | ((col & 0xc0) << 6) | ((row & 0x40) << 8);
    case 1:
      return (col & 0x7f) | ((row & 0x1f) << 7) | ((col & 0x80) << 5) | ((row & 0x60) << 8);
    case 2:
      return (col & 0xff) | ((row & 0x0f) << 8) | ((row & 0x70) << 8);
    default:
      return (col & 0x1f) | ((row & 0x7f) << 5) | ((col & 0xe0) << 7);
  }
}

export interface LayerRegs {
  scrollX: number;
  scrollY: number;
  ctrl: number;
  enabled: boolean;
  size: number;
  transparentPen: number;
  opaque: boolean;
  /** 0 = 없음, 1 = 라인마다, 16 = 타일(16줄)마다 */
  rowScroll: 0 | 1 | 16;
}

export function layerRegs(vram: Uint8Array, layer: 0 | 1): LayerRegs {
  const ctrl = r16(vram, VREGS + (layer ? 0x416 : 0x412));
  return {
    scrollY: r16(vram, VREGS + (layer ? 0x40a : 0x402)),
    scrollX: r16(vram, VREGS + (layer ? 0x40e : 0x406)),
    ctrl,
    enabled: (ctrl & 1) === 0,
    size: (ctrl >> 6) & 3,
    transparentPen: ctrl & 8 ? 0 : 15,
    opaque: (ctrl & 2) !== 0,
    rowScroll: ctrl & 0x300 ? (ctrl & 0x200 ? 16 : 1) : 0,
  };
}

/** 팔레트 RAM 전체를 미리 RGBA로 바꿔 둔다 */
function decodePaletteRam(ram: Uint8Array): Uint32Array {
  const out = new Uint32Array(0x1000);
  for (let i = 0; i < 0x1000; i++) out[i] = rgb555ToAbgr(r16(ram, i * 2));
  return out;
}

/** 4bpp packed 타일의 (x, y) 픽셀 */
const tilePixel = (gfx: Uint8Array, tile: number, x: number, y: number) => {
  const b = gfx[tile * TILE_BYTES + y * 8 + (x >> 1)];
  return x & 1 ? b & 15 : b >> 4;
};

export interface RenderTarget {
  /** SCREEN_W x SCREEN_H, ImageData와 같은 RGBA 순서의 Uint32 */
  pixels: Uint32Array;
  /** 픽셀마다 그린 대상 (0 = 배경색, 1 = 레이어0, 2 = 레이어1, SPRITE_PRIORITY = 스프라이트) */
  priority: Uint8Array;
}

export function createRenderTarget(): RenderTarget {
  return { pixels: new Uint32Array(SCREEN_W * SCREEN_H), priority: new Uint8Array(SCREEN_W * SCREEN_H) };
}

export function renderFrame(state: VideoState, gfx: VideoGfx, target: RenderTarget = createRenderTarget()): RenderTarget {
  const pens = decodePaletteRam(state.paletteRam);
  const regs = [layerRegs(state.vram, 0), layerRegs(state.vram, 1)] as const;
  const banks = [(state.bankByte >> 4) & 3, (state.bankByte >> 6) & 3];

  const bg = pens[regs[0].ctrl & 8 ? 0x800 : 0x80f];
  target.pixels.fill(bg);
  target.priority.fill(0);

  for (const layer of [0, 1] as const) {
    if (regs[layer].enabled) drawLayer(state, gfx, target, pens, layer, regs[layer], banks[layer]);
  }

  const spriteCtrl = r16(state.spriteRam, 0x1ffe);
  if ((spriteCtrl & 1) === 0) drawSprites(state, gfx, target, pens, spriteCtrl);
  return target;
}

function drawLayer(
  state: VideoState,
  gfx: VideoGfx,
  target: RenderTarget,
  pens: Uint32Array,
  layer: 0 | 1,
  regs: LayerRegs,
  bank: number,
) {
  const vramBase = layer * 0x2000;
  const colorBase = 0x800 + layer * 0x400;
  const pri = layer + 1;
  const lineScrollBase = VREGS + layer * 0x200;
  for (let sy = 0; sy < SCREEN_H; sy++) {
    let sx0 = regs.scrollX;
    if (regs.rowScroll) sx0 += r16(state.vram, lineScrollBase + 2 * (regs.rowScroll === 16 ? sy >> 4 : sy));
    const my = (sy + regs.scrollY) & (TILEMAP_H - 1);
    const row = my >> 4;
    const ty = my & 15;
    for (let sx = 0; sx < SCREEN_W; sx++) {
      const mx = (sx + sx0) & (TILEMAP_W - 1);
      const entry = r16(state.vram, vramBase + 2 * (tileScan(regs.size, mx >> 4, row) & 0xfff));
      const tile = (entry & 0x1fff) + 0x2000 * bank;
      const pen = tilePixel(gfx.layers, tile, mx & 15, ty);
      if (!regs.opaque && pen === regs.transparentPen) continue;
      const i = sy * SCREEN_W + sx;
      target.pixels[i] = pens[colorBase + (entry >> 13) * 16 + pen];
      target.priority[i] = pri;
    }
  }
}

/** attr 비트 6-7 → 가려지는 레이어 우선순위 마스크 (MAME pri[]) */
const PRIORITY_MASKS = [0, 0xfc, 0xff, 0xff];
/**
 * MAME drawgfx의 우선순위 그리기는 그린 픽셀에 31을 기록하고, 마스크의 최상위 비트를 항상 켠다.
 * 그래서 이미 스프라이트가 그려진 픽셀에는 다른 스프라이트가 덮어쓰지 못한다.
 * 목록 끝부터 그리므로 결과적으로 목록 뒤쪽 스프라이트가 위에 보인다.
 */
const SPRITE_PRIORITY = 31;

function drawSprites(state: VideoState, gfx: VideoGfx, target: RenderTarget, pens: Uint32Array, spriteCtrl: number) {
  const ram = state.spriteRam;
  const trans0 = (spriteCtrl & 4) !== 0;
  const trans15 = (spriteCtrl & 8) !== 0;
  const lutMask = gfx.spriteLut.length - 1;

  // 표시 목록(0x1800~)을 읽은 뒤 뒤에서부터 그린다 (먼저 그린 픽셀이 남으므로 목록 뒤쪽이 위)
  const list: number[] = [];
  for (let offs = 0; offs < (0x800 - 2) / 2; offs++) {
    const idx = r16(ram, 0x1800 + offs * 2);
    if (idx === 0xffff) break;
    list.push(idx % 0x300);
  }

  for (let li = list.length - 1; li >= 0; li--) {
    const src = list[li] * 8;
    const yw = r16(ram, src);
    const xw = r16(ram, src + 2);
    const attr = r16(ram, src + 4);
    let code = ((attr & 1) << 16) | r16(ram, src + 6);

    const flipX = (attr & 0x4000) !== 0;
    const flipY = (attr & 0x8000) !== 0;
    const zx = (xw >> 12) & 15;
    const zy = (yw >> 12) & 15;
    const nx = ((xw >> 9) & 7) + 1;
    const ny = ((yw >> 9) & 7) + 1;
    let x = xw & 0x1ff;
    let y = (yw & 0xff) - (yw & 0x100);
    if (x >= 0x180) x -= 0x200;
    x += Math.floor((nx * zx + 2) / 4);
    y += Math.floor((ny * zy + 2) / 4);
    const zoomX = 32 - zx;
    const zoomY = 32 - zy;
    const colorBase = ((attr >> 8) & 0x1f) * 16;
    const pmask = PRIORITY_MASKS[(attr >> 6) & 3] | (1 << SPRITE_PRIORITY);

    for (let i = 0; i < ny; i++) {
      const dy = flipY ? ny - 1 - i : i;
      for (let j = 0; j < nx; j++) {
        const dx = flipX ? nx - 1 - j : j;
        const tile = gfx.spriteLut[code & lutMask];
        code++;
        const unzoomed = zoomX === 32 && zoomY === 32;
        const tx = unzoomed ? x + dx * 16 : x + Math.floor((dx * zoomX) / 2);
        const ty = unzoomed ? y + dy * 16 : y + Math.floor((dy * zoomY) / 2);
        drawSpriteTile(gfx.sprites, target, pens, tile, colorBase, flipX, flipY, tx, ty, zoomX, zoomY, pmask, trans0, trans15);
      }
    }
  }
}

function drawSpriteTile(
  sprites: Uint8Array,
  target: RenderTarget,
  pens: Uint32Array,
  tile: number,
  colorBase: number,
  flipX: boolean,
  flipY: boolean,
  x0: number,
  y0: number,
  zoomX: number,
  zoomY: number,
  pmask: number,
  trans0: boolean,
  trans15: boolean,
) {
  // 확대율 zoom/32: 16픽셀 타일이 zoom/2 픽셀이 된다 (MAME prio_zoom: 0x10000 고정소수점)
  const w = zoomX === 32 ? 16 : (16 * (zoomX << 11) + 0x8000) >> 16;
  const h = zoomY === 32 ? 16 : (16 * (zoomY << 11) + 0x8000) >> 16;
  if (w <= 0 || h <= 0) return;
  const stepX = Math.floor((16 << 16) / w);
  const stepY = Math.floor((16 << 16) / h);
  for (let py = 0; py < h; py++) {
    const sy = y0 + py;
    if (sy < 0 || sy >= SCREEN_H) continue;
    let ty = (py * stepY) >> 16;
    if (flipY) ty = 15 - ty;
    for (let px = 0; px < w; px++) {
      const sx = x0 + px;
      if (sx < 0 || sx >= SCREEN_W) continue;
      let tx = (px * stepX) >> 16;
      if (flipX) tx = 15 - tx;
      const pen = tilePixel(sprites, tile, tx, ty);
      if ((trans0 && pen === 0) || (trans15 && pen === 15)) continue;
      const i = sy * SCREEN_W + sx;
      if ((1 << target.priority[i]) & pmask) continue;
      target.pixels[i] = pens[colorBase + pen];
      target.priority[i] = SPRITE_PRIORITY;
    }
  }
}
