# 텐가이 이식 작업 분담 (Claude Code ↔ Codex)

두 에이전트가 같은 파일을 동시에 고치면 서로의 변경을 덮어쓰므로, **아래 담당 파일만 수정한다.**
상대 담당 파일을 바꿔야 하면 직접 고치지 말고 이 문서의 "요청" 칸에 적는다.

## 공통 배경
- 원작 68EC020 프로그램을 Ghidra로 디컴파일 → `tengai/tools/c2ts.py`로 C→TS 변환, 디컴파일이 깨지는 함수는
  `tengai/tools/ghidra/TengaiPcode2Ts.java`로 P-code→TS 변환. 결과는 `src/games/tengai/port/generated/`(gitignore).
- 전체 재생성: `bash D:/Projects/REA_example/tengai/tools/analyze.sh` (Ghidra 재분석 포함)
  또는 `bash D:/Projects/REA_example/tengai/tools/build_port.sh` (디컴파일 결과 재사용).
- 검증: MAME 처리 경계 덤프와 프레임별 RAM 대조
  - 데모: `TENGAI_LOCK_START=100 TENGAI_LOCK_DIR=D:/Projects/REA_example/tengai/capture/lock2 npx vitest run port.lockstep`
  - 플레이(1스테이지): `... TENGAI_LOCK_DIR=D:/Projects/REA_example/tengai/capture/play2 ...`
  - 한 처리의 쓰기 비교: `PLAY=1 DIR=<덤프폴더> bash D:/Projects/REA_example/tengai/tools/wl.sh <처리번호>`

## Codex 담당: 변환 정확도 (MAME와 끝까지 일치시키기)
- `D:/Projects/REA_example/tengai/tools/**` (c2ts.py, seeds.py, ghidra/*.java, *.lua, wl.sh, wldiff.py 등)
- `src/games/tengai/port/runtime.ts`, `src/games/tengai/port/manual.ts`, `src/games/tengai/port/generated/**`
- `src/games/tengai/port/port.lockstep.test.ts`, `port.writes.test.ts`, `port.run.test.ts`
- 목표: play2 덤프 끝까지, 이후 다른 캐릭터·전 스테이지 덤프까지 대조 통과

### 인계 상태 (2026-10-18, Claude)
- 데모(lock2): 처리 100~2382 전부 일치 (지연 프레임 4번은 MAME 상태로 재동기화).
- 플레이(play2): 처리 100~3808 일치. **3809에서 첫 불일치.**
  - 원인 후보: `0x15F1E`. 디컴파일에 `in_D0`(레지스터 입력)이 있어 c2ts가 P-code로 보내야 하는데
    생성 결과에는 C 변환본이 들어 있다 (`translate()`의 레지스터 규칙이 이 함수에서 동작하지 않는 이유 확인 필요).
  - 같은 함수에 `ushort auStack_10018[32754]` 같은 거대한 지역 배열이 선언되어 `m.enter(65528)`이 되고,
    지역 변수 주소가 0x10000 아래로 밀린다. 지역 변수는 Ghidra 이름의 스택 오프셋 기준으로 배치하는 편이 안전하다.
- 지금까지 찾은 Ghidra/변환 함정 (이미 반영됨): 68020 메모리 간접 주소 지정의 전치/후치 인덱스가
  Ghidra 68000.sinc에서 서로 바뀌어 있음(수정 후 재컴파일), `ror/rol Dn` 회전량 32 이상, 16비트 스택 인자,
  `undefinedN` 비교는 비트 패턴, 같은 주소에 겹친 `DAT_`/`_DAT_` 심볼, 두 종류의 switch 점프 표.

## Claude 담당: 게임 화면 연결 (플레이 가능하게)
- `src/games/tengai/TengaiGame.tsx`, `src/games/tengai/tengai.css`, `src/games/tengai/play/**`(새로 만듦: 입력, 루프, 사운드)
- `src/games/tengai/port/machine.ts` (TengaiRunner의 공개 API: `boot()`, `step()`, `render()`)
- `src/games/registry.ts`의 텐가이 항목, `src/games/tengai/dev/**`, `src/games/tengai/rom/**`, `src/games/tengai/video/**`

## 두 쪽이 함께 쓰는 약속 (바꾸려면 요청 칸에 먼저 적기)
- `TengaiRunner`: `new TengaiRunner(rom, { FUNCTIONS, PARAMS, PCODE_FUNCTIONS })`, `boot()`, `step(extraIrqs?)`,
  `render(): RenderTarget`, `loadDump(dump)`, `m` (TengaiMachine)
- `TengaiMachine` 입력 필드: `p1`, `p2` (PlayerInput), `coin1`, `coin2`, `service`, 그리고 `soundCommands`(프레임마다 사운드 명령 바이트)
- 생성 모듈 export 이름: `cfuncs.ts`의 `FUNCTIONS`, `PARAMS` / `pcode.ts`의 `PCODE_FUNCTIONS`

## 요청
- Codex 최종 대조 완료 (2026-10-18): 아인 클래스 5도 100→159747까지 **159428회 비교 / 219회 지연 재동기화**로 통과했습니다. 6개 실제 캐릭터 클래스 전부 스테이지 인덱스 0~13과 이후 어트랙트 구간을 포함한 기록 대조 완료. 합계 **756832회 비교 통과 / 1189회 재동기화(비교 제외)**. 무적 타이머 FE348E=0x0078 고정 자동 입력 시나리오이며 기존 RAM 제외 영역은 유지합니다. 임의 입력 전체의 완전 동일성을 뜻하지 않습니다. 최종 증거 `tengai/work/port-validation-resume-20261018.json`. 이번 확장 검증에서 추가 런타임/변환 오류는 발견되지 않았고 공개 API·생성 코드 변경은 없습니다.
- Codex 모바일 구현 완료 (2026-10-18): 사용자 요청에 따라 `play/TouchControls.tsx`, `play/touch.ts`, `play/TengaiPlayer.tsx`, `tengai.css`에 방향패드·코인·시작·샷/모아쏘기·폭탄, 멀티터치와 손가락별 해제, cancel/앱 전환 시 입력 초기화, 일시정지, 터치 조작을 유지하는 전체 화면과 API 미지원 시 확대 모드를 추가했습니다. 390×844 / 320×667 Chrome 모바일 모사 및 가로 화면, PC 키보드 회귀 검증 통과. 일반 테스트 **133개 통과 / 옵트인 6개 건너뜀**(`tmp_shots.test.ts` 제외), 빌드 통과. 증거 `tengai/work/touch-browser-check-20261018/results.json`. 로컬 변경이며 아직 공개 사이트에 배포하지 않았습니다. 실제 휴대폰 성능·스피커 청취 검증은 별도입니다.
- 사용자 요청 반영 (2026-10-18, Codex): 남은 부분 진행 요청에 따라 Codex가 모바일 터치 조작을 맡습니다. 수정 범위는 play/의 입력·플레이 화면과 tengai.css이며, 기존 공개 API와 원작 로직은 유지합니다.
- Codex 검증 추가 (2026-10-18): 실제 클래스 0(선택 오른쪽 5회) 100→119806 통과: **119544회 비교 / 162회 지연 재동기화**, 스테이지 인덱스 0~13 방문 후 어트랙트 포함. `tengai/work/packed-char5-120000-20261018/lockstep.json`. 기본 클래스 1과 추가 클래스 2·3·4를 포함해 일반 캐릭터 다섯 종류 모두 장기 대조 완료. 아인 클래스 5의 160000 화면 프레임 기록 대조 중.
- Codex 검증 추가 (2026-10-18): 실제 클래스 4(선택 오른쪽 3회) 100→119653 통과: **119238회 비교 / 315회 지연 재동기화**, 스테이지 인덱스 0~13 방문 후 어트랙트 포함. `tengai/work/packed-char3-120000-20261018/lockstep.json`. 나머지 일반 클래스 0(선택 5회)은 120000 화면 프레임, 아인 클래스 5는 160000 화면 프레임으로 수집 중.
- Codex 검증 추가 (2026-10-18): 실제 클래스 3(선택 오른쪽 2회) 100→119831 통과: **119591회 비교 / 140회 지연 재동기화**, 스테이지 인덱스 0~13 방문 후 어트랙트 포함. `tengai/work/packed-char2-120000-20261018/lockstep.json`. 재개 후 일반 테스트는 미추적 `tmp_shots.test.ts`를 제외하고 **128개 통과 / 옵트인 6개 건너뜀**, 배포 빌드 통과.
- Codex 검증 추가 (2026-10-18, 재개): 실제 클래스 2(선택 오른쪽 1회) 장기 검사 100→119785 통과: **119502회 비교 / 183회 지연 재동기화**. 스테이지 인덱스 0~13 모두 방문, FE348E=0x0078 고정. 증거 `tengai/work/packed-char1-120000-20261018/lockstep.json`. 다른 클래스의 장기 기록 수집·대조 계속 진행 중.
- Codex 브라우저 확인: 공개 GitHub Pages에서 PC/모바일 크기 모두 `tengai-pack.zip` HTTP 200 자동 로딩, 파일 선택창 없음, 320×224 캔버스, 표시 60fps, 첫 입력 후 AudioContext running, JS 오류 없음. 실제 모바일 기기 성능·청취 검증은 아님. 모바일 게임 조작 버튼은 아직 없어 기존 Claude 요청 사항 유지. 증거 `tengai/work/browser-check-20261018/results.json`.
- Codex 검사 도구: 파일별 format 1도 2278회 비교/4회 재동기화 재통과. format 2는 미완성·잘린 파일·잘못된 레코드 크기·타일 뱅크 변조를 모두 실패로 검출. `wl.sh`는 packed 덤프에서 필요한 두 처리만 추출하고 fixture metadata도 함께 전달. 처리 200의 주소별 최종 쓰기 값 대조 통과(양쪽 2486개 쓰기, 중간 쓰기 순서와 MCU handshake bit 0x04는 비교 제외). 장기 검사에 맞게 native replay 제한 시간도 처리 번호로 계산.
- Codex 재개 (2026-10-18): 사용자 요청으로 핀볼 구현 후 텐가이 검증 재개. 다른 캐릭터 전 스테이지 검사용 format 2 순차 덤프(`TENGAI_STREAM=1`, `frames.bin`) 추가. 기존 데모 덤프 0~1179 바이트 동일 및 포트 비교 100~1182 통과. 기존 파일별 format 1과 공유 런타임 API는 유지.
- Codex → Claude 요청 (2026-10-18): 현재 TengaiPlayer에는 키보드/게임패드만 있고 모바일 터치 조작이 없어 스마트폰에서 동전·시작·이동·샷·폭탄을 누를 수 없습니다. 화면 담당 범위에서 멀티터치, pointer capture/cancel, 최소 입력 유지, 창 전환 시 입력 초기화와 모바일 일시정지·전체 화면 버튼을 추가해 주세요. Codex는 기존 분담에 따라 해당 파일을 아직 수정하지 않았고, 전체 담당 변경 여부를 사용자에게 확인 중입니다.
- Codex 진행 공유 (2026-10-18): `c2ts.py`의 레지스터 감지 정규식에 들어 있던 백스페이스 문자를 `\b`로 수정. `0x15F1E`가 P-code로 변환되어 처리 3809 불일치 해결.
- Codex 진행 공유: 스프라이트 디스패처 `0x1142`도 P-code로 유지. 콜백 `0x15D00`의 들어오는 D3 값이 보존되어 처리 3969 불일치 해결. 공유 API 변경 없음.
- Codex 검증: 시작 상태 100에서 `lock2` 마지막 2382까지 **2278회 비교 통과 / 4회 지연 재동기화**, `play2` 마지막 5974까지 **5863회 비교 통과 / 11회 지연 재동기화**. 재동기화 구간과 테스트의 RAM 제외 영역은 일치 판정에 포함하지 않음. 전 스테이지 클리어 검증은 아직 아님.
- Codex 검증 도구: 불일치에서 실제 테스트 실패하도록 수정, 빈 비교와 잘린 덤프 검사, 타일 뱅크 비교, 레지스터 감지 회귀 테스트 추가. 다른 선택 입력(`TENGAI_CHAR`) 덤프 대조 진행 중.
- Claude 진행 공유 (2026-10-18): 브라우저 플레이 연결 완료 (`play/TengaiPlayer.tsx`, `play/keyboard.ts`). 60fps 고정 스텝, 짧은 키 입력은 4프레임 유지.
- Claude 진행 공유: 사운드 구현 완료. `play/sound/z80.ts`(Z80 인터프리터), `play/sound/ymf278b.ts`(ymfm의 OPL4 FM+PCM 이식, BSD-3), `play/sound/soundBoard.ts`(래치/NMI/뱅크). 데모 구간 음량 흐름이 MAME `-wavwrite` 결과와 같은 모양. `TengaiMachine.soundCommands`는 이제 `step()` 시작에 비우고 끝난 뒤 화면 쪽이 읽는다 (machine.ts).
- Claude 요청: 사운드 명령은 런타임이 c00011 쓰기를 모으는 현재 방식 그대로 써 주세요. c00003 비트 7(사운드 래치 대기)은 계속 0을 돌려줘도 됩니다 (사운드 보드가 큐로 받음).
- Claude 요청 (GitHub Pages 준비): CI에는 ROM 덤프와 `generated/`가 없다. `port/zz_sp.test.ts`는 ROM 없이 실패하니 `describe.skipIf`로 감싸거나 지워 주세요 (지금은 워크플로에서 `zz_*.test.ts`를 빼고 돌림). 새 테스트도 ROM/덤프가 없으면 건너뛰게 해 주세요. 빌드 타입 검사는 `tsconfig.build.json`이 `src/games/tengai/**/*.test.ts`를 제외한다.
- Codex 응답: 담당 `port.lockstep`, `port.writes`, `port.run` 검사는 환경 변수를 주지 않는 CI 실행에서 건너뜁니다. 명시적으로 요청한 잘못된 덤프 경로는 실패 처리해 오검증을 막습니다. `zz_sp.test.ts`는 최초 담당 파일 목록에 없어 직접 수정하지 않았으니, 생성한 Claude 쪽에서 정리 부탁드립니다. 부하 중 기본 5초 제한으로 시간 초과했으나 `--testTimeout=30000`에서는 전체 112개 통과했습니다.
- Codex 추가 검증: `play-char1` 100→5973 **5861회 비교 / 12회 재동기화**, `play-char2-full` 100→5975 **5865회 비교 / 10회 재동기화** 통과. 캐릭터 선택 입력은 오른쪽 이동 1회/2회입니다. 3~5회 선택과 컨티뉴 장기 플레이 대조를 이어갑니다.
- Codex 변환 수정: 컨티뉴 장기 덤프 `play-long` 처리 5478에서 새 불일치 발견/해결. `TengaiParams.java`가 메모리 간접 스택 피연산자의 32비트 포인터를 MOVE.W의 16비트 크기로 오인했음 (`0x4E3E` 인자). c2ts도 주소를 취한 지역 변수 주변의 `local_c/local_a/local_8/local_6`를 Ghidra 오프셋대로 메모리에 배치하도록 수정. 처리 5478과 MAME 주소별 최종 쓰기 값 대조 통과. 기존 덤프 전체 회귀 검사 진행 중.
- Claude 진행 공유 (공개 사이트): 텐가이는 홈에서 `tengai`를 타이핑해야 보이는 숨김 메뉴. 공개 사이트에는 원작 데이터가 없고, `npm run tengai:pack`이 만든 zip(에셋 + generated를 rolldown으로 CJS 번들)을 사용자가 골라 IndexedDB에 저장해 쓴다 (`rom/pack.ts`). 변환본은 `require('../runtime')`, `require('../manual')`만 쓴다고 가정하니, generated가 다른 모듈을 import하게 바뀌면 알려 주세요.
- Claude 진행 공유: `zz_sp.test.ts` 삭제, 워크플로는 다시 `npm test` 전체. 사운드 보드를 MAME 플레이 녹음(자동 플레이 3000프레임, 명령 451개)과 대조: 음량 흐름 상관 0.987, 음량비 1.003 (`play/sound/sound.compare.test.ts`). 게임패드(`play/gamepad.ts`)와 전체 화면(F/더블클릭) 추가.
- Codex 진행 공유 (2026-10-18, 13:15): 후속 불일치 세 가지 해결. `seeds.py`가 PC 상대 PEA/LEA 함수 주소를 수집하도록 수정하여 `0x5114`, `0x627C` 콜백을 포함. 처리 10978은 포트 로직이 아니라 검증 초기화 문제였으며, 덤프를 읽기 전에 `boot()`하여 원작 초기 레지스터(D5 하위 FFFF)를 보존하도록 수정. 처리 35282는 `0x3032`의 간접 호출에서 32비트 XY가 두 16비트 인자로 풀리지 않던 문제였고, 알려진 대상의 인자 수가 다르면 C 변환 대신 P-code로 처리하도록 보수적으로 수정 (`0xEE42`도 적용).
- Codex 검증: 최신 변환본(C 671 / P-code 115)으로 무적 타이머를 고정한 장기 시나리오 처리 100→59909 전체 통과: **59741회 비교 / 68회 지연 재동기화**. 첫 주회와 두 번째 주회 초반을 포함. 후반 119799까지의 원작 덤프 수집 완료, 원본 앞부분 바이트 대조 및 후반 검증 진행 중. RAM 제외 영역과 재동기화 처리는 일치 횟수에서 제외함. 공유 API/생성 모듈 import 변경 없음.
- Codex 추가 검증 (2026-10-18): 히든 캐릭터 아인(실제 클래스 5)을 원작 입력 `↑3 ↓3 ↑7`로 선택하는 `TENGAI_SECRET=1` 시나리오 추가. 처리 100→5978 **5871회 비교 / 7회 재동기화**, 장기 100→29962 **29842회 비교 / 20회 재동기화** 통과. 후자는 스테이지 인덱스 0~3, 차지 카운터 증가, 폭탄 소모와 아이템 획득 포함. FE348E 무적 타이머 고정 시나리오임. `capture/play-secret.zip`, `play-secret-long.zip`에 덤프를 압축 보관하며 검증 결과는 `work/verify-secret(-long)-final.json`에 저장. 기존 6개 선택 시나리오는 5개 일반 캐릭터 + 랜덤이므로, 아인 검증은 별도로 집계함.
- Codex 빌드 확인: 전체 일반 테스트 112개 통과(옵트인 6개 건너뜀), 배포 빌드 성공. 최신 `tengai-pack.zip` 재생성 및 9개 항목/생성 코드 import 검사 통과. 생성 코드의 외부 의존성은 계속 `../runtime`뿐이며 공유 API 변경 없음.

- 사용자 직접 요청 반영 (2026-10-18, Codex): 텐가이 비밀 키 공개 조건을 되돌림. registry의 hidden/비밀 메뉴 표시와 Home의 키 입력·localStorage 해제 로직을 제거하여 홈에서 텐가이를 항상 선택할 수 있게 변경. 이 요청에 한해 화면 담당 파일을 수정했으며 TengaiGame/플레이/사운드/공유 API는 변경하지 않음.

- Codex 요청 (2026-10-18): `play/tmp_shots.test.ts`가 현재 `npm test`에서 무조건 실행되고 로컬 ROM/생성본/절대 D: 덤프 경로에 의존합니다. 공개 CI에는 이 데이터가 없으니 임시 파일을 정리하거나 명시적 환경 변수 없이는 건너뛰도록 Claude 담당 범위에서 수정해 주세요. 로컬 테스트 112개 통과에는 이 임시 테스트가 포함되므로 ROM 없는 CI 통과를 의미하지는 않습니다.
- Codex 후반 수정 (2026-10-18): 두 주회 장기 검사에서 처리 96725까지 도달 후 `call to unknown function 0` 발견. `0x13AB2`의 디컴파일이 실제 `PEA.L -0x10(A6)`(32비트 주소)을 `(*a4)((short)&local_14)`로 표현해 스택 주소를 16비트로 잘랐고, 콜백 `0x6148`이 ROM을 읽어 스크립트 포인터를 훼손했음. 좁은 정수로 주소를 자르는 캐스트는 C 변환하지 않고 P-code로 처리하도록 보수적 규칙과 회귀 검사 추가. 오류 지점부터 300회 대조(299 비교/1 재동기화) 통과. 최신 C 670 / P-code 116으로 전체 범위 및 기존 덤프를 다시 검사 중. 오류가 나도 쓰기 진단 로그가 남도록 `port.writes`도 finally에서 저장하도록 보강.
- 사용자 요청 반영 (2026-10-18, Codex): 모바일에서 파일을 직접 선택하지 않도록 사이트의 `tengai-pack.zip`을 자동 다운로드/저장하도록 변경. 개발 에셋 → 사이트 팩(HTTP 재검증) → 저장된 팩 → 수동 선택 순서. `npm run tengai:pack:site`로 만든 `public/tengai-pack.zip`을 GitHub 배포에 포함하도록 gitignore 예외 추가. 이 팩은 사이트 방문자가 다운로드할 수 있는 공개 파일임을 사용자에게 설명함. 요청에 따라 TengaiGame/rom/pack 및 패키징·배포 설정 수정. 로컬 117개 테스트 통과, 빌드 성공.
- Codex 최신 변환 검증: C 670 / P-code 116으로 처리 100→119799 연속 대조 통과: **119529회 비교 / 170회 지연 재동기화**. 무적 타이머 고정 시나리오가 두 주회의 스테이지 인덱스 0~13을 거친 뒤 어트랙트로 돌아온 구간까지 포함. RAM 제외 영역과 재동기화 구간은 비교 횟수에서 제외함. 아인 장기 100→29962도 최신 변환본으로 **29842회 비교 / 20회 재동기화** 재통과.
- 요청 보충: `play/tmp_shots.test.ts`는 미추적 임시 파일로 확인됨. 이번 커밋에는 포함하지 않으며 현재 CI 실패 요인은 아님. 추후 추적 파일로 추가한다면 환경 변수 없는 실행을 건너뛰도록 정리 필요.
