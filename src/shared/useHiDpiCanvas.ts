import { useEffect, type RefObject } from 'react';

/** 고해상도 화면에서 흐려지지 않도록 devicePixelRatio만큼 키워서 그리게 설정한다. */
export function useHiDpiCanvas(canvasRef: RefObject<HTMLCanvasElement | null>, width: number, height: number) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [canvasRef, width, height]);
}
