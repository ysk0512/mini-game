import { spriteLutFrom, type TengaiRom } from './parse';

/** npm run tengai:extract 가 만드는 폴더 (public/tengai-assets, 커밋하지 않음) */
export const ASSET_BASE = `${import.meta.env.BASE_URL}tengai-assets/`;

export class MissingRomError extends Error {}

async function fetchBin(name: string): Promise<Uint8Array> {
  const res = await fetch(ASSET_BASE + name);
  // vite 개발 서버는 없는 파일에 index.html을 돌려주기도 하므로 타입도 확인한다
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || type.includes('text/html')) throw new MissingRomError(name);
  return new Uint8Array(await res.arrayBuffer());
}

let cached: Promise<TengaiRom> | null = null;

/** 한 번만 내려받아 재사용한다 (그래픽 약 12MB + 사운드 약 4MB) */
export function loadRom(): Promise<TengaiRom> {
  // 사운드 ROM은 없어도 게임은 돌므로 실패를 허용한다
  const optional = (name: string) => fetchBin(name).catch(() => undefined);
  cached ??= Promise.all([
    fetchBin('prog.bin'),
    fetchBin('sprites.bin'),
    fetchBin('spritelut.bin'),
    fetchBin('layers.bin'),
    optional('sound-z80.bin'),
    optional('samples.bin'),
  ]).then(([prog, sprites, lut, layers, soundCpu, samples]) => ({ prog, sprites, spriteLut: spriteLutFrom(lut), layers, soundCpu, samples }));
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
