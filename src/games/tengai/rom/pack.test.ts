import { afterEach, describe, expect, it, vi } from 'vitest';
import { readHostedPack } from './pack';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('사이트의 텐가이 팩 다운로드', () => {
  it('다운로드한 바이트를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([80, 75, 3, 4]))));
    expect(await readHostedPack()).toEqual(new Uint8Array([80, 75, 3, 4]));
  });

  it.each([404, 410])('팩이 배포되지 않았으면 직접 선택으로 넘긴다 (%s)', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(await readHostedPack()).toBeNull();
  });

  it('서버 오류를 정상 데이터로 취급하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 503 })));
    await expect(readHostedPack()).rejects.toThrow('503');
  });

  it('응답이 없는 연결을 중단한다', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
    }));
    const rejected = expect(readHostedPack()).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
