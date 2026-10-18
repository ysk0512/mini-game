/// <reference types="node" />
/**
 * 이식본 실행 실험. ROM 에셋과 생성 코드가 있을 때만, 그리고 TENGAI_RUN_FRAMES를 줄 때만 돈다:
 *   TENGAI_RUN_FRAMES=600 TENGAI_RUN_OUT=<폴더> npx vitest run port.run
 * 지정 간격마다 화면을 <폴더>/rNNNNNN.png로 남긴다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { spriteLutFrom, type TengaiRom } from '../rom/parse';
import { SCREEN_H, SCREEN_W } from '../video/psikyoVideo';

const ASSETS = join(process.cwd(), 'public', 'tengai-assets');
const FRAMES = Number(process.env.TENGAI_RUN_FRAMES ?? 0);
const OUT = process.env.TENGAI_RUN_OUT ?? '';
const EVERY = Number(process.env.TENGAI_RUN_EVERY ?? 60);
const enabled = FRAMES > 0 && existsSync(join(ASSETS, 'prog.bin')) && existsSync(join(__dirname, 'generated', 'cfuncs.ts'));

describe.skipIf(!enabled)('이식본 실행', () => {
  it('부팅 후 프레임 진행', async () => {
    const { TengaiRunner } = await import('./machine');
    const cf = await import('./generated/cfuncs');
    const pc = await import('./generated/pcode');
    const bin = (n: string) => new Uint8Array(readFileSync(join(ASSETS, n)));
    const rom: TengaiRom = { prog: bin('prog.bin'), sprites: bin('sprites.bin'), spriteLut: spriteLutFrom(bin('spritelut.bin')), layers: bin('layers.bin') };
    const runner = new TengaiRunner(rom, { FUNCTIONS: cf.FUNCTIONS, PARAMS: cf.PARAMS, PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS });
    if (OUT) mkdirSync(OUT, { recursive: true });

    runner.boot();
    const t0 = performance.now();
    const samples: { frame: number; colors: number; tasks: number[] }[] = [];
    for (let f = 0; f < FRAMES; f++) {
      runner.step();
      if (OUT && f % EVERY === 0) {
        const target = runner.render();
        const png = new PNG({ width: SCREEN_W, height: SCREEN_H });
        for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
          const c = target.pixels[i];
          png.data.set([c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff, 255], i * 4);
        }
        writeFileSync(join(OUT, `r${String(f).padStart(6, '0')}.png`), PNG.sync.write(png));
        samples.push({
          frame: runner.frame,
          colors: new Set(target.pixels).size,
          tasks: Array.from({ length: 128 }, (_, i) => 0xfffe0014 + i * 16)
            .filter((a) => runner.m.r32(a + 12) !== 0)
            .map((a) => runner.m.r32(a)),
        });
      }
    }
    console.log(`${FRAMES} frames in ${(performance.now() - t0).toFixed(0)} ms`);
    if (OUT) writeFileSync(join(OUT, 'run.json'), JSON.stringify(samples, null, 2));
    expect(runner.frame).toBe(FRAMES);
    expect(runner.m.r32(0xfffe0004)).toBe(FRAMES);
  }, 600_000);
});
