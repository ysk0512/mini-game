import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MuteButton, toggleMuted } from '../../shared/MuteButton';
import { useGameLoop } from '../../shared/useGameLoop';
import { LAPS, MAX_SPEED } from './logic/constants';
import { COURSES, type CourseDef } from './logic/courses';
import { driftLevel, type ItemKind } from './logic/kart';
import { createRace, currentLap, DEFAULT_SELECTION, isWrongWay, type RaceEvent, type RaceState, type Selection } from './logic/race';
import { CHARACTERS, characterById, KARTS, kartById, STAT_LABELS, STAT_MAX, type Stats } from './logic/roster';
import { buildTrack } from './logic/track';
import { Minimap, TrackPreview } from './Minimap';
import { formatTime, loadSelection, recordOf, saveRecord, saveSelection } from './records';
import { KartPreview } from './scene/KartPreview';
import { RaceScene } from './scene/RaceScene';
import { EngineSound, playRaceSounds } from './sounds';
import { useKartInput } from './useKartInput';

const ITEM_ICONS: Record<ItemKind, string> = { mushroom: '🍄', banana: '🍌', shell: '🐢' };
const ROULETTE_ICONS = Object.values(ITEM_ICONS);
const placeLabel = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

interface HudInfo {
  lap: number;
  place: number;
  item: string | null;
  speed: number;
  time: number;
  lapTime: number;
  drift: number;
  boosting: boolean;
  wrongWay: boolean;
  countdown: string | null;
}

function toHud(race: RaceState): HudInfo {
  const k = race.player;
  const rolling = k.itemRoulette > 0;
  let countdown: string | null = null;
  if (race.phase === 'countdown' && race.countdown <= 3) countdown = String(Math.ceil(race.countdown));
  else if (race.phase !== 'countdown' && race.time < 1) countdown = 'GO!';
  return {
    lap: currentLap(k),
    place: k.place,
    item: rolling ? ROULETTE_ICONS[Math.floor(race.time * 12) % ROULETTE_ICONS.length] : k.item ? ITEM_ICONS[k.item] : null,
    speed: Math.round(Math.abs(k.speed) * 3.6),
    time: race.time,
    lapTime: race.time - k.lapStartTime,
    drift: driftLevel(k.drift),
    boosting: k.boostTimer > 0,
    wrongWay: isWrongWay(k),
    countdown,
  };
}

const sameHud = (a: HudInfo, b: HudInfo) => (Object.keys(a) as (keyof HudInfo)[]).every((key) => a[key] === b[key]);

type Step = 'racer' | 'course' | 'race';

export default function KartGame() {
  const [step, setStep] = useState<Step>('racer');
  const [selection, setSelection] = useState<Selection>(() => loadSelection() ?? DEFAULT_SELECTION);
  const [course, setCourse] = useState<CourseDef>(COURSES[0]);
  const [raceId, setRaceId] = useState(0);

  switch (step) {
    case 'racer':
      return (
        <RacerSelect
          selection={selection}
          onChange={setSelection}
          onNext={() => {
            saveSelection(selection);
            setStep('course');
          }}
        />
      );
    case 'course':
      return (
        <CourseSelect
          selection={selection}
          onBack={() => setStep('racer')}
          onStart={(c) => {
            setCourse(c);
            setRaceId((n) => n + 1);
            setStep('race');
          }}
        />
      );
    case 'race':
      return (
        <Race
          key={raceId}
          course={course}
          selection={selection}
          onRestart={() => setRaceId((n) => n + 1)}
          onCourseSelect={() => setStep('course')}
          onRacerSelect={() => setStep('racer')}
        />
      );
  }
}

const STAT_KEYS = Object.keys(STAT_LABELS) as (keyof Stats)[];

function StatBars({ stats }: { stats: Stats }) {
  return (
    <dl className="stat-bars">
      {STAT_KEYS.map((key) => (
        <div key={key} className="stat-row">
          <dt>{STAT_LABELS[key]}</dt>
          <dd>
            {Array.from({ length: STAT_MAX }, (_, i) => (
              <span key={i} className={i < stats[key] ? 'on' : ''} />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RacerSelect({ selection, onChange, onNext }: { selection: Selection; onChange: (s: Selection) => void; onNext: () => void }) {
  const character = characterById(selection.characterId);
  const kartDef = kartById(selection.kartId);
  return (
    <div className="game-page">
      <h1>카트 레이서</h1>
      <div className="racer-select">
        <div className="preview-panel">
          <KartPreview character={character} kartDef={kartDef} />
          <div className="preview-title">
            <span style={{ color: character.color }}>
              {character.icon} {character.name}
            </span>{' '}
            · {kartDef.name}
          </div>
          <p className="preview-desc">{kartDef.description}</p>
          <StatBars stats={kartDef.stats} />
        </div>

        <div className="select-lists">
          <h3>캐릭터</h3>
          <div className="character-grid">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`character-chip ${c.id === character.id ? 'selected' : ''}`}
                style={{ '--chip': c.color } as CSSProperties}
                onClick={() => onChange({ ...selection, characterId: c.id })}
              >
                <span className="chip-icon">{c.icon}</span>
                {c.name}
              </button>
            ))}
          </div>

          <h3>카트</h3>
          <div className="kart-options">
            {KARTS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`kart-option ${k.id === kartDef.id ? 'selected' : ''}`}
                onClick={() => onChange({ ...selection, kartId: k.id })}
              >
                <span className="kart-option-name">{k.name}</span>
                <span className="kart-option-stats">
                  {STAT_KEYS.map((key) => (
                    <span key={key} title={STAT_LABELS[key]}>
                      {STAT_LABELS[key]} <b>{k.stats[key]}</b>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>

          <button type="button" className="primary-button" onClick={onNext}>
            코스 선택 →
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseSelect({ selection, onBack, onStart }: { selection: Selection; onBack: () => void; onStart: (course: CourseDef) => void }) {
  const tracks = useMemo(() => COURSES.map((c) => buildTrack(c)), []);
  const character = characterById(selection.characterId);
  return (
    <div className="game-page">
      <h1>카트 레이서</h1>
      <div className="course-header">
        <button type="button" className="text-button" onClick={onBack}>
          ← 캐릭터·카트 다시 고르기
        </button>
        <span>
          {character.icon} {character.name} · {kartById(selection.kartId).name}
        </span>
      </div>
      <div className="course-grid">
        {COURSES.map((c, i) => {
          const record = recordOf(c.id);
          return (
            <button key={c.id} type="button" className={`course-card theme-${c.theme}`} onClick={() => onStart(c)}>
              <TrackPreview track={tracks[i]} />
              <span className="course-name">{c.name}</span>
              <span className="course-desc">{c.description}</span>
              <span className="course-record">
                베스트 {formatTime(record.race)} · 랩 {formatTime(record.lap)}
              </span>
            </button>
          );
        })}
      </div>
      <ul className="kart-controls">
        <li><kbd>↑</kbd>/<kbd>W</kbd> 가속 · <kbd>↓</kbd>/<kbd>S</kbd> 브레이크·후진 · <kbd>←</kbd><kbd>→</kbd> 조향</li>
        <li><kbd>Space</kbd>/<kbd>Shift</kbd> 누른 채 꺾으면 드리프트 → 불꽃이 파랑·주황이 됐을 때 떼면 미니 터보</li>
        <li><kbd>X</kbd>/<kbd>E</kbd> 아이템 (🍄 부스트 · 🍌 뒤에 놓기 · 🐢 앞으로 발사) · <kbd>P</kbd>/<kbd>Esc</kbd> 일시정지 · <kbd>M</kbd> 소리</li>
        <li>카운트다운 "1"에서 GO 직전에 가속을 누르면 스타트 대시!</li>
      </ul>
    </div>
  );
}

interface RaceProps {
  course: CourseDef;
  selection: Selection;
  onRestart: () => void;
  onCourseSelect: () => void;
  onRacerSelect: () => void;
}

function Race({ course, selection, onRestart, onCourseSelect, onRacerSelect }: RaceProps) {
  const [race] = useState(() => createRace(course, selection));
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [hud, setHud] = useState(() => toHud(race));
  const hudRef = useRef(hud);
  const [banner, setBanner] = useState<{ text: string; id: number } | null>(null);
  const [results, setResults] = useState<{ newRace: boolean; newLap: boolean } | null>(null);
  const engine = useMemo(() => new EngineSound(), []);

  const setPausedBoth = (value: boolean) => {
    pausedRef.current = value;
    setPaused(value);
  };

  const readInput = useKartInput({
    onPause: () => {
      if (!results) setPausedBoth(!pausedRef.current);
    },
    onMute: toggleMuted,
  });

  const showBanner = (text: string) => setBanner({ text, id: performance.now() });

  const handleEvents = (events: RaceEvent[]) => {
    playRaceSounds(events);
    for (const e of events) {
      if (e === 'lap') showBanner(`LAP ${currentLap(race.player)}/${LAPS}`);
      else if (e === 'finalLap') showBanner('FINAL LAP!');
      else if (e === 'finish') {
        showBanner('FINISH!');
        const k = race.player;
        const saved = saveRecord(course.id, k.finishTime!, Math.min(...k.lapTimes));
        window.setTimeout(() => setResults(saved), 1800);
      }
    }
  };

  // RaceScene에는 항상 같은 함수를 넘기고, 실제 처리는 최신 handleEvents로
  const eventsRef = useRef(handleEvents);
  eventsRef.current = handleEvents;
  const [onEvents] = useState(() => (events: RaceEvent[]) => eventsRef.current(events));

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 1800);
    return () => window.clearTimeout(id);
  }, [banner]);

  // HUD 갱신과 엔진음
  useGameLoop(() => {
    const next = toHud(race);
    if (!sameHud(hudRef.current, next)) {
      hudRef.current = next;
      setHud(next);
    }
    if (pausedRef.current || race.phase === 'countdown') engine.stop();
    else engine.update(Math.abs(race.player.speed) / MAX_SPEED, race.player.boostTimer > 0);
  });

  useEffect(() => () => engine.stop(), [engine]);

  // 다른 창으로 전환하면 자동 일시정지
  useEffect(() => {
    const onBlur = () => {
      if (race.phase !== 'finished') setPausedBoth(true);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [race]);

  const best = recordOf(course.id);

  return (
    <div className="game-page kart-page">
      <div className="kart-stage">
        <RaceScene race={race} paused={paused} readInput={readInput} onEvents={onEvents} />

        <div className={`speed-lines ${hud.boosting ? 'active' : ''}`} />
        <div className="kart-hud">
          <div className="hud-left">
            <div className="hud-lap">
              LAP <strong>{hud.lap}</strong>/{LAPS}
            </div>
            <div className="hud-time">{formatTime(hud.time)}</div>
            <div className="hud-small">랩 {formatTime(hud.lapTime)}</div>
          </div>
          <div className="hud-item">{hud.item ?? ''}</div>
          <div className="hud-right">
            <div className={`hud-place place-${hud.place}`}>{placeLabel(hud.place)}</div>
            <MuteButton />
          </div>
        </div>
        <div className="hud-speed">
          <strong>{hud.speed}</strong> km/h
          <span className={`drift-gauge level-${hud.drift}`} />
        </div>
        <Minimap race={race} />

        {hud.countdown && <div className="hud-countdown" key={hud.countdown}>{hud.countdown}</div>}
        {banner && <div className="hud-banner" key={banner.id}>{banner.text}</div>}
        {hud.wrongWay && <div className="hud-wrong-way">⚠ 역주행!</div>}

        {paused && (
          <div className="overlay">
            <h2>일시정지</h2>
            <p>P / Esc로 계속</p>
            <div className="overlay-buttons">
              <button type="button" onClick={() => setPausedBoth(false)}>계속하기</button>
              <button type="button" className="secondary" onClick={onRestart}>다시 시작</button>
              <button type="button" className="secondary" onClick={onCourseSelect}>코스 선택</button>
              <button type="button" className="secondary" onClick={onRacerSelect}>카트 바꾸기</button>
            </div>
          </div>
        )}

        {results && race.results && (
          <div className="overlay">
            <h2>{placeLabel(race.results.findIndex((r) => r.isPlayer) + 1)} 골인!</h2>
            <table className="race-results">
              <tbody>
                {race.results.map((r, i) => (
                  <tr key={r.name} className={r.isPlayer ? 'me' : ''}>
                    <td>{i + 1}</td>
                    <td>
                      <span className="dot" style={{ background: r.color }} />
                      {r.name}
                    </td>
                    <td className="kart-name">{r.kartName}</td>
                    <td>
                      {formatTime(r.time)}
                      {r.estimated ? '*' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              기록 {formatTime(race.player.finishTime)} {results.newRace && '🎉 코스 신기록!'}
              <br />
              베스트 랩 {formatTime(Math.min(...race.player.lapTimes))} {results.newLap && '🎉 랩 신기록!'}
            </p>
            <p className="hud-small">* 아직 달리는 중인 CPU의 예상 기록 · 코스 최고 {formatTime(best.race)}</p>
            <div className="overlay-buttons">
              <button type="button" onClick={onRestart}>다시 하기</button>
              <button type="button" className="secondary" onClick={onCourseSelect}>코스 선택</button>
              <button type="button" className="secondary" onClick={onRacerSelect}>카트 바꾸기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
