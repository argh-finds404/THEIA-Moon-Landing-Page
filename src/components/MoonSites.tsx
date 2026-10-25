import {useEffect, useRef, useState, type KeyboardEvent, type PointerEvent} from 'react';
import {legends, sites} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {useReveals} from '../hooks/useReveals';
import {createScene, GLSL_COMMON, loadTexture, textureTier, type Scene} from '../lib/gl';
import {clamp} from '../lib/math';
import {onFrame} from '../lib/scroll';

/**
 * Every landing from Legends, pinned on one Moon at its real coordinates.
 *
 * The Moon is drawn per pixel in WebGL2 from NASA LRO maps (LROC colour, a
 * normal map built from LOLA heights), lit from a fixed angle so the relief
 * reads. It turns slowly on its own, can be dragged, and flies to a site
 * picked from the list. The pins are DOM buttons placed from the same view
 * rotation, written from the shared frame loop.
 *
 * Until the maps arrive — and for good without WebGL2 — the stage shows
 * moon-poster.webp, rendered by scripts/build-space.mjs from the same view,
 * light and shading constants as this file, so the swap is seamless. Keep
 * VIEW0, SUN and the shading in step with that script.
 */

const DEG = Math.PI / 180;
const VIEW0 = {lat: 8 * DEG, lon: 15 * DEG};
const SUN = (() => {
  const v = [0.72, 0.32, 0.6];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();
const DISC = 0.9; // the Moon's diameter as a share of the stage
const AUTO = 0.06; // rad/s of idle turning
const IDLE_MS = 2600; // after a drag, wait this long before turning again
const FLY_MS = 1500;
const LAT_MAX = 1.25;
const MAX_PIXELS = 2.4e6;

// Touchdown coordinates (°N, °E), from the mission records.
const COORDS: Record<string, [number, number]> = {
  apollo11: [0.674, 23.473],
  lunokhod1: [38.238, -35.0],
  apollo15: [26.132, 3.634],
  apollo17: [20.191, 30.772],
  change4: [-45.444, 177.599],
  chandrayaan3: [-69.373, 32.319],
};

type Site = {
  id: string;
  name: string;
  year?: number;
  agency: string;
  first: string;
  where: string;
  lat: number;
  lon: number;
  concept?: boolean;
};

const SITES: Site[] = [
  ...legends.items
    .filter((m) => COORDS[m.id])
    .map((m) => ({
      id: m.id,
      name: m.name,
      year: m.year,
      agency: m.agency,
      first: m.first,
      where: m.where,
      lat: COORDS[m.id][0] * DEG,
      lon: COORDS[m.id][1] * DEG,
    })),
  {
    id: 'marginis',
    ...sites.marginis,
    lat: 13.3 * DEG,
    lon: 86.1 * DEG,
    concept: true,
  },
];

const coord = (lat: number, lon: number) => `${Math.abs(lat / DEG).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon / DEG).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A body-frame site in view space (x right, y up, z toward the viewer): rotX(rotY(b, -lon), lat). */
function toView(lat: number, lon: number, vLat: number, vLon: number) {
  const bx = Math.cos(lat) * Math.sin(lon);
  const by = Math.sin(lat);
  const bz = Math.cos(lat) * Math.cos(lon);
  const c = Math.cos(-vLon);
  const s = Math.sin(-vLon);
  const x = c * bx + s * bz;
  const z = -s * bx + c * bz;
  const c2 = Math.cos(vLat);
  const s2 = Math.sin(vLat);
  return [x, c2 * by - s2 * z, s2 * by + c2 * z];
}

const FRAGMENT = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uR;
uniform vec2 uView;
uniform vec3 uSun;
uniform sampler2D uColor, uNormal;
${GLSL_COMMON}

void main() {
  vec2 p = (gl_FragCoord.xy - uRes * 0.5) / uR;
  float d = length(p);
  // Shade a hair inside the limb everywhere so derivatives stay defined; alpha cuts the disc.
  vec2 q = p * min(1.0, 0.999 / max(d, 1e-5));
  vec3 n = vec3(q, sqrt(max(1.0 - dot(q, q), 0.0)));
  vec3 b = rotY(rotX(n, -uView.x), uView.y);
  vec2 uv = equirect(b);
  vec3 albedo = toLinear(sampleEq(uColor, uv).rgb);
  vec3 tn = sampleEq(uNormal, uv).rgb * 2.0 - 1.0;
  float lon = atan(b.x, b.z);
  float lat = asin(clamp(b.y, -1.0, 1.0));
  vec3 east = vec3(cos(lon), 0.0, -sin(lon));
  vec3 north = vec3(-sin(lon) * sin(lat), cos(lat), -cos(lon) * sin(lat));
  vec3 nv = rotX(rotY(normalize(east * tn.x + north * tn.y + b * tn.z), -uView.y), uView.x);
  float mu0 = max(dot(nv, uSun), 0.0);
  float mu = max(n.z, 0.05);
  // Lommel-Seeliger plus a little Lambert, so the relief holds up away from the terminator.
  vec3 col = albedo * (mu0 / (mu0 + mu + 1e-6) * 1.25 + mu0 * 0.75 + vec3(0.5, 0.62, 0.9) * 0.02);
  col = tonemap(col * 0.95);
  float a = clamp((1.0 - d) * uR * 0.5, 0.0, 1.0);
  fragColor = vec4(col * a, a);
}`;

export function MoonSites() {
  const ref = useReveals<HTMLElement>();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const facingRef = useRef<HTMLSpanElement>(null);
  const sideRef = useRef<HTMLSpanElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const view = useRef({
    lat: VIEW0.lat,
    lon: VIEW0.lon,
    vel: 0,
    velLat: 0,
    down: false,
    id: -1,
    lastX: 0,
    lastY: 0,
    touched: -Infinity,
    holding: false,
    ready: false,
    fly: null as null | {
      lat0: number;
      lon0: number;
      dLat: number;
      dLon: number;
      t0: number;
    },
  });

  useEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current;
    let scene: Scene | null = null;
    let started = false;
    let visible = false;
    let size = 0;
    let stageLeft = 0;
    let lastTime = 0;
    const drawn = {lat: NaN, lon: NaN, size: 0};

    const start = () => {
      if (started || !canvas) return;
      started = true;
      scene = createScene(canvas, FRAGMENT, {alpha: true});
      if (!scene) {
        setFallback(true);
        return;
      }
      const {gl, u} = scene;
      gl.clearColor(0, 0, 0, 0);
      Promise.all([loadTexture(gl, `/media/space/moon-color-${textureTier()}.webp`, 0), loadTexture(gl, '/media/space/moon-normal-2k.webp', 1)])
        .then(() => {
          gl.uniform1i(u('uColor'), 0);
          gl.uniform1i(u('uNormal'), 1);
          gl.uniform3f(u('uSun'), SUN[0], SUN[1], SUN[2]);
          view.current.ready = true;
          drawn.lat = NaN; // draw now, even if the view is holding still
        })
        .catch(() => setFallback(true));
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(stage);
    // A second, wider watch sets up and fetches the maps well before the section arrives.
    const early = new IntersectionObserver(([e]) => e.isIntersecting && start(), {rootMargin: '120% 0px'});
    early.observe(stage);
    const ro = new ResizeObserver(([e]) => {
      size = e.contentRect.width;
      stageLeft = stage.getBoundingClientRect().left;
    });
    ro.observe(stage);

    const off = onFrame((time) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;
      if (!visible || !size) return;
      const v = view.current;

      // Move the view: a flight to a site, else drag inertia, else the idle turn.
      if (v.ready) {
        if (v.fly) {
          const t = clamp((time - v.fly.t0) / FLY_MS);
          const e = easeInOut(t);
          v.lat = v.fly.lat0 + v.fly.dLat * e;
          v.lon = v.fly.lon0 + v.fly.dLon * e;
          if (t >= 1) v.fly = null;
        } else if (!v.down) {
          v.lon += v.vel;
          v.lat += v.velLat;
          v.vel *= 0.92;
          v.velLat *= 0.92;
          if (!reducedRef.current && !v.holding && time - v.touched > IDLE_MS) v.lon += AUTO * dt;
        }
        v.lat = clamp(v.lat, -LAT_MAX, LAT_MAX);
      }

      if (Math.abs(v.lat - drawn.lat) < 1e-5 && Math.abs(v.lon - drawn.lon) < 1e-5 && drawn.size === size) return;
      drawn.lat = v.lat;
      drawn.lon = v.lon;
      drawn.size = size;

      if (v.ready && scene && canvas) {
        const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / Math.max(1, size * size)));
        const px = Math.round(size * scale);
        if (canvas.width !== px) canvas.width = canvas.height = px;
        const {gl, u, draw} = scene;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(u('uRes'), px, px);
        gl.uniform1f(u('uR'), (px / 2) * DISC);
        gl.uniform2f(u('uView'), v.lat, v.lon);
        draw();
        if (canvas.style.opacity !== '1') {
          canvas.style.opacity = '1';
          if (posterRef.current) posterRef.current.style.opacity = '0';
        }
      }

      // Pins: on the disc where they face us, fading out over the limb.
      const R = (size / 2) * DISC;
      SITES.forEach((s, i) => {
        const el = pinRefs.current[i];
        if (!el) return;
        const [x, y, z] = toView(s.lat, s.lon, v.lat, v.lon);
        const o = clamp(z / 0.18);
        el.style.transform = `translate3d(${(size / 2 + x * R).toFixed(1)}px, ${(size / 2 - y * R).toFixed(1)}px, 0)`;
        el.style.opacity = o.toFixed(3);
        el.style.visibility = o > 0.02 ? 'visible' : 'hidden';
        // Labels go right of their pin unless that would run off the screen.
        el.dataset.side = stageLeft + size / 2 + x * R + 130 > window.innerWidth - 8 ? 'l' : 'r';
      });

      const lon = wrap(v.lon);
      if (facingRef.current) facingRef.current.textContent = coord(v.lat, lon);
      if (sideRef.current) sideRef.current.textContent = Math.abs(lon) < Math.PI / 2 ? sites.nearSide : sites.farSide;
    });

    return () => {
      io.disconnect();
      early.disconnect();
      ro.disconnect();
      off();
      scene?.dispose();
    };
  }, []);

  const select = (i: number) => {
    const v = view.current;
    const next = active === i ? null : i;
    setActive(next);
    v.holding = next !== null;
    v.touched = performance.now();
    if (next === null || !v.ready) return;
    const s = SITES[next];
    // A little above the site, so its pin sits on the face rather than on the limb.
    const lat = clamp(s.lat * 0.85, -LAT_MAX, LAT_MAX);
    if (reducedRef.current) {
      v.lat = lat;
      v.lon = s.lon;
      v.fly = null;
      return;
    }
    v.vel = v.velLat = 0;
    v.fly = {
      lat0: v.lat,
      lon0: v.lon,
      dLat: lat - v.lat,
      dLon: wrap(s.lon - v.lon),
      t0: performance.now(),
    };
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const v = view.current;
    if (!v.ready) return;
    v.down = true;
    v.id = e.pointerId;
    v.lastX = e.clientX;
    v.lastY = e.clientY;
    v.vel = v.velLat = 0;
    v.fly = null;
    v.touched = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const v = view.current;
    if (!v.down || e.pointerId !== v.id) return;
    const k = 2.4 / Math.max(200, e.currentTarget.clientWidth);
    const dx = (e.clientX - v.lastX) * -k;
    const dy = (e.clientY - v.lastY) * k;
    v.lastX = e.clientX;
    v.lastY = e.clientY;
    v.lon += dx;
    v.lat += dy;
    v.vel = dx;
    v.velLat = dy;
    v.touched = performance.now();
  };
  const onUp = () => {
    view.current.down = false;
    view.current.touched = performance.now();
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const v = view.current;
    const step = {
      ArrowLeft: [0.06, 0],
      ArrowRight: [-0.06, 0],
      ArrowUp: [0, -0.05],
      ArrowDown: [0, 0.05],
    }[e.key];
    if (!step || !v.ready) return;
    e.preventDefault();
    v.fly = null;
    v.vel = step[0];
    v.velLat = step[1];
    v.touched = performance.now();
  };

  return (
    <section ref={ref} id="sites" aria-labelledby="sites-title" className="relative overflow-x-clip bg-void px-4 py-28 sm:px-6 md:px-[6vw] md:py-40">
      {/* Phones: heading, Moon, list — so a picked site flies into view right above it. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-[5vw] lg:gap-y-10">
        <div className="lg:col-start-1 lg:row-start-1 lg:self-end" data-reveal>
          <p className="font-mono text-label text-earth uppercase">{sites.eyebrow}</p>
          <h2 id="sites-title" className="mt-4 font-display text-[clamp(1.5rem,3.2vw,3rem)] leading-[1.1] text-balance text-white">
            {sites.heading}
          </h2>
          <p className="mt-5 max-w-[42ch] text-body text-pretty text-regolith/75">{sites.body}</p>
        </div>

        <ul className="border-t border-white/10 lg:col-start-1 lg:row-start-2 lg:self-start" data-reveal style={{transitionDelay: '120ms'}}>
          {SITES.map((s, i) => {
            const on = active === i;
            return (
              <li key={s.id} className="border-b border-white/10">
                <button
                  type="button"
                  aria-expanded={on}
                  aria-controls={`site-${s.id}`}
                  onClick={() => select(i)}
                  className="group flex min-h-12 w-full items-center gap-4 py-3 text-left outline-none focus-visible:bg-white/5"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300 ${
                      on ? 'bg-earth shadow-[0_0_0_4px_rgb(111_182_255/0.2)]' : s.concept ? 'border border-earth/70' : 'bg-sunlit/80 group-hover:bg-white'
                    }`}
                  />
                  <span
                    className={`flex-1 font-display text-[0.8125rem] tracking-[0.14em] uppercase transition-colors ${on ? 'text-white' : 'text-regolith/80 group-hover:text-white'}`}
                  >
                    {s.name}
                  </span>
                  <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-regolith/50 tabular-nums max-sm:hidden">{coord(s.lat, s.lon)}</span>
                  <span className={`w-[4.5rem] text-right font-mono text-[0.6875rem] tracking-[0.1em] uppercase tabular-nums ${s.concept ? 'text-earth/80' : 'text-regolith/60'}`}>
                    {s.year ?? sites.concept}
                  </span>
                </button>
                <div
                  id={`site-${s.id}`}
                  className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] motion-reduce:transition-none ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden" inert={!on}>
                    <div className="pb-5 pl-6">
                      <p className="max-w-[44ch] text-[0.9375rem] leading-relaxed text-pretty text-white/90">{s.first}</p>
                      <p className="mt-2 font-mono text-[0.6875rem] leading-relaxed tracking-[0.08em] text-regolith/55 uppercase">
                        {s.agency} <span className="text-regolith/30">/</span> {s.where}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <figure className="self-center lg:col-start-2 lg:row-span-2 lg:row-start-1 max-lg:row-start-2" data-reveal style={{transitionDelay: '200ms'}}>
          <div ref={stageRef} className="relative mx-auto aspect-square w-full max-w-[min(100%,82svh)]">
            {/* Scale ring: one tick per 5°, a HUD around the disc. */}
            <svg aria-hidden="true" viewBox="-100 -100 200 200" className="pointer-events-none absolute inset-0 size-full text-white/12">
              <circle r="94" fill="none" stroke="currentColor" strokeWidth="0.25" />
              {Array.from({length: 72}, (_, k) => (
                <line key={k} x1="0" y1={k % 6 === 0 ? -97.5 : -96} x2="0" y2="-94" stroke="currentColor" strokeWidth="0.25" transform={`rotate(${k * 5})`} />
              ))}
            </svg>
            <img
              ref={posterRef}
              src="/media/space/moon-poster.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="pointer-events-none absolute inset-[5%] size-[90%] select-none transition-opacity duration-500"
            />
            {!fallback && (
              <canvas
                ref={canvasRef}
                tabIndex={0}
                role="img"
                aria-label={sites.label}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onKeyDown={onKey}
                style={{opacity: 0}}
                className="absolute inset-0 size-full cursor-grab transition-opacity duration-500 touch-pan-y rounded-full outline-none select-none focus-visible:ring-1 focus-visible:ring-earth/60 active:cursor-grabbing"
              />
            )}

            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {SITES.map((s, i) => {
                const on = active === i;
                return (
                  <div
                    key={s.id}
                    ref={(el) => {
                      pinRefs.current[i] = el;
                    }}
                    className="group/pin absolute top-0 left-0"
                    style={{opacity: 0, visibility: 'hidden'}}
                  >
                    <button type="button" tabIndex={-1} onClick={() => select(i)} className="pointer-events-auto absolute -top-5 -left-5 grid size-10 place-items-center">
                      {on && <span className="absolute size-5 animate-ping rounded-full bg-earth/40 motion-reduce:hidden" />}
                      <span
                        className={`relative rounded-full transition-[width,height,background-color] duration-300 ${
                          on
                            ? 'size-3 bg-earth shadow-[0_0_12px_rgb(111_182_255/0.9)]'
                            : s.concept
                              ? 'size-2.5 border border-earth bg-void/40'
                              : 'size-2 bg-sunlit shadow-[0_0_0_3px_rgb(5_7_12/0.45)]'
                        }`}
                      />
                    </button>
                    <span
                      className={`pointer-events-none absolute top-0 left-3.5 -translate-y-1/2 rounded-[2px] bg-void/65 px-1.5 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] whitespace-nowrap uppercase group-data-[side=l]/pin:right-3.5 group-data-[side=l]/pin:left-auto ${
                        on ? 'text-white' : 'text-regolith/85 max-md:hidden'
                      }`}
                    >
                      {s.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <figcaption className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 font-mono text-label text-regolith/55 uppercase">
            <span>
              {sites.facing}{' '}
              <span ref={facingRef} className="text-white tabular-nums">
                {coord(VIEW0.lat, VIEW0.lon)}
              </span>{' '}
              <span className="text-regolith/30">/</span> <span ref={sideRef}>{sites.nearSide}</span>
            </span>
            {!fallback && <span className="max-md:hidden">{sites.drag}</span>}
          </figcaption>
          <p className="mt-3 max-w-[60ch] font-mono text-[0.625rem] leading-relaxed tracking-[0.12em] text-regolith/40 uppercase">{sites.note}</p>
        </figure>
      </div>
    </section>
  );
}
