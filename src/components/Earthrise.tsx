import {useEffect, useRef} from 'react';
import {hero} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {clamp, easeOutCubic, lerp, pinProgress, range, smoothstep} from '../lib/math';
import {onFrame} from '../lib/scroll';

/**
 * The Earthrise. Six photographic layers cut from one render, stacked and
 * pinned; one scroll range moves each at its own rate:
 *
 *   0.00 – 0.12  a haze of dust drifts off the lens
 *   0.14 – 0.50  the Earth climbs out from behind the horizon
 *   0.36 – 0.48  EARTHRISE lifts away as the Earth passes behind it
 *   0.28 – 0.60  the crater rim closes in around the view — you're inside
 *                it looking out — and the astronaut and ground rise
 *   0.74 – 1.00  the camera tilts up off the Moon: the ground, the rim and
 *                the Earth fall away below and the painted sky gives way to
 *                the real one (NASA's Deep Star Map, the Milky Way's core),
 *                which is where the page continues
 *
 * On a fine pointer each layer also leans toward the cursor by its depth.
 * That lean lives on a wrapper around each layer, so scroll and pointer
 * never write the same element's transform.
 *
 * The title is already standing when the opener's porthole clears; its
 * letters resolve in CSS, keyed off `html[data-opened]`.
 */

const STAGE_VH = 410;

type LayerName = 'sky' | 'earth' | 'moonscape' | 'frame' | 'astronaut' | 'ground';
const ORDER: LayerName[] = ['sky', 'earth', 'moonscape', 'frame', 'astronaut', 'ground'];

/** How far each layer leans with the pointer, in % of the viewport width. */
const DEPTH: Record<LayerName, number> = {sky: 0.15, earth: 0.35, moonscape: 0.55, frame: 1.1, astronaut: 1.35, ground: 1.6};

/** All layers share one crop, so they stay registered at every viewport. */
const FIT = 'absolute inset-0 size-full object-cover object-[58%_50%] md:object-center';

/** Earth elevation over the horizon at Mare Marginis: libration swings it about −5° to +13°. */
const ELEV = [-1.6, 7.4] as const;

type Mote = {x: number; y: number; r: number; s: number; a: number};

export function Earthrise() {
  const rootRef = useRef<HTMLElement>(null);
  const layerRefs = useRef<Partial<Record<LayerName, HTMLDivElement>>>({});
  const leanRefs = useRef<Partial<Record<LayerName, HTMLDivElement>>>({});
  const veilRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLImageElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLParagraphElement>(null);
  const elevRef = useRef<HTMLSpanElement>(null);
  const mouseRef = useRef({x: -1000, y: -1000, active: false});
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouseRef.current = {x: e.clientX, y: e.clientY, active: e.pointerType === 'mouse'};
    };
    const onLeave = () => {
      mouseRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove, {passive: true});
    document.documentElement.addEventListener('pointerleave', onLeave, {passive: true});
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  // Dust canvas size.
  useEffect(() => {
    const c = dustRef.current!;
    const sync = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = dustRef.current!;
    const ctx = canvas.getContext('2d')!;
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const motes: Mote[] = Array.from({length: 180}, () => ({x: rand(), y: rand(), r: 0.5 + rand() * 2.2, s: 0.3 + rand(), a: 0.25 + rand() * 0.6}));
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const lean = {x: 0, y: 0};
    let lastP = -1;
    let lastTime = 0;

    const set = (name: LayerName, y: number, scale = 1, opacity = 1) => {
      const el = layerRefs.current[name];
      if (!el) return;
      el.style.transform = `translate3d(0, ${y}vh, 0) scale(${scale})`;
      el.style.opacity = String(opacity);
    };

    return onFrame((time) => {
      const dt = lastTime ? Math.min(0.1, (time - lastTime) / 1000) : 1 / 60;
      lastTime = time;
      const root = rootRef.current;
      if (!root) return;
      const {p, rect} = pinProgress(root);
      if (rect.bottom < 0) return;
      const {x: mx, y: my, active} = mouseRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Pointer lean, eased; written to the wrappers only.
      if (finePointer && !reducedRef.current) {
        const tx = active ? (mx / Math.max(1, w)) * 2 - 1 : 0;
        const ty = active ? (my / Math.max(1, h)) * 2 - 1 : 0;
        const nx = lean.x + (tx - lean.x) * 0.06;
        const ny = lean.y + (ty - lean.y) * 0.06;
        if (Math.abs(nx - lean.x) + Math.abs(ny - lean.y) > 0.0004) {
          lean.x = nx;
          lean.y = ny;
          for (const name of ORDER) {
            const el = leanRefs.current[name];
            if (el) el.style.transform = `translate3d(${(-lean.x * DEPTH[name]).toFixed(3)}vw, ${(-lean.y * DEPTH[name] * 0.6).toFixed(3)}vw, 0) scale(1.04)`;
          }
        }
      }

      // Dust drifts every frame while it's visible.
      const clear = range(p, 0, 0.12);
      const veil = 1 - clear;
      // Nothing to see under the opener; don't compete with it for frames.
      const covered = !('opened' in document.documentElement.dataset);
      if (veil > 0.001 && !covered) {
        const dpr = canvas.width / Math.max(1, w);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#e6e2d6';

        // The haze thins around the cursor, as if you'd wiped the visor.
        const veilEl = veilRef.current!;
        const mask = active && !reducedRef.current ? `radial-gradient(circle 240px at ${mx}px ${my}px, rgb(0 0 0 / 0.1) 0%, #000 100%)` : '';
        if (veilEl.style.maskImage !== mask) {
          veilEl.style.maskImage = mask;
          veilEl.style.webkitMaskImage = mask;
        }

        for (const m of motes) {
          if (!reducedRef.current) {
            m.x += 0.006 * m.s * dt;
            m.y -= 0.004 * m.s * dt;
            if (active) {
              const dx = m.x * w - mx;
              const dy = (m.y - p * 0.6) * h - my;
              const dist = Math.hypot(dx, dy);
              if (dist < 220 && dist > 1) {
                const push = (1 - dist / 220) * 0.12 * dt;
                m.x += (dx / dist) * push;
                m.y += (dy / dist) * push;
              }
            }
            m.x = (m.x + 1) % 1;
            m.y = (m.y + 1) % 1;
          }
          ctx.globalAlpha = m.a * veil;
          ctx.beginPath();
          ctx.arc(m.x * w, (m.y - p * 0.6) * h, m.r * (1 + clear * 5), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (Math.abs(p - lastP) < 0.00005) return;
      lastP = p;

      const exit = smoothstep(range(p, 0.74, 1));
      const settle = easeOutCubic(range(p, 0, 0.5));

      // The haze lifts and blows past the lens.
      veilRef.current!.style.opacity = String(veil);
      veilRef.current!.style.transform = `translate3d(0, ${-clear * 18}vh, 0) scale(${1 + clear * 0.3})`;
      canvas.style.opacity = String(veil);

      // Far → near, each faster than the one behind it.
      // The painted sky dissolves in place into the real one behind it (sliding would show its edge).
      set('sky', lerp(0, -6, p), lerp(1.1, 1, settle), 1 - exit);
      // The portrait crop magnifies the layer, so on phones the Earth starts lower to stay hidden.
      const rise = easeOutCubic(range(p, 0.14, 0.5));
      const drop = w < 768 ? 46 : 34;
      // No scale below 1: on portrait tablets the crop cuts the disc, and shrinking would show the cut.
      set('earth', lerp(drop, 0, rise) + exit * 60);
      set('moonscape', lerp(9, 0, settle) + exit * 80);
      const rim = easeOutCubic(range(p, 0.28, 0.58));
      set('frame', exit * 70, lerp(1.6, 1, rim), rim * (1 - range(exit, 0, 0.45)));
      const up = easeOutCubic(range(p, 0.36, 0.62));
      set('astronaut', lerp(28, 0, up) + exit * 105, 1, clamp(up * 2));
      const ground = easeOutCubic(range(p, 0.34, 0.6));
      set('ground', lerp(36, 0, ground) + exit * 115);

      // The real sky behind it all settles as the camera comes up, and its foot darkens into the page below.
      starsRef.current!.style.transform = `translate3d(0, ${lerp(-5, 0, exit).toFixed(3)}vh, 0) scale(${lerp(1.12, 1, exit).toFixed(4)})`;
      fadeRef.current!.style.opacity = String(range(p, 0.86, 1));

      // Title: standing from the first frame, lifts away as the Earth clears the horizon.
      const tOut = range(p, 0.36, 0.48);
      const title = titleRef.current!;
      title.style.opacity = String(1 - tOut);
      title.style.transform = `translate3d(0, ${-p * 10}vh, 0)`;
      title.style.visibility = tOut >= 1 ? 'hidden' : '';

      // Telemetry.
      hudRef.current!.style.opacity = String(range(p, 0.04, 0.12) * (1 - range(p, 0.62, 0.72)));
      const secs = p * 5400;
      clockRef.current!.textContent = `T+ ${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
      const elev = lerp(ELEV[0], ELEV[1], rise);
      elevRef.current!.textContent = `${elev < 0 ? '−' : '+'}${Math.abs(elev).toFixed(1)}°`;
    });
  }, []);

  const layer = (name: LayerName) => (
    <div
      key={name}
      ref={(el) => {
        if (el) leanRefs.current[name] = el;
      }}
      className="absolute inset-0 will-change-transform"
      style={{transform: 'scale(1.04)'}}
    >
      <div
        ref={(el) => {
          if (el) layerRefs.current[name] = el;
        }}
        className="absolute inset-0 will-change-transform"
      >
        <picture>
          <source media="(max-width: 767px)" srcSet={`/layers/m/${name}.webp`} />
          <img src={`/layers/d/${name}.webp`} alt="" aria-hidden="true" className={FIT} decoding="async" fetchPriority={name === 'sky' ? 'high' : 'auto'} />
        </picture>
      </div>
    </div>
  );

  return (
    <section id="top" ref={rootRef} aria-label="Earthrise" className="relative" style={{height: `${STAGE_VH}svh`}}>
      <div className="sticky top-0 h-screen-s overflow-hidden bg-void">
        {/* The real sky (NASA Deep Star Map), hidden behind the painted one until the exit. */}
        <picture>
          <source media="(max-width: 767px)" srcSet="/media/space/stars-m.webp" />
          <img ref={starsRef} src="/media/space/stars-d.webp" alt="" aria-hidden="true" decoding="async" fetchPriority="low" className="absolute inset-0 size-full object-cover will-change-transform" />
        </picture>
        {ORDER.slice(0, 3).map(layer)}

        {/* Title sits between the plains and the crater. */}
        <div ref={titleRef} className="pointer-events-none absolute inset-x-0 top-[24%] text-center md:top-[27%]">
          <h1 className="font-display text-hero text-white [text-shadow:0_4px_40px_rgb(0_0_0/0.5)]" style={{marginRight: '-0.24em'}}>
            <span className="sr-only">{hero.title}</span>
            <span aria-hidden="true">
              {[...hero.title].map((ch, i) => (
                <span key={i} className="hero-letter" style={{'--i': i} as React.CSSProperties}>
                  {ch}
                </span>
              ))}
            </span>
          </h1>
          <p className="hero-letter mt-5 font-mono text-label text-regolith/85 uppercase" style={{'--i': hero.title.length + 2} as React.CSSProperties}>
            {hero.kicker}
          </p>
        </div>

        {ORDER.slice(3).map(layer)}

        {/* Lunar dust haze over the lens. Light, so the view reads through it. */}
        <div
          ref={veilRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-end pb-14 select-none sm:pb-16"
          style={{
            background:
              'linear-gradient(to top, rgb(139 144 155 / 0.34), rgb(139 144 155 / 0.12) 45%, rgb(139 144 155 / 0.04) 70%, transparent), radial-gradient(ellipse at 50% 100%, rgb(242 230 201 / 0.12), transparent 60%)',
          }}
        >
          <p className="flex items-center justify-center gap-2.5 px-4 font-mono text-label tracking-[0.35em] whitespace-nowrap text-white uppercase">
            <span>{hero.prompt}</span>
            <span className="inline-block animate-bounce text-sunlit motion-reduce:animate-none">↓</span>
          </p>
        </div>

        <canvas ref={dustRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 size-full" />

        <div ref={fadeRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-2/5 bg-linear-to-t from-void to-transparent" style={{opacity: 0}} />

        {/* Telemetry HUD. */}
        <div ref={hudRef} aria-hidden="true" className="pointer-events-none absolute inset-4 z-30 font-mono text-[0.625rem] tracking-[0.14em] text-regolith/75 uppercase sm:inset-6 md:text-label" style={{opacity: 0}}>
          <div className="brackets absolute inset-0 text-regolith/40" />
          <div className="absolute top-16 left-3 space-y-1 md:top-20 md:left-4">
            <p ref={clockRef}>T+ 00:00:00</p>
            <p className="text-regolith/50">Mission clock</p>
          </div>
          <div className="absolute top-16 right-3 space-y-1 text-right md:top-20 md:right-4">
            <p>
              Earth elev{' '}
              <span ref={elevRef} className="text-earth tabular-nums">
                −1.6°
              </span>
            </p>
            <p className="text-regolith/50">{hero.elevLabel}</p>
          </div>
          <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4">{hero.site}</div>
          <div className="absolute right-3 bottom-3 flex items-center gap-2 md:right-4 md:bottom-4">
            Scroll <span className="inline-block animate-bounce motion-reduce:animate-none">↓</span>
          </div>
        </div>
      </div>
    </section>
  );
}
