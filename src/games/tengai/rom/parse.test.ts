/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LAYER_PALSET_TABLES,
  SPRITE_PALSET_TABLE,
  allPaletteAddrs,
  cellTile,
  decodeTile,
  guessLayerBank,
  read32,
  readBgMaps,
  readPalette,
  readPaletteSets,
  readResources,
  rgb555ToAbgr,
  spriteLutFrom,
} from './parse';

describe('순수 변환', () => {
  it('RGB555는 상위 비트부터 R, G, B', () => {
    expect(rgb555ToAbgr(0x7c00)).toBe(0xff0000ff); // 빨강
    expect(rgb555ToAbgr(0x03e0)).toBe(0xff00ff00); // 초록
    expect(rgb555ToAbgr(0x801f)).toBe(0xffff0000); // 파랑, 최상위 비트는 무시
  });

  it('4bpp packed 타일은 상위 니블이 왼쪽 픽셀', () => {
    const gfx = new Uint8Array(256);
    gfx[128] = 0x1f;
    const px = decodeTile(gfx, 1);
    expect([px[0], px[1], px[2]]).toEqual([1, 15, 0]);
  });

  it('스프라이트 LUT는 리틀엔디언', () => {
    expect(Array.from(spriteLutFrom(new Uint8Array([0xb7, 0x00, 0x00, 0x01])))).toEqual([0xb7, 0x100]);
  });
});

// 실제 ROM 검증: npm run tengai:extract 로 에셋을 만든 경우에만 돈다
const ASSETS = join(process.cwd(), 'public', 'tengai-assets');
const hasRom = existsSync(join(ASSETS, 'prog.bin'));

describe.skipIf(!hasRom)('텐가이 ROM', () => {
  const prog = hasRom ? new Uint8Array(readFileSync(join(ASSETS, 'prog.bin'))) : new Uint8Array();
  const layers = hasRom ? new Uint8Array(readFileSync(join(ASSETS, 'layers.bin'))) : new Uint8Array();

  it('리셋 벡터', () => {
    expect(read32(prog, 0)).toBe(0xffff8000);
    expect(read32(prog, 4)).toBe(0x80a);
  });

  it('리소스 디렉터리 라벨', () => {
    const labels = readResources(prog).map((r) => r.label);
    expect(labels).toEqual(['PALETTE', 'BGMAPTBL', 'BGMAP', 'REMAP', 'OBJDT', 'PLT TBL', null, null]);
  });

  it('첫 팔레트는 0번이 검정인 파란 그라데이션', () => {
    const pal = readPalette(prog, allPaletteAddrs()[0]);
    expect(pal[0]).toBe(0xff000000);
    expect(pal[1] & 0xff0000).toBeGreaterThan(pal[2] & 0xff0000);
  });

  it('팔레트 세트 표', () => {
    expect(readPaletteSets(prog, LAYER_PALSET_TABLES[0])).toHaveLength(28);
    expect(readPaletteSets(prog, LAYER_PALSET_TABLES[1])).toHaveLength(29);
    expect(readPaletteSets(prog, SPRITE_PALSET_TABLE)).toHaveLength(26);
  });

  it('배경 맵 137개, 17번은 14x118 타일', () => {
    const maps = readBgMaps(prog);
    expect(maps).toHaveLength(137);
    expect(maps[17]).toMatchObject({ rows: 14, cols: 118 });
    expect(maps[17].cells.some((c) => cellTile(c) !== 0)).toBe(true);
  });

  it('뱅크 추정: 숲(17)은 0, 하늘 성(56)은 1', () => {
    const maps = readBgMaps(prog);
    expect(guessLayerBank(layers, maps[17])).toBe(0);
    expect(guessLayerBank(layers, maps[56])).toBe(1);
  });
});
