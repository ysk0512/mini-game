import { useEffect, useState } from 'react';
import { AssetViewer } from './dev/AssetViewer';
import { TengaiPlayer, type GeneratedPort } from './play/TengaiPlayer';
import { MissingRomError, loadRom } from './rom/loadRom';
import type { TengaiRom } from './rom/parse';
import './tengai.css';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing'; file: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rom: TengaiRom; port: GeneratedPort | null };

// 원작 프로그램에서 변환한 코드(port/generated/)는 저장소에 없을 수 있어, 있을 때만 불러온다
const generated = import.meta.glob('./port/generated/*.ts');

async function loadPort(): Promise<GeneratedPort | null> {
  const c = generated['./port/generated/cfuncs.ts'];
  const p = generated['./port/generated/pcode.ts'];
  if (!c || !p) return null;
  const [cf, pc] = (await Promise.all([c(), p()])) as [Pick<GeneratedPort, 'FUNCTIONS' | 'PARAMS'>, Pick<GeneratedPort, 'PCODE_FUNCTIONS'>];
  return { FUNCTIONS: cf.FUNCTIONS, PARAMS: cf.PARAMS, PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS };
}

type Tab = 'play' | 'assets';

/**
 * 텐가이 (Psikyo, 1996). 원작 ROM의 그래픽과, 원작 프로그램을 디컴파일해 TypeScript로 옮긴 게임 로직으로 돈다.
 * 사용자가 가진 ROM으로 npm run tengai:extract 를 먼저 실행해야 한다.
 */
export default function TengaiGame() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>('play');

  useEffect(() => {
    let alive = true;
    Promise.all([loadRom(), loadPort()]).then(
      ([rom, port]) => alive && setState({ kind: 'ready', rom, port }),
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof MissingRomError) setState({ kind: 'missing', file: err.message });
        else setState({ kind: 'error', message: String(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="game-page tengai-page">
      <h1>텐가이</h1>
      {state.kind === 'loading' && <p className="loading">ROM 데이터와 게임 로직을 불러오는 중…</p>}
      {state.kind === 'missing' && (
        <div className="tengai-missing">
          <p>
            ROM 데이터(<code>{state.file}</code>)가 없습니다. 가지고 있는 MAME 텐가이 ROM(zip)으로 아래 명령을 먼저 실행하세요.
          </p>
          <pre>npm run tengai:extract -- &lt;Tengai.zip 경로&gt;</pre>
          <p className="tengai-note">추출한 파일은 public/tengai-assets/에 생기며 저장소에 커밋되지 않습니다.</p>
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
          </div>
          {tab === 'play' &&
            (state.port ? (
              <TengaiPlayer rom={state.rom} port={state.port} />
            ) : (
              <div className="tengai-missing">
                <p>게임 로직(원작 프로그램 변환본)이 없습니다. 분석 도구로 생성해야 합니다.</p>
                <pre>bash D:/Projects/REA_example/tengai/tools/build_port.sh</pre>
              </div>
            ))}
          {tab === 'assets' && <AssetViewer rom={state.rom} />}
        </>
      )}
    </div>
  );
}
