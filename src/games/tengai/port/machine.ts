/**
 * 텐가이 실행 드라이버: 원작의 부팅 순서와 메인 루프(0x9DA)를 한 프레임 단위로 돌린다.
 *
 * 원작 메인 루프는 VBLANK 인터럽트가 플래그를 세울 때까지 공회전한 뒤 한 프레임의 일을 한다.
 * 여기서는 프레임마다 [인터럽트 처리 → 메인 루프 본문]을 한 번씩 부른다.
 */
import { SPRITE_RAM_BYTES, createRenderTarget, renderFrame, type RenderTarget, type VideoGfx } from '../video/psikyoVideo';
import type { TengaiRom } from '../rom/parse';
import { R, REG, TengaiMachine, setMachine } from './runtime';
import { EXTRA_FUNCTIONS } from './manual';

type GeneratedModules = {
  FUNCTIONS: Record<number, (...a: number[]) => number | void>;
  PARAMS: Record<number, [number, number, boolean][]>;
  PCODE_FUNCTIONS: Record<number, () => void>;
};

const VBLANK_IRQ = 0x548;
const BOOT_STACK = 0xffff7fe0;
/** 리셋 루틴(0x80A)이 차례로 부르는 초기화 함수 */
const BOOT_CALLS = [0x400, 0x992, 0x15a0, 0x1a2f8, 0x189e0, 0x156b4];
/** 메인 루프 본문이 태스크 처리 전에 부르는 함수 */
const FRAME_CALLS_A = [0xd44, 0x18b82, 0x1a004, 0x18a9e, 0x1765c];
const FRAME_CALLS_B = [0x852, 0x1142, 0x193e0, 0x7818];

const G = {
  idleCounter: 0xfffe0000,
  frameCounter: 0xfffe0004,
  taskCount: 0xfffe0008,
  curTask: 0xfffe000c,
  tasks: 0xfffe0014,
  taskIndex: 0xfffe0a1a,
  taskHead: 0xfffe0914,
  taskTail: 0xfffe0916,
  vblankFlag: 0xfffe95ac,
  frameHook: 0xfffea6c4,
  pause: 0xfffea6c2,
} as const;

export class TengaiRunner {
  readonly m: TengaiMachine;
  readonly gfx: VideoGfx;
  /** 하드웨어는 스프라이트 목록을 2프레임 늦게 표시한다 */
  private spriteHistory = [new Uint8Array(SPRITE_RAM_BYTES), new Uint8Array(SPRITE_RAM_BYTES)];
  private target: RenderTarget = createRenderTarget();
  frame = 0;
  /** VBLANK 직전 공회전 횟수 (원작 난수에 섞인다). 실기에서는 처리 여유에 따라 달라진다 */
  idleSpins = 1000;

  constructor(rom: TengaiRom, mods: GeneratedModules) {
    this.m = new TengaiMachine(rom.prog);
    this.gfx = { sprites: rom.sprites, spriteLut: rom.spriteLut, layers: rom.layers };
    this.m.registerFunctions({ ...mods.FUNCTIONS, ...EXTRA_FUNCTIONS }, mods.PCODE_FUNCTIONS, mods.PARAMS);
  }

  private use() {
    setMachine(this.m);
  }

  boot() {
    this.use();
    R.setUint32(REG.SP, BOOT_STACK);
    for (const f of BOOT_CALLS) this.m.call(f);
  }

  /** VBLANK 인터럽트 처리 (입력 읽기, 난수, 팔레트·스크롤 반영) */
  irq() {
    this.use();
    this.m.call(VBLANK_IRQ);
  }

  /**
   * 한 프레임 진행. extraIrqs는 원작에서 처리가 한 프레임을 넘겨 도중에 인터럽트가 더 들어온 횟수
   * (MAME 대조용. 평소에는 0)
   */
  step(extraIrqs = 0) {
    this.use();
    const m = this.m;
    // 이번 프레임에 사운드 CPU로 보낸 명령만 남도록 처음에 비운다 (step 뒤에 화면 쪽이 읽는다)
    m.soundCommands.length = 0;
    // 0x9F0: 플래그와 공회전 카운터를 지우고, 공회전 중 VBLANK 인터럽트가 들어온다 (공회전 횟수가 난수에 섞인다)
    m.w16(G.vblankFlag, 0);
    m.w32(G.idleCounter, this.idleSpins);
    m.call(VBLANK_IRQ);

    // 0xA0C~: 프레임 처리
    m.w32(G.frameCounter, m.r32(G.frameCounter) + 1);
    for (const f of FRAME_CALLS_A) m.call(f);
    const hook = m.r32(G.frameHook);
    if (hook) m.call(hook);
    for (const f of FRAME_CALLS_B) m.call(f);
    this.runTasks();
    for (let i = 0; i < extraIrqs; i++) m.call(VBLANK_IRQ);

    // 표시용 스프라이트 RAM 버퍼링
    const oldest = this.spriteHistory.shift()!;
    oldest.set(m.video.spriteRam);
    this.spriteHistory.push(oldest);
    this.frame++;
  }

  /** 0xA58~0xAD2: 태스크 표를 돌며 갱신 함수를 부른다 (태스크가 표를 바꿀 수 있어 매번 메모리에서 읽는다) */
  private runTasks() {
    const m = this.m;
    const count = (m.r16(G.taskHead) - m.r16(G.taskTail)) & 0x7f;
    m.w32(G.taskCount, count);
    if (count === 0) return;
    let done = 0;
    m.w16(G.taskIndex, 0);
    for (let guard = 0; guard < 4096; guard++) {
      const idx = m.r16s(G.taskIndex);
      const base = G.tasks + idx * 16;
      if (m.r32(base + 0xc) !== 0) {
        if (m.r32(base) !== 0 && m.r32(base + 8) !== 0) {
          m.w32(G.curTask, m.r32(base + 0xc));
          const fn = m.r16(G.pause) !== 0 ? m.r32(base + 4) : m.r32(base);
          m.call(fn);
        }
        done++;
        if (done >= (m.r32(G.taskCount) | 0)) return;
      }
      m.w16(G.taskIndex, m.r16(G.taskIndex) + 1);
    }
    throw new Error('task loop did not terminate');
  }

  /** MAME 덤프(ramdump.lua 형식)의 상태를 그대로 불러온다. 메인 루프 처음에서 이어 간다 */
  loadDump(dump: Uint8Array) {
    const m = this.m;
    m.ram.set(dump.subarray(0, 0x20000));
    m.video.spriteRam.set(dump.subarray(0x20000, 0x22000));
    m.video.paletteRam.set(dump.subarray(0x22000, 0x24000));
    m.video.vram.set(dump.subarray(0x24000, 0x2c000));
    if (dump.length > 0x2c000) {
      m.video.bankByte = dump[0x2c000];
      m.restoreBankByte(dump[0x2c000]);
    }
    for (const h of this.spriteHistory) h.set(m.video.spriteRam);
    R.setUint32(REG.SP, BOOT_STACK);
  }

  /** 현재 화면 (스프라이트는 2프레임 전 RAM) */
  render(): RenderTarget {
    const v = this.m.video;
    return renderFrame({ ...v, spriteRam: this.spriteHistory[0] }, this.gfx, this.target);
  }
}
