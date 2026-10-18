const KEY = 'marble-course-records';
export interface CourseRecord { time: number; stars: number }
export function readRecords(): Record<number, CourseRecord> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    const result: Record<number, CourseRecord> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value && typeof value === 'object' && Number.isFinite(value.time) && value.time >= 0 && [1, 2, 3].includes(value.stars)) result[Number(key)] = value;
    }
    return result;
  } catch { return {}; }
}
export function saveRecord(stage: number, time: number, stars: number): Record<number, CourseRecord> {
  const records = readRecords();
  const old = records[stage];
  records[stage] = { time: Math.min(time, old?.time ?? Infinity), stars: Math.max(stars, old?.stars ?? 0) };
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* Session remains playable without storage. */ }
  return records;
}
