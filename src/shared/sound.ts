/**
 * Web Audio로 만드는 8비트 효과음.
 * 브라우저 자동재생 정책 때문에 AudioContext는 첫 사용자 입력 때 만든다 (unlockAudio).
 */

const MUTE_KEY = 'arcade-muted';

export interface Tone {
  type: OscillatorType;
  /** 시작 주파수(Hz) */
  from: number;
  /** 끝 주파수(Hz), 없으면 고정 */
  to?: number;
  duration: number;
  volume?: number;
  /** 시작 지연(초) */
  delay?: number;
}

export interface Noise {
  duration: number;
  volume?: number;
  /** 로우패스 필터 시작·끝 주파수 */
  from?: number;
  to?: number;
  delay?: number;
}

export interface SoundEffect {
  tones?: Tone[];
  noise?: Noise[];
}

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = readMuted();
const listeners = new Set<() => void>();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // 저장이 막혀 있어도 이번 세션 동안은 유지한다
  }
  listeners.forEach((fn) => fn());
}

/** useSyncExternalStore용 */
export function subscribeMuted(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function context(): AudioContext | null {
  if (!audioCtx) {
    if (typeof window === 'undefined' || !window.AudioContext) return null;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

/** 키 입력·클릭 같은 사용자 동작 안에서 호출해 오디오를 깨운다 */
export function unlockAudio() {
  if (!muted) context();
}

/** 엔진음처럼 계속 울리는 소리를 직접 만들 때 쓴다. 음소거 중이면 null */
export function audioContextIfEnabled(): AudioContext | null {
  return muted ? null : context();
}

function playTone(ctx: AudioContext, t: Tone) {
  const start = ctx.currentTime + (t.delay ?? 0);
  const end = start + t.duration;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.from, start);
  if (t.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.to), end);
  gain.gain.setValueAtTime(t.volume ?? 0.1, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function playNoise(ctx: AudioContext, n: Noise) {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = ctx.currentTime + (n.delay ?? 0);
  const end = start + n.duration;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(n.from ?? 3000, start);
  filter.frequency.exponentialRampToValueAtTime(n.to ?? 200, end);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(n.volume ?? 0.2, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(start);
  src.stop(end + 0.02);
}

export function playSound(effect: SoundEffect) {
  if (muted) return;
  const ctx = context();
  if (!ctx) return;
  effect.tones?.forEach((t) => playTone(ctx, t));
  effect.noise?.forEach((n) => playNoise(ctx, n));
}

/** 음 높이 목록을 차례로 이어 붙인 멜로디 */
export function melody(type: OscillatorType, notes: number[], step: number, volume = 0.08): Tone[] {
  return notes.map((from, i) => ({ type, from, duration: step * 0.95, volume, delay: i * step }));
}
