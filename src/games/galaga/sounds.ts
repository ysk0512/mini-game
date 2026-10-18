import { melody, playSound, type SoundEffect } from '../../shared/sound';
import type { SoundName } from './game/types';

/** 트랙터 빔: 높낮이가 오르내리는 경고음 */
const beamWarble = Array.from({ length: 14 }, (_, i) => ({
  type: 'triangle' as const,
  from: i % 2 ? 620 : 900,
  to: i % 2 ? 900 : 620,
  duration: 0.11,
  volume: 0.07,
  delay: i * 0.11,
}));

const EFFECTS: Record<SoundName, SoundEffect> = {
  shoot: { tones: [{ type: 'square', from: 1400, to: 300, duration: 0.08, volume: 0.05 }] },
  bossHit: { tones: [{ type: 'square', from: 260, to: 520, duration: 0.1, volume: 0.08 }] },
  explode: { noise: [{ duration: 0.3, volume: 0.25, from: 2500, to: 150 }] },
  playerDie: {
    noise: [{ duration: 1, volume: 0.35, from: 1800, to: 60 }],
    tones: [{ type: 'sawtooth', from: 440, to: 50, duration: 1, volume: 0.06 }],
  },
  beam: { tones: beamWarble },
  capture: { tones: melody('sine', [880, 740, 587, 440, 330], 0.16) },
  rescue: { tones: melody('square', [523, 659, 784, 1047, 1319], 0.08, 0.06) },
  stageStart: { tones: melody('square', [523, 523, 659, 784, 659, 784, 1047], 0.11, 0.05) },
  extraLife: { tones: melody('triangle', [1047, 1319, 1568, 2093], 0.08, 0.08) },
};

export function playGalagaSounds(names: SoundName[]) {
  // 같은 프레임에 같은 소리가 여러 번 나면 한 번만
  for (const name of new Set(names)) playSound(EFFECTS[name]);
}
