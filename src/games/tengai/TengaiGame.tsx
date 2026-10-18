import { useEffect, useState, type ChangeEvent } from 'react';
import { AssetViewer } from './dev/AssetViewer';
import { TengaiPlayer, type GeneratedPort } from './play/TengaiPlayer';
import { MissingRomError, loadRom } from './rom/loadRom';
import { BadPackError, clearStoredPack, readHostedPack, readStoredPack, storePack, unpack } from './rom/pack';
import type { TengaiRom } from './rom/parse';
import './tengai.css';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'needPack'; error?: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rom: TengaiRom; port: GeneratedPort; fromPack: boolean };

// 원작 프로그램에서 변환한 코드(port/generated/)는 저장소에 없을 수 있어, 있을 때만 불러온다
const generated = import.meta.glob('./port/generated/*.ts');

async function loadPort(): Promise<GeneratedPort | null> {
  const c = generated['./port/generated/cfuncs.ts'];
  const p = generated['./port/generated/pcode.ts'];
  if (!c || !p) return null;
  const [cf, pc] = (await Promise.all([c(), p()])) as [Pick<GeneratedPort, 'FUNCTIONS' | 'PARAMS'>, Pick<GeneratedPort, 'PCODE_FUNCTIONS'>];
  return { FUNCTIONS: cf.FUNCTIONS, PARAMS: cf.PARAMS, PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS };
}

/** 개발 에셋 → 사이트의 최신 팩 → 저장된 팩 → 직접 파일 선택. */
async function loadLocal(): Promise<LoadState> {
  const port = await loadPort();
  if (port) {
    try {
      return { kind: 'ready', rom: await loadRom(), port, fromPack: false };
    } catch (err) {
      if (!(err instanceof MissingRomError)) throw err;
    }
  }
  let downloadError: string | undefined;
  try {
    const hosted = await readHostedPack();
    if (hosted) {
      const pack = unpack(hosted);
      await storePack(hosted).catch(() => undefined);
      return { kind: 'ready', ...pack, fromPack: true };
    }
  } catch {
    downloadError = '자동으로 데이터를 불러오지 못했습니다. 데이터 팩을 직접 선택할 수 있습니다.';
  }
  const stored = await readStoredPack().catch(() => null);
  if (!stored) return { kind: 'needPack', error: downloadError };
  try {
    return { kind: 'ready', ...unpack(stored), fromPack: true };
  } catch (err) {
    await clearStoredPack().catch(() => undefined);
    return { kind: 'needPack', error: `저장된 데이터 파일을 읽지 못했습니다: ${(err as Error).message}` };
  }
}

type Tab = 'play' | 'assets';

/**
 * 텐가이 (Psikyo, 1996). 원작 ROM의 그래픽과, 원작 프로그램을 디컴파일해 TypeScript로 옮긴 게임 로직으로 돈다.
 * 개발 PC에서는 추출한 에셋을, 배포 사이트에서는 tengai-pack.zip을 자동으로 불러온다.
 * 자동 다운로드가 불가능하면 저장된 팩이나 직접 선택한 팩을 쓴다.
 */
export default function TengaiGame() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>('play');

  useEffect(() => {
    let alive = true;
    loadLocal().then(
      (s) => alive && setState(s),
      (err: unknown) => alive && setState({ kind: 'error', message: String(err) }),
    );
    return () => {
      alive = false;
    };
  }, []);

  const onPickPack = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setState({ kind: 'loading' });
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const pack = unpack(data);
      await storePack(data).catch(() => undefined); // 저장이 안 돼도 이번에는 플레이할 수 있다
      setState({ kind: 'ready', ...pack, fromPack: true });
    } catch (err) {
      const message = err instanceof BadPackError ? err.message : `불러오기 실패: ${String(err)}`;
      setState({ kind: 'needPack', error: message });
    }
  };

  const onForgetPack = async () => {
    await clearStoredPack().catch(() => undefined);
    setState({ kind: 'needPack' });
  };

  return (
    <div className="game-page tengai-page">
      <h1>텐가이</h1>
      {state.kind === 'loading' && <p className="loading">ROM 데이터와 게임 로직을 불러오는 중…</p>}
      {state.kind === 'needPack' && (
        <div className="tengai-missing">
          <p>텐가이 데이터를 자동으로 불러올 수 없습니다. 데이터 팩을 직접 선택해 주세요.</p>
          <label className="tengai-pick">
            데이터 파일 선택 (.zip)
            <input type="file" accept=".zip,application/zip" onChange={onPickPack} />
          </label>
          {state.error && <p className="tengai-pack-error">{state.error}</p>}
          <p className="tengai-note">
            고른 파일은 이 브라우저에만 저장되고 어디에도 올라가지 않습니다. 데이터 파일은 ROM을 가진 PC에서
            <code> npm run tengai:extract</code> 뒤 <code>npm run tengai:pack</code>으로 만듭니다.
          </p>
        </div>
      )}
      {state.kind === 'error' && <p className="tengai-missing">불러오기 실패: {state.message}</p>}
      {state.kind === 'ready' && (
        <>
          <div className="tengai-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'play'} onClick={() => setTab('play')}>
              플레이
            </button>
            <button type="button" role="tab" aria-selected={tab === 'assets'} onClick={() => setTab('assets')}>
              ROM 에셋
            </button>
            {state.fromPack && (
              <button type="button" className="tengai-forget" onClick={onForgetPack}>
                저장된 데이터 지우기
              </button>
            )}
          </div>
          {tab === 'play' && <TengaiPlayer rom={state.rom} port={state.port} />}
          {tab === 'assets' && <AssetViewer rom={state.rom} />}
        </>
      )}
    </div>
  );
}
