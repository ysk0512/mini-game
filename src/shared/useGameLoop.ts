import { useEffect, useRef } from 'react';

/** 탭 전환 등으로 프레임 간격이 커져도 한 번에 진행할 최대 시간 */
const MAX_FRAME_DT = 1 / 30;

/** requestAnimationFrame 루프. callback에는 초 단위 dt가 전달된다. */
export function useGameLoop(callback: (dt: number) => void) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
      last = now;
      callbackRef.current(dt);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, []);
}
