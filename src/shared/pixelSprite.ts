/** 문자 하나가 픽셀 하나인 도트 스프라이트. 팔레트에 없는 문자('.')는 투명 */
export type Sprite = string[];
export type Palette = Record<string, string>;

function fillPixels(ctx: CanvasRenderingContext2D, sprite: Sprite, palette: Palette, left: number, top: number, scale: number) {
  sprite.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(left + c * scale, top + r * scale, scale, scale);
    }
  });
}

/** 왼쪽 위 (x, y)에 그린다 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  palette: Palette,
  x: number,
  y: number,
  scale = 3,
) {
  fillPixels(ctx, sprite, palette, Math.round(x), Math.round(y), scale);
}

/** 중심 (cx, cy)을 기준으로 angle(라디안)만큼 회전해 그린다 */
export function drawSpriteCentered(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  palette: Palette,
  cx: number,
  cy: number,
  scale: number,
  angle = 0,
) {
  const w = sprite[0].length * scale;
  const h = sprite.length * scale;
  if (Math.abs(angle) < 0.01) {
    drawSprite(ctx, sprite, palette, cx - w / 2, cy - h / 2, scale);
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  // 회전 시 픽셀 사이 틈이 보이지 않도록 살짝 겹쳐 그린다
  fillPixels(ctx, sprite, palette, -w / 2, -h / 2, scale + 0.5);
  ctx.restore();
}
