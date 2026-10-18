import { COURSES } from './logic/courses';

/** 코스별 최고 기록 (초). 홈 화면에서도 읽으므로 three.js를 불러오지 않는 가벼운 모듈로 둔다 */
export interface CourseRecord {
  race: number | null;
  lap: number | null;
}

const KEY = 'kart-records';
const SELECTION_KEY = 'kart-selection';

/** 마지막으로 고른 캐릭터·카트 */
export function loadSelection(): { characterId: string; kartId: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null');
    return value && typeof value.characterId === 'string' && typeof value.kartId === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function saveSelection(selection: { characterId: string; kartId: string }) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
  } catch {
    // 저장이 막혀 있으면 다음에 기본값으로 시작
  }
}

export function loadRecords(): Record<string, CourseRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const recordOf = (courseId: string): CourseRecord => loadRecords()[courseId] ?? { race: null, lap: null };

/** 기록을 저장하고, 각각 신기록인지 돌려준다 */
export function saveRecord(courseId: string, raceTime: number, bestLap: number) {
  const all = loadRecords();
  const old = all[courseId] ?? { race: null, lap: null };
  const newRace = old.race === null || raceTime < old.race;
  const newLap = old.lap === null || bestLap < old.lap;
  all[courseId] = { race: newRace ? raceTime : old.race, lap: newLap ? bestLap : old.lap };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 저장이 막혀 있으면 기록만 못 남긴다
  }
  return { newRace, newLap };
}

/** 83.456 → "1:23.45" */
export function formatTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** 홈 화면 카드용 한 줄 요약 */
export function recordSummary() {
  return COURSES.map((c) => `${c.name} ${formatTime(recordOf(c.id).race)}`).join(' · ');
}
