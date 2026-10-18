import { useCallback, useState } from 'react';

export function readHighScore(storageKey: string): number {
  try {
    return Number(localStorage.getItem(storageKey)) || 0;
  } catch {
    return 0;
  }
}

/** localStorage에 저장되는 최고 점수. submit은 신기록이면 true를 반환한다. */
export function useHighScore(storageKey: string) {
  const [highScore, setHighScore] = useState(() => readHighScore(storageKey));

  const submit = useCallback(
    (score: number) => {
      if (score <= readHighScore(storageKey)) return false;
      try {
        localStorage.setItem(storageKey, String(score));
      } catch {
        // 저장이 막혀 있어도 이번 세션 동안은 표시한다
      }
      setHighScore(score);
      return true;
    },
    [storageKey],
  );

  return [highScore, submit] as const;
}
