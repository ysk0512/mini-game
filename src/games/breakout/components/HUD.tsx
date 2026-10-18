import { LEVELS } from '../game/levels';
import { POWERUP_STYLES } from '../game/render';

export interface HudInfo {
  score: number;
  lives: number;
  level: number;
  /** 남은 초(올림), 0이면 비활성 */
  expand: number;
  slow: number;
}

interface Props {
  hud: HudInfo;
  highScore: number;
}

export function HUD({ hud, highScore }: Props) {
  return (
    <div className="hud">
      <span>점수 <strong>{hud.score}</strong></span>
      <span>최고 <strong>{Math.max(highScore, hud.score)}</strong></span>
      <span>스테이지 <strong>{hud.level + 1} / {LEVELS.length}</strong></span>
      <span className="lives">{'♥'.repeat(Math.max(0, hud.lives))}</span>
      <span className="effects">
        {hud.expand > 0 && (
          <span className="badge" style={{ background: POWERUP_STYLES.expand.color }}>확장 {hud.expand}s</span>
        )}
        {hud.slow > 0 && (
          <span className="badge" style={{ background: POWERUP_STYLES.slow.color }}>슬로우 {hud.slow}s</span>
        )}
      </span>
    </div>
  );
}
