/// <reference types="node" />
/**
 * MAME 캡처와 픽셀 비교. 캡처 폴더를 지정했을 때만 돈다:
 *   TENGAI_CAPTURE_DIR=<폴더> npx vitest run psikyoVideo.capture
 * 폴더에는 tools/capture.lua가 만든 fNNNNNN_*.bin, fNNNNNN.png, frames.jsonl이 있어야 한다.
 * 각 프레임의 렌더 결과를 fNNNNNN_ours.png로 남긴다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { spriteLutFrom } from '../rom/parse';
import { SCREEN_H, SCREEN_W, renderFrame, type VideoGfx } from './psikyoVideo';

const CAPTURE = process.env.TENGAI_CAPTURE_DIR ?? '';
/** 영역별 표시 지연(프레임). capture.lua가 <영역>, <영역>1~3 파일을 남긴다 */
const lagFile = (region: string, env: string | undefined, fallback: number) => {
  const lag = Number(env ?? fallback);
  return lag ? `${region}${lag}` : region;
};
const SPRITE_FILE = lagFile('sprite', process.env.TENGAI_SPRITE_LAG, 2);
const VRAM_FILE = lagFile('vram', process.env.TENGAI_VRAM_LAG, 0);
const PALETTE_FILE = lagFile('palette', process.env.TENGAI_PALETTE_LAG, 0);
const ASSETS = join(process.cwd(), 'public', 'tengai-assets');
const enabled = CAPTURE !== '' && existsSync(join(CAPTURE, 'frames.jsonl')) && existsSync(join(ASSETS, 'prog.bin'));

describe.skipIf(!enabled)('MAME 캡처 재현', () => {
  // 건너뛸 때도 describe 본문은 실행되므로 ROM 파일은 켜졌을 때만 읽는다
  const gfx: VideoGfx = enabled
    ? {
        sprites: new Uint8Array(readFileSync(join(ASSETS, 'sprites.bin'))),
        spriteLut: spriteLutFrom(new Uint8Array(readFileSync(join(ASSETS, 'spritelut.bin')))),
        layers: new Uint8Array(readFileSync(join(ASSETS, 'layers.bin'))),
      }
    : { sprites: new Uint8Array(0), spriteLut: new Uint16Array(0), layers: new Uint8Array(0) };
  const frames = enabled
    ? readFileSync(join(CAPTURE, 'frames.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { frame: number; bank: number })
    : [];

  it('프레임별 일치율', () => {
    const results: { frame: number; match: number }[] = [];
    for (const { frame, bank } of frames) {
      const p = join(CAPTURE, `f${String(frame).padStart(6, '0')}`);
      const bin = (s: string) => new Uint8Array(readFileSync(`${p}_${s}.bin`));
      const out = renderFrame({ spriteRam: bin(SPRITE_FILE), paletteRam: bin(PALETTE_FILE), vram: bin(VRAM_FILE), bankByte: bank }, gfx);

      const mame = PNG.sync.read(readFileSync(`${p}.png`));
      expect([mame.width, mame.height]).toEqual([SCREEN_W, SCREEN_H]);
      const ours = new PNG({ width: SCREEN_W, height: SCREEN_H });
      let same = 0;
      for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
        const c = out.pixels[i];
        const [r, g, b] = [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff];
        ours.data.set([r, g, b, 255], i * 4);
        if (mame.data[i * 4] === r && mame.data[i * 4 + 1] === g && mame.data[i * 4 + 2] === b) same++;
      }
      writeFileSync(`${p}_ours.png`, PNG.sync.write(ours));
      results.push({ frame, match: same / (SCREEN_W * SCREEN_H) });
    }
    console.table(results.map((r) => ({ frame: r.frame, match: `${(r.match * 100).toFixed(2)}%` })));
    const median = results.map((r) => r.match).sort((a, b) => a - b)[Math.floor(results.length / 2)];
    expect(median).toBeGreaterThan(0.95);
  });
});
