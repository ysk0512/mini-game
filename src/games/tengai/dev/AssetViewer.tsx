import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LAYER_BANK_TILES,
  LAYER_PALSET_TABLES,
  SPRITE_PALSET_TABLE,
  allPaletteAddrs,
  cellColor,
  cellTile,
  decodeTile,
  guessLayerBank,
  readBgMaps,
  readPalette,
  readPaletteSets,
  type BgMap,
  type TengaiRom,
} from '../rom/parse';

type Tab = 'maps' | 'sprites' | 'palettes';

/** 개발용: ROM에서 꺼낸 배경 맵, 스프라이트 타일, 팔레트를 둘러본다 */
export function AssetViewer({ rom }: { rom: TengaiRom }) {
  const [tab, setTab] = useState<Tab>('maps');
  return (
    <div className="tengai-viewer">
      <div className="tengai-tabs" role="tablist">
        {(
          [
            ['maps', '배경 맵'],
            ['sprites', '스프라이트 타일'],
            ['palettes', '팔레트'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'maps' && <MapView rom={rom} />}
      {tab === 'sprites' && <SpriteView rom={rom} />}
      {tab === 'palettes' && <PaletteView rom={rom} />}
    </div>
  );
}

const MISSING_COLOR = 0xffff00ff;

/** 팔레트 주소 목록 → 색 표 (빈 칸은 자홍색) */
function paletteTable(rom: TengaiRom, addrs: (number | null)[]): Uint32Array[] {
  return addrs.map((a) => (a === null ? new Uint32Array(16).fill(MISSING_COLOR) : readPalette(rom.prog, a)));
}

function useCanvasImage(width: number, height: number, paint: (px: Uint32Array) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0 || height <= 0) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    paint(new Uint32Array(img.data.buffer));
    ctx.putImageData(img, 0, 0);
  }, deps);
  return ref;
}

function MapView({ rom }: { rom: TengaiRom }) {
  const maps = useMemo(() => readBgMaps(rom.prog), [rom]);
  const palTables = useMemo(() => LAYER_PALSET_TABLES.map((t) => readPaletteSets(rom.prog, t)), [rom]);
  const [index, setIndex] = useState(17);
  const map: BgMap = maps[index];
  const guessed = useMemo(() => guessLayerBank(rom.layers, map), [rom, map]);
  const [bankOverride, setBankOverride] = useState<number | null>(null);
  const bank = bankOverride ?? guessed;
  const [table, setTable] = useState(0);
  const [set, setSet] = useState(18);
  const sets = palTables[table];
  const pals = useMemo(() => paletteTable(rom, sets[Math.min(set, sets.length - 1)]), [rom, sets, set]);

  const width = map.cols * 16;
  const height = map.rows * 16;
  const ref = useCanvasImage(
    width,
    height,
    (px) => {
      const tile = new Uint8Array(256);
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          const cell = map.cells[r * map.cols + c];
          decodeTile(rom.layers, bank * LAYER_BANK_TILES + cellTile(cell), tile);
          const pal = pals[cellColor(cell)];
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              const pen = tile[y * 16 + x];
              px[(r * 16 + y) * width + c * 16 + x] = pen === 0 ? 0xff202020 : pal[pen];
            }
          }
        }
      }
    },
    [rom, map, bank, pals],
  );

  return (
    <>
      <div className="tengai-controls">
        <label>
          맵
          <input
            type="number"
            min={0}
            max={maps.length - 1}
            value={index}
            onChange={(e) => {
              setIndex(clamp(Number(e.target.value), 0, maps.length - 1));
              setBankOverride(null);
            }}
          />
          <small>/ {maps.length - 1}</small>
        </label>
        <label>
          타일 뱅크
          <select value={bankOverride ?? 'auto'} onChange={(e) => setBankOverride(e.target.value === 'auto' ? null : Number(e.target.value))}>
            <option value="auto">자동 ({guessed})</option>
            {[0, 1, 2, 3].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label>
          팔레트 표
          <select value={table} onChange={(e) => setTable(Number(e.target.value))}>
            {palTables.map((t, i) => (
              <option key={i} value={i}>
                {i} ({t.length}세트)
              </option>
            ))}
          </select>
        </label>
        <label>
          세트
          <input type="number" min={0} max={sets.length - 1} value={set} onChange={(e) => setSet(clamp(Number(e.target.value), 0, sets.length - 1))} />
        </label>
        <small>
          {map.cols}×{map.rows} 타일 · ROM 0x{map.addr.toString(16)}
        </small>
      </div>
      <div className="tengai-scroll">
        <canvas ref={ref} className="tengai-pixel" style={{ width: width * 2, height: height * 2 }} />
      </div>
    </>
  );
}

const SPRITE_COLS = 32;
const SPRITE_ROWS = 16;

function SpriteView({ rom }: { rom: TengaiRom }) {
  const palSets = useMemo(() => readPaletteSets(rom.prog, SPRITE_PALSET_TABLE), [rom]);
  const allPals = useMemo(() => allPaletteAddrs(), []);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<'lut' | 'raw'>('lut');
  const [palette, setPalette] = useState(0);
  const pal = useMemo(() => readPalette(rom.prog, allPals[palette]), [rom, allPals, palette]);
  const perPage = SPRITE_COLS * SPRITE_ROWS;
  const total = mode === 'lut' ? rom.spriteLut.length : rom.sprites.length / 128;
  const pages = Math.ceil(total / perPage);

  const width = SPRITE_COLS * 17;
  const height = SPRITE_ROWS * 17;
  const ref = useCanvasImage(
    width,
    height,
    (px) => {
      px.fill(0xff181818);
      const tile = new Uint8Array(256);
      for (let i = 0; i < perPage; i++) {
        const code = page * perPage + i;
        if (code >= total) break;
        const t = mode === 'lut' ? rom.spriteLut[code] : code;
        if (t === 0xffff) continue;
        decodeTile(rom.sprites, t, tile);
        const ox = (i % SPRITE_COLS) * 17;
        const oy = Math.floor(i / SPRITE_COLS) * 17;
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const pen = tile[y * 16 + x];
            if (pen) px[(oy + y) * width + ox + x] = pal[pen];
          }
        }
      }
    },
    [rom, page, mode, pal],
  );

  return (
    <>
      <div className="tengai-controls">
        <label>
          보기
          <select value={mode} onChange={(e) => (setMode(e.target.value as 'lut' | 'raw'), setPage(0))}>
            <option value="lut">스프라이트 코드 (LUT 경유)</option>
            <option value="raw">ROM 타일 순서</option>
          </select>
        </label>
        <label>
          페이지
          <input type="number" min={0} max={pages - 1} value={page} onChange={(e) => setPage(clamp(Number(e.target.value), 0, pages - 1))} />
          <small>/ {pages - 1}</small>
        </label>
        <label>
          팔레트
          <input type="number" min={0} max={allPals.length - 1} value={palette} onChange={(e) => setPalette(clamp(Number(e.target.value), 0, allPals.length - 1))} />
          <small>/ {allPals.length - 1}</small>
        </label>
        <small>
          코드 0x{(page * perPage).toString(16)}~ · 스프라이트 팔레트 세트 {palSets.length}개
        </small>
      </div>
      <div className="tengai-scroll">
        <canvas ref={ref} className="tengai-pixel" style={{ width: width * 2, height: height * 2 }} />
      </div>
    </>
  );
}

function PaletteView({ rom }: { rom: TengaiRom }) {
  const addrs = useMemo(() => allPaletteAddrs(), []);
  const width = 16 * 4;
  const height = addrs.length;
  const ref = useCanvasImage(
    width,
    height,
    (px) => {
      addrs.forEach((a, row) => {
        const pal = readPalette(rom.prog, a);
        for (let c = 0; c < 16; c++) for (let k = 0; k < 4; k++) px[row * width + c * 4 + k] = pal[c];
      });
    },
    [rom, addrs],
  );
  return (
    <>
      <p className="tengai-note">ROM의 16색 팔레트 {addrs.length}개 (한 줄이 팔레트 하나, 0번 색은 투명)</p>
      <div className="tengai-scroll">
        <canvas ref={ref} className="tengai-pixel" style={{ width: width * 6, height: height * 3 }} />
      </div>
    </>
  );
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
