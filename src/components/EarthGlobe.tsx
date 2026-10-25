import {useEffect, useRef} from 'react';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {moonAt, subLunarPoint, SYNODIC_DAYS} from '../lib/astro';
import {onFrame} from '../lib/scroll';

/**
 * The Earth as the Moon sees it on a given night, drawn per pixel on a 2D
 * canvas from NASA's Blue Marble (day) and Black Marble (night) maps.
 *
 * What's true: the lit fraction and which side is lit (from the Moon's
 * elongation), and the face it starts on — the hemisphere with the Moon
 * overhead at that moment (sub-lunar point). What's sped up: the spin. The
 * Earth turns under a terminator that stays put, as it would from the Moon,
 * once every SPIN_S seconds instead of once a day. Drag to turn it by hand.
 *
 * Each canvas pixel is mapped to the sphere once (an orthographic look-up
 * table, built in idle time before the globe scrolls into view and rebuilt
 * only when the size or the night changes); a frame is then a table walk
 * with a longitude offset, run from the shared frame loop only while the
 * globe is near the screen, at 30 fps for the slow spin and every frame
 * while it's dragged.
 */

const SPIN_S = 72; // one turn in 72 s — 1,200× real time
const MAX_DPR = 1.5; // plenty for a globe this size, and 44% fewer pixels than 2×
const SPIN_FRAME_MS = 30; // the idle spin redraws at ~30 fps

const idle = (fn: () => void) =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, {timeout: 300}) : setTimeout(fn, 0);
const MAP_W = 1536;
const MAP_H = 768;

type Maps = {day: Uint8ClampedArray; night: Uint8ClampedArray};
type Table = {
  size: number;
  idx: Int32Array; // canvas pixel
  row: Int32Array; // map row offset (row × MAP_W)
  col: Float32Array; // map column before spin
  light: Float32Array; // 0 night … 1 day
  shade: Float32Array; // limb darkening
  rim: Float32Array; // atmosphere at the limb
  alpha: Uint8Array; // edge coverage
};

let mapsPromise: Promise<Maps> | null = null;
function loadMaps(): Promise<Maps> {
  mapsPromise ??= Promise.all(
    ['/media/earth/day.webp', '/media/earth/night.webp'].map(
      (src) =>
        new Promise<Uint8ClampedArray>((resolve, reject) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = MAP_W;
            c.height = MAP_H;
            const g = c.getContext('2d', {willReadFrequently: true})!;
            g.drawImage(img, 0, 0, MAP_W, MAP_H);
            resolve(g.getImageData(0, 0, MAP_W, MAP_H).data);
          };
          img.onerror = reject;
          img.src = src;
        }),
    ),
  ).then(([day, night]) => ({day, night}));
  return mapsPromise;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function buildTable(size: number, latDeg: number, elongation: number): Table {
  const r = size / 2;
  const cosD = Math.cos((latDeg * Math.PI) / 180);
  const sinD = Math.sin((latDeg * Math.PI) / 180);
  // The Sun, in the viewer's frame (+z toward the Moon, +x east, +y north).
  const sx = -Math.sin(elongation);
  const sz = Math.cos(elongation);
  const cap = size * size;
  const idx = new Int32Array(cap);
  const row = new Int32Array(cap);
  const col = new Float32Array(cap);
  const light = new Float32Array(cap);
  const shade = new Float32Array(cap);
  const rim = new Float32Array(cap);
  const alpha = new Uint8Array(cap);
  let n = 0;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - r) / r;
      const y = (r - py - 0.5) / r;
      const d2 = x * x + y * y;
      const dist = Math.sqrt(d2);
      const cover = Math.min(1, Math.max(0, (1 - dist) * r + 0.5));
      if (cover <= 0) continue;
      const z = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
      const lat = Math.asin(Math.max(-1, Math.min(1, y * cosD + z * sinD)));
      const dlon = Math.atan2(x, z * cosD - y * sinD);
      idx[n] = py * size + px;
      row[n] = Math.min(MAP_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * MAP_H))) * MAP_W;
      col[n] = (dlon / (2 * Math.PI)) * MAP_W;
      light[n] = smooth(-0.12, 0.16, x * sx + z * sz);
      shade[n] = 0.62 + 0.38 * Math.pow(z, 0.45);
      rim[n] = Math.pow(1 - z, 2.6);
      alpha[n] = Math.round(cover * 255);
      n++;
    }
  }
  return {size, idx: idx.slice(0, n), row: row.slice(0, n), col: col.slice(0, n), light: light.slice(0, n), shade: shade.slice(0, n), rim: rim.slice(0, n), alpha: alpha.slice(0, n)};
}

export function EarthGlobe({date, label, className = ''}: {date: Date; label: string; className?: string}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const state = useRef({
    maps: null as Maps | null,
    table: null as Table | null,
    frame: null as ImageData | null,
    lon0: 0,
    lat0: 0,
    elong: 0,
    spin: 0,
    vel: 0,
    drag: null as null | {x: number; t: number},
    dirty: true,
    near: false,
    last: 0,
    lastDraw: 0,
    building: false,
  });
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  // The night: sub-lunar point and the Sun's direction, from the date.
  useEffect(() => {
    const s = state.current;
    const p = subLunarPoint(date);
    s.lon0 = p.lon;
    s.lat0 = p.lat;
    s.elong = (moonAt(date).age / SYNODIC_DAYS) * 2 * Math.PI;
    s.spin = 0;
    s.table = null;
    s.dirty = true;
  }, [date]);

  /** Build the sphere table for the canvas's current size, off the frame. */
  const buildSoon = () => {
    const s = state.current;
    const c = canvasRef.current;
    if (s.building || !c) return;
    s.building = true;
    idle(() => {
      s.building = false;
      const size = Math.round(c.clientWidth * Math.min(window.devicePixelRatio || 1, MAX_DPR));
      if (size < 8) return;
      s.table = buildTable(size, s.lat0, s.elong);
      s.frame = new ImageData(size, size);
      c.width = c.height = size;
      s.dirty = true;
    });
  };

  // Load the maps and build the table while the globe is still on its way in.
  useEffect(() => {
    const c = canvasRef.current!;
    const io = new IntersectionObserver(
      ([e]) => {
        state.current.near = e.isIntersecting;
        if (e.isIntersecting)
          loadMaps()
            .then((maps) => {
              state.current.maps = maps;
              state.current.dirty = true;
              buildSoon();
            })
            .catch(() => {});
      },
      {rootMargin: '400px'},
    );
    io.observe(c);
    return () => io.disconnect();
  }, []);

  // Drag to spin, with a little inertia.
  useEffect(() => {
    const c = canvasRef.current!;
    const s = state.current;
    const down = (e: PointerEvent) => {
      s.drag = {x: e.clientX, t: e.timeStamp};
      s.vel = 0;
      c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!s.drag) return;
      const dx = e.clientX - s.drag.x;
      const deg = (dx / c.clientWidth) * 180;
      s.spin -= deg;
      s.vel = -deg / Math.max(1, e.timeStamp - s.drag.t);
      s.drag = {x: e.clientX, t: e.timeStamp};
      s.dirty = true;
    };
    const up = () => {
      s.drag = null;
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }, []);

  useEffect(() => {
    return onFrame((time) => {
      const s = state.current;
      const c = canvasRef.current;
      if (!c || !s.near || !s.maps) return;
      const dt = s.last ? Math.min(0.1, (time - s.last) / 1000) : 0;
      s.last = time;

      if (!s.drag) {
        if (Math.abs(s.vel) > 0.0005) {
          s.spin += s.vel * dt * 1000;
          s.vel *= Math.pow(0.04, dt);
          s.dirty = true;
        } else if (!reducedRef.current) {
          s.spin += (360 / SPIN_S) * dt;
          s.dirty = true;
        }
      }

      const size = Math.round(c.clientWidth * Math.min(window.devicePixelRatio || 1, MAX_DPR));
      if (size < 8) return;
      if (!s.table || s.table.size !== size) {
        buildSoon();
        return;
      }
      if (!s.dirty) return;
      // The idle spin is slow: ~30 fps is indistinguishable and half the work.
      if (!s.drag && Math.abs(s.vel) <= 0.0005 && time - s.lastDraw < SPIN_FRAME_MS) return;
      s.lastDraw = time;
      s.dirty = false;

      const {day, night} = s.maps;
      const t = s.table;
      const out = s.frame!.data;
      // Features drift eastward across the face as the Earth turns, so the
      // centre longitude falls as spin grows.
      const lon = s.lon0 - s.spin;
      const shift = ((((lon + 180) / 360) % 1) + 1) % 1 * MAP_W;
      for (let k = 0; k < t.idx.length; k++) {
        let cx = (t.col[k] + shift) | 0;
        cx %= MAP_W;
        if (cx < 0) cx += MAP_W;
        const m = (t.row[k] + cx) * 4;
        const o = t.idx[k] * 4;
        const l = t.light[k];
        const dk = 1 - l;
        const sh = t.shade[k];
        const rim = t.rim[k] * (0.3 + 0.7 * l);
        out[o] = day[m] * l * sh + night[m] * dk * 1.25 + 70 * rim;
        out[o + 1] = day[m + 1] * l * sh + night[m + 1] * dk * 1.1 + 140 * rim;
        out[o + 2] = day[m + 2] * l * sh + night[m + 2] * dk * 0.85 + 255 * rim;
        out[o + 3] = t.alpha[k];
      }
      c.getContext('2d')!.putImageData(s.frame!, 0, 0);
    });
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Atmosphere: a thin blue halo hugging the limb. */}
      <span aria-hidden="true" className="pointer-events-none absolute -inset-[9%] rounded-full bg-[radial-gradient(circle,rgb(111_182_255/0.28)_58%,rgb(111_182_255/0.08)_66%,transparent_72%)]" />
      <canvas ref={canvasRef} role="img" aria-label={label} className="relative block size-full cursor-grab touch-pan-y rounded-full active:cursor-grabbing" />
    </div>
  );
}
