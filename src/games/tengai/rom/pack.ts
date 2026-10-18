import { unzipSync } from 'fflate';
import * as manual from '../port/manual';
import * as runtime from '../port/runtime';
import type { GeneratedPort } from '../play/TengaiPlayer';
import { spriteLutFrom, type TengaiRom } from './parse';

/**
 * 텐가이 데이터 파일 (npm run tengai:pack 이 만드는 zip).
 * 사이트에 배포된 팩 또는 사용자가 선택한 팩을 읽어 브라우저(IndexedDB)에 저장한다.
 */
export interface TengaiPack {
  rom: TengaiRom;
  port: GeneratedPort;
}

export class BadPackError extends Error {}

/** GitHub Pages의 저장소 하위 경로에서도 같은 사이트의 팩을 찾는다. */
export async function readHostedPack(): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}tengai-pack.zip`, {
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) throw new BadPackError(`데이터 다운로드 실패 (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

/** 변환본은 CommonJS로 묶여 있고 runtime/manual을 require 한다 */
function evalModule(code: string): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const require = (id: string) => {
    if (id === '../runtime') return runtime;
    if (id === '../manual') return manual;
    throw new BadPackError(`알 수 없는 모듈: ${id}`);
  };
  new Function('exports', 'require', code)(exports, require);
  return exports;
}

export function unpack(data: Uint8Array): TengaiPack {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new BadPackError('zip 파일이 아닙니다.');
  }
  const need = (name: string) => {
    const f = files[name];
    if (!f) throw new BadPackError(`텐가이 데이터 파일이 아닙니다 (${name} 없음).`);
    return f;
  };
  need('pack.json');
  const text = new TextDecoder();
  const cf = evalModule(text.decode(need('cfuncs.js')));
  const pc = evalModule(text.decode(need('pcode.js')));
  return {
    rom: {
      prog: need('prog.bin'),
      sprites: need('sprites.bin'),
      spriteLut: spriteLutFrom(need('spritelut.bin')),
      layers: need('layers.bin'),
      soundCpu: files['sound-z80.bin'],
      samples: files['samples.bin'],
    },
    port: {
      FUNCTIONS: cf.FUNCTIONS as GeneratedPort['FUNCTIONS'],
      PARAMS: cf.PARAMS as GeneratedPort['PARAMS'],
      PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS as GeneratedPort['PCODE_FUNCTIONS'],
    },
  };
}

const DB = 'tengai';
const STORE = 'pack';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** 저장해 둔 데이터 파일 (없으면 null) */
export async function readStoredPack(): Promise<Uint8Array | null> {
  const buf = await withStore<ArrayBuffer | undefined>('readonly', (s) => s.get(KEY));
  return buf ? new Uint8Array(buf) : null;
}

export function storePack(data: Uint8Array): Promise<unknown> {
  return withStore('readwrite', (s) => s.put(data.slice().buffer, KEY));
}

export function clearStoredPack(): Promise<unknown> {
  return withStore('readwrite', (s) => s.delete(KEY));
}
