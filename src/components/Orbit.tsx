import {useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject} from 'react';
import {orbit, phases} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {lightSeconds, orbitDistance, phaseIndex, phasePath, SYNODIC_DAYS} from '../lib/astro';
import {createScene, GLSL_COMMON, loadTexture, textureTier, type Scene} from '../lib/gl';
import {pinProgress, range} from '../lib/math';
import {onFrame} from '../lib/scroll';

/**
 * The Earth as seen from out by the Moon, through the middle of a lunar
 * month. Scroll moves the Sun: early on it's off to the left and the Earth
 * is a fading crescent; at full Moon it's behind the Earth — which is then
 * "new", a dark globe of city lights ringed by sunrise in its atmosphere —
 * and then it breaks out on the other side. The Moon in frame is lit by the
 * same Sun.
 *
 * Drawn per pixel in WebGL2 from NASA maps (Blue Marble, Black Marble,
 * clouds; LRO colour and LOLA relief for the Moon). Every readout comes from
 * the same Sun–Earth–Moon angle that lights the scene. Sizes and distances
 * aren't to scale, and the Earth's spin is sped up; the page says so.
 * Without WebGL2 the chapter shows NASA's real Artemis II Earthset photo.
 */

const SECTION_VH = 300;
const WINDOW = [0.04, 0.96] as const;
// Elongation swept by the scroll: from a little after first quarter, through full, to before last quarter.
const E_FROM = 0.55 * Math.PI;
const E_TO = 1.45 * Math.PI;
const PERIGEE_OFFSET_DAYS = 4.2;
const SUN_LIFT = 0.18; // the Sun sits a little above the Earth–Moon plane in this view
const EARTH_LAT = 0.24; // look from ~14°N, where most city lights are
const EARTH_LON0 = (-95 * Math.PI) / 180; // start over the Americas
const SPIN = 0.03; // rad/s: sped up, and labelled so
const MAX_PIXELS = 2.6e6;

const FRAGMENT = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform vec3 uEarth;
uniform vec3 uMoon;
uniform vec3 uSun;
uniform vec2 uSunPx;
uniform float uSunOn;
uniform float uEarthLon, uEarthLat, uMoonLon, uCloudLon;
uniform sampler2D uDay, uNight, uClouds, uMoonColor, uMoonNormal, uStars;
uniform vec2 uStarFit;
${GLSL_COMMON}

vec3 shadeEarth(vec3 n) {
  vec3 b = rotY(rotX(n, -uEarthLat), uEarthLon);
  vec2 uv = equirect(b);
  vec3 day = toLinear(sampleEq(uDay, uv).rgb);
  vec3 night = toLinear(sampleEq(uNight, uv).rgb);
  float cloud = smoothstep(0.12, 0.85, sampleEq(uClouds, equirect(rotY(rotX(n, -uEarthLat), uEarthLon + uCloudLon))).r);
  float ndl = dot(n, uSun);
  float dayAmt = smoothstep(-0.06, 0.2, ndl);
  float lambert = max(ndl, 0.0);
  float ocean = smoothstep(0.02, 0.1, day.b - max(day.r, day.g) * 0.9);
  vec3 h = normalize(uSun + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 60.0) * ocean * (1.0 - cloud) * 2.2;
  vec3 surface = mix(day * 1.35, vec3(0.95), cloud);
  vec3 col = surface * lambert * 2.2;
  col += spec * vec3(1.0, 0.9, 0.75) * dayAmt;
  col *= mix(vec3(1.0), vec3(1.25, 0.82, 0.55), smoothstep(0.35, 0.0, ndl) * dayAmt);
  col += night * vec3(1.0, 0.76, 0.46) * 4.0 * (1.0 - dayAmt) * (1.0 - cloud * 0.75);
  float rim = pow(1.0 - n.z, 2.5);
  col += vec3(0.18, 0.42, 1.0) * rim * (0.08 + 1.4 * smoothstep(-0.3, 0.6, ndl));
  return col;
}

vec3 shadeMoon(vec3 n) {
  vec3 b = rotY(n, uMoonLon);
  vec2 uv = equirect(b);
  vec3 albedo = toLinear(sampleEq(uMoonColor, uv).rgb);
  vec3 tn = sampleEq(uMoonNormal, uv).rgb * 2.0 - 1.0;
  float lon = atan(b.x, b.z);
  float lat = asin(clamp(b.y, -1.0, 1.0));
  vec3 east = vec3(cos(lon), 0.0, -sin(lon));
  vec3 north = vec3(-sin(lon) * sin(lat), cos(lat), -cos(lon) * sin(lat));
  vec3 nv = rotY(normalize(east * tn.x + north * tn.y + b * tn.z), -uMoonLon);
  float mu0 = max(dot(nv, uSun), 0.0);
  float mu = max(n.z, 0.05);
  // Lommel-Seeliger: why a full Moon looks flat rather than shaded like a ball.
  vec3 col = albedo * (mu0 / (mu0 + mu) * 2.6 + mu0 * 0.6);
  col += albedo * vec3(0.5, 0.65, 1.0) * 0.015;
  return col;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 col = vec3(0.0);
  // The real sky behind: the Milky Way's core from NASA's Deep Star Map, fitted to cover the frame.
  vec2 st = (gl_FragCoord.xy / uRes - 0.5) * uStarFit + 0.5;
  col += max(toLinear(texture(uStars, vec2(st.x, 1.0 - st.y)).rgb) - 0.003, 0.0) * 0.45;

  // The Sun: core and starburst hide behind the Earth; its glare leaks round it.
  float r = uEarth.z;
  vec2 ds = p - uSunPx;
  float dsun = length(ds);
  float clear = smoothstep(r * 0.985, r * 1.03, length(uSunPx - uEarth.xy));
  float s = uSunOn;
  float core = exp(-dsun / (r * 0.022)) * 24.0;
  float glare = exp(-dsun / (r * 0.1)) * 1.6;
  float warm = exp(-dsun / (r * 0.45)) * 0.55 + exp(-dsun / (r * 1.4)) * 0.18;
  float ang = atan(ds.y, ds.x);
  float rays = pow(abs(cos(ang * 3.0)), 80.0) * exp(-dsun / (r * 1.4)) * 1.1 + pow(abs(cos(ang * 3.0 + 0.52)), 160.0) * exp(-dsun / (r * 0.7)) * 0.6;
  vec3 sunCol = vec3(1.0, 0.88, 0.7);
  vec3 warmCol = vec3(1.0, 0.58, 0.28);
  col += sunCol * (core + rays + glare) * s * clear + warmCol * warm * s * mix(0.3, 1.0, clear);

  // Lens ghosts on the line through the middle of the frame.
  vec2 ctr = uRes * 0.5;
  for (int i = 0; i < 4; i++) {
    float k = float(i) * 0.45 + 0.35;
    vec2 gp = ctr + (ctr - uSunPx) * k;
    float gr = r * (0.05 + 0.04 * float(i));
    vec3 gc = (i == 0 || i == 2) ? vec3(1.0, 0.6, 0.3) : vec3(0.35, 0.7, 1.0);
    col += gc * smoothstep(gr, gr * 0.6, length(p - gp)) * 0.05 * s * clear;
  }

  // The Earth.
  vec2 pe = (p - uEarth.xy) / r;
  float de = length(pe);
  if (de < 1.0) {
    vec3 n = vec3(pe.x, -pe.y, sqrt(1.0 - de * de));
    col = mix(col, shadeEarth(n) + warmCol * warm * s * clear * 0.25, smoothstep(1.0, 1.0 - 2.0 / r, de));
  }
  // Its atmosphere beyond the limb: lit toward the Sun, a burning ring when the Sun is behind.
  if (de > 0.98 && de < 1.3) {
    vec2 dir = normalize(pe * vec2(1.0, -1.0));
    float t = max(de - 1.0, 0.0);
    float lit = smoothstep(-0.35, 0.8, dot(vec3(dir, 0.0), uSun));
    float aim = mix(1.0, smoothstep(-0.2, 0.9, dot(dir, normalize(uSun.xy + 1e-4))), clamp(length(uSun.xy) * 3.0, 0.0, 1.0));
    float back = pow(max(-uSun.z, 0.0), 2.0) * aim;
    // Sunlight bent through the atmosphere goes warm: a ring of sunsets.
    float ring = exp(-t * 55.0) * (0.3 * lit + 1.1 * back * s * (0.35 + 0.65 * aim));
    float haze = exp(-t * 12.0) * (0.1 * lit + 0.25 * back * s * aim);
    col += mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.5, 0.22), clamp(back * 1.2, 0.0, 1.0)) * (ring + haze);
  }

  // The Moon.
  vec2 pm = (p - uMoon.xy) / uMoon.z;
  float dm = length(pm);
  if (dm < 1.0) {
    vec3 n = vec3(pm.x, -pm.y, sqrt(1.0 - dm * dm));
    col = mix(col, shadeMoon(n), smoothstep(1.0, 1.0 - 2.0 / uMoon.z, dm));
  }

  col = tonemap(col * 1.05);
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

function PhaseIcon({pathRef, label}: {pathRef: RefObject<SVGPathElement | null>; label: string}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0">
      <title>{label}</title>
      <circle cx="12" cy="12" r="11" fill="#141925" stroke="rgb(255 255 255 / 0.12)" />
      <path ref={pathRef} d={phasePath(12, 12, 11, 0)} fill="#e9e6df" />
    </svg>
  );
}

export function Orbit() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dayRef = useRef<HTMLSpanElement>(null);
  const moonNameRef = useRef<HTMLSpanElement>(null);
  const earthNameRef = useRef<HTMLSpanElement>(null);
  const moonIconRef = useRef<SVGPathElement>(null);
  const earthIconRef = useRef<SVGPathElement>(null);
  const kmRef = useRef<HTMLSpanElement>(null);
  const delayRef = useRef<HTMLSpanElement>(null);
  const turn = useRef({down: false, lastX: 0, lon: 0, vel: 0, id: -1});
  const [fallback, setFallback] = useState(false);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    let scene: Scene | null = null;
    let ready = false;
    let starsPortrait = false;
    let started = false;
    let off: (() => void) | null = null;

    const start = () => {
      if (started) return;
      started = true;
      scene = createScene(canvas, FRAGMENT);
      if (!scene) {
        setFallback(true);
        return;
      }
      const {gl, u} = scene;
      const tier = textureTier();
      starsPortrait = window.innerWidth < 768;
      const maps: [string, string][] = [
        ['uDay', `/media/space/earth-day-${tier}.webp`],
        ['uNight', `/media/space/earth-night-${tier}.webp`],
        ['uClouds', '/media/space/earth-clouds.webp'],
        ['uMoonColor', `/media/space/moon-color-${tier}.webp`],
        ['uMoonNormal', '/media/space/moon-normal-2k.webp'],
        ['uStars', starsPortrait ? '/media/space/stars-m.webp' : '/media/space/stars-d.webp'],
      ];
      (async () => {
        for (let i = 0; i < maps.length; i++) {
          const [name, url] = maps[i];
          await loadTexture(gl, url, i);
          gl.uniform1i(u(name), i);
        }
        ready = true;
        lastP = -1; // draw the first frame even if nothing is moving
      })().catch(() => setFallback(true));
    };

    // Set up and fetch the maps well before the chapter arrives.
    const io = new IntersectionObserver(([e]) => e.isIntersecting && start(), {rootMargin: '150% 0px'});
    io.observe(root);
    // A held frame (reduced motion) still has to redraw when the canvas changes size.
    const ro = new ResizeObserver(() => {
      lastP = -1;
    });
    ro.observe(root);

    const text: Record<string, string> = {};
    const write = (el: HTMLElement | null, key: string, value: string) => {
      if (!el || text[key] === value) return;
      text[key] = value;
      el.textContent = value;
    };
    let lastIcons = -1;
    let lastP = -1;

    off = onFrame((time) => {
      const {p, rect, vh} = pinProgress(root);
      if (rect.bottom < 0 || rect.top > vh) return;

      const tr = turn.current;
      if (!tr.down) {
        tr.lon += tr.vel;
        tr.vel *= 0.92;
      }
      const still = (reducedRef.current || !ready) && !tr.down && Math.abs(tr.vel) < 1e-4;
      if (still && Math.abs(p - lastP) < 0.00005) return;
      lastP = p;

      // The month: the Sun swings round as the Moon goes from waxing gibbous to waning gibbous.
      const E = E_FROM + (E_TO - E_FROM) * range(p, ...WINDOW);

      // Readouts from the same angle (these run in the photo fallback too).
      const day = (E / (2 * Math.PI)) * SYNODIC_DAYS;
      const moonLit = (1 - Math.cos(E)) / 2;
      const waxing = E < Math.PI;
      const km = orbitDistance(day + PERIGEE_OFFSET_DAYS);
      write(dayRef.current, 'day', day.toFixed(1));
      const mi = phaseIndex(day);
      write(moonNameRef.current, 'moon', `${phases[mi]}, ${Math.round(moonLit * 100)}%`);
      write(earthNameRef.current, 'earth', `${phases[(mi + 4) % 8]}, ${Math.round((1 - moonLit) * 100)}%`);
      write(kmRef.current, 'km', Math.round(km).toLocaleString('en-US'));
      write(delayRef.current, 'delay', lightSeconds(km).toFixed(2));
      const iconKey = Math.round(moonLit * 200) * (waxing ? 1 : -1);
      if (iconKey !== lastIcons) {
        lastIcons = iconKey;
        moonIconRef.current?.setAttribute('d', phasePath(12, 12, 11, moonLit, waxing));
        earthIconRef.current?.setAttribute('d', phasePath(12, 12, 11, 1 - moonLit, !waxing));
      }
      if (!ready || !scene) return;

      // Size the drawing buffer for the screen, within a pixel budget.
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(MAX_PIXELS / Math.max(1, W * H)));
      const bw = Math.round(W * scale);
      const bh = Math.round(H * scale);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }

      // Geometry, in drawing-buffer pixels (y down).
      const mobile = W < 768;
      const r = (mobile ? Math.min(W * 0.46, H * 0.3) : Math.min(H * 0.42, W * 0.3)) * scale;
      const ex = (mobile ? W * 0.62 : W * 0.66) * scale;
      const ey = (mobile ? H * 0.6 : H * 0.6) * scale;
      const mr = r * (mobile ? 0.15 : 0.12);
      const mx = (mobile ? W * 0.18 : W * 0.88) * scale;
      const my = (mobile ? H * 0.42 : H * 0.2) * scale;

      const sx = -Math.sin(E);
      const sz = Math.cos(E);
      const l = Math.hypot(sx, SUN_LIFT, sz);
      const sun = [sx / l, SUN_LIFT / l, sz / l];
      const F = r * 1.7;
      const beyond = -sun[2];
      const sunOn = Math.min(1, Math.max(0, (beyond - 0.02) / 0.15));
      const spx = beyond > 0.02 ? ex + (sun[0] / beyond) * F : -1e5;
      const spy = beyond > 0.02 ? ey - (sun[1] / beyond) * F : -1e5;

      const spin = reducedRef.current ? 0 : (time / 1000) * SPIN;
      const {gl, u, draw} = scene;
      gl.uniform2f(u('uRes'), bw, bh);
      // Cover-fit the star map (1920×1080, or 1080×1440 on phones).
      const aspect = bw / bh;
      const starAspect = starsPortrait ? 0.75 : 16 / 9;
      gl.uniform2f(u('uStarFit'), aspect > starAspect ? 1 : aspect / starAspect, aspect > starAspect ? starAspect / aspect : 1);
      gl.uniform3f(u('uEarth'), ex, ey, r);
      gl.uniform3f(u('uMoon'), mx, my, mr);
      gl.uniform3f(u('uSun'), sun[0], sun[1], sun[2]);
      gl.uniform2f(u('uSunPx'), spx, spy);
      gl.uniform1f(u('uSunOn'), sunOn);
      gl.uniform1f(u('uEarthLon'), EARTH_LON0 - spin + tr.lon);
      gl.uniform1f(u('uEarthLat'), EARTH_LAT);
      gl.uniform1f(u('uCloudLon'), spin * 0.08);
      gl.uniform1f(u('uMoonLon'), (-55 * Math.PI) / 180);
      draw();
    });

    return () => {
      io.disconnect();
      ro.disconnect();
      off?.();
      scene?.dispose();
    };
  }, []);

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const tr = turn.current;
    tr.down = true;
    tr.lastX = e.clientX;
    tr.vel = 0;
    tr.id = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const tr = turn.current;
    if (!tr.down || e.pointerId !== tr.id) return;
    const d = (e.clientX - tr.lastX) * -0.006;
    tr.lastX = e.clientX;
    tr.lon += d;
    tr.vel = d;
  };
  const onUp = () => {
    turn.current.down = false;
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      turn.current.vel = e.key === 'ArrowLeft' ? 0.05 : -0.05;
    }
  };

  return (
    <section ref={rootRef} id="orbit" aria-labelledby="orbit-title" className="relative bg-void" style={{height: `${SECTION_VH}svh`}}>
      <div className="sticky top-0 h-screen-s overflow-hidden bg-black">
        {fallback ? (
          <img src="/media/legends/artemis2.webp" alt={orbit.fallbackAlt} className="absolute inset-0 size-full object-cover opacity-80" />
        ) : (
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label={orbit.sceneLabel}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={onKey}
            className="absolute inset-0 size-full cursor-grab touch-pan-y select-none active:cursor-grabbing"
          />
        )}
        {/* Keeps the copy legible whatever the Sun is doing behind it. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(5_7_12/0.85),rgb(5_7_12/0.45)_30%,transparent_52%)] max-md:bg-[linear-gradient(180deg,rgb(5_7_12/0.9),rgb(5_7_12/0.35)_38%,transparent_55%,rgb(5_7_12/0.75)_88%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-void/90 to-transparent max-md:hidden" />

        <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between px-4 pt-20 pb-6 sm:px-6 md:px-[6vw] md:pt-28 md:pb-10">
          <div className="max-w-[30rem]">
            <p className="font-mono text-label text-earth uppercase">{orbit.eyebrow}</p>
            <h2 id="orbit-title" className="mt-3 font-display text-[clamp(1.5rem,3.2vw,3rem)] leading-[1.1] text-balance text-white">
              {orbit.heading}
            </h2>
            <p className="mt-4 max-w-[36ch] text-body text-pretty text-regolith/80 max-md:text-[0.875rem] md:mt-6">{orbit.body}</p>
            <p className="mt-4 max-w-[40ch] font-mono text-[0.625rem] leading-relaxed tracking-[0.12em] text-regolith/45 uppercase">{orbit.note}</p>
          </div>

          <div className="flex items-end justify-between gap-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-label text-regolith/60 uppercase md:grid-cols-3 md:whitespace-nowrap xl:flex xl:gap-12">
              <div>
                <dt>{orbit.day}</dt>
                <dd className="mt-1.5 text-[1rem] text-white tabular-nums">
                  <span ref={dayRef}>0.0</span> <span className="text-regolith/50">{orbit.of}</span>
                </dd>
              </div>
              <div>
                <dt>{orbit.moonFromEarth}</dt>
                <dd className="mt-1.5 flex items-center gap-2.5 text-[0.8125rem] leading-snug tracking-normal text-white normal-case">
                  <PhaseIcon pathRef={moonIconRef} label={orbit.moonFromEarth} />
                  <span ref={moonNameRef}>—</span>
                </dd>
              </div>
              <div>
                <dt>{orbit.earthFromBase}</dt>
                <dd className="mt-1.5 flex items-center gap-2.5 text-[0.8125rem] leading-snug tracking-normal text-white normal-case">
                  <PhaseIcon pathRef={earthIconRef} label={orbit.earthFromBase} />
                  <span ref={earthNameRef}>—</span>
                </dd>
              </div>
              <div>
                <dt>{orbit.distance}</dt>
                <dd className="mt-1.5 text-[1rem] text-white tabular-nums">
                  <span ref={kmRef}>—</span> km
                </dd>
              </div>
              <div className="max-md:hidden">
                <dt>{orbit.delay}</dt>
                <dd className="mt-1.5 text-[1rem] text-earth tabular-nums">
                  <span ref={delayRef}>—</span> s
                </dd>
              </div>
            </dl>
            {!fallback && <p className="font-mono text-label text-regolith/60 uppercase max-md:hidden">{orbit.drag}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
