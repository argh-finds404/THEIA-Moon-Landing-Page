import {useEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import {brand, footer, missions, nav, phases} from '../content';
import {useFitText} from '../hooks/useFitText';
import {moonAt, phaseIndex, subLunarPoint} from '../lib/astro';
import {lerp, range} from '../lib/math';
import {onFrame} from '../lib/scroll';
import {Crescent, go} from './Chrome';
import {EarthGlobe} from './EarthGlobe';

const DAY_MS = 86400000;
const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(0)}°${v >= 0 ? pos : neg}`;

/**
 * The footer closes the loop on the hero: the Earth as it looks from the
 * Moon tonight, computed in the browser from today's date, with a slider to
 * try the nights ahead. Below the index, the wordmark is lit like regolith
 * by a low sun — the pointer moves the light; scroll moves it otherwise.
 */
export function Footer() {
  const [now] = useState(() => Date.now());
  const [ahead, setAhead] = useState(0);
  const when = useMemo(() => new Date(now + ahead * DAY_MS), [now, ahead]);
  const sky = moonAt(when);
  const overhead = subLunarPoint(when);
  const earthLit = sky.earthLit;
  const earthName = phases[(phaseIndex(sky.age) + 4) % 8];

  const markRef = useFitText<HTMLSpanElement>();
  const lightRef = useRef<HTMLDivElement>(null);
  const pointerAt = useRef(0);

  // When the pointer isn't steering it, the light crosses the wordmark as the footer scrolls in.
  useEffect(() => {
    let last = '';
    return onFrame((time) => {
      const el = lightRef.current;
      if (!el || time - pointerAt.current < 2500) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      const x = `${lerp(8, 70, range(r.top, vh, vh - r.height * 1.6)).toFixed(1)}%`;
      if (x === last) return;
      last = x;
      el.style.setProperty('--lx', x);
      el.style.setProperty('--ly', '30%');
    });
  }, []);

  const onLight = (e: PointerEvent<HTMLDivElement>) => {
    const el = lightRef.current;
    if (!el) return;
    pointerAt.current = performance.now();
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lx', `${e.clientX - r.left}px`);
    el.style.setProperty('--ly', `${e.clientY - r.top}px`);
  };

  return (
    <footer aria-labelledby="footer-title" className="relative overflow-hidden border-t border-white/10 bg-void">
      <h2 id="footer-title" className="sr-only">
        {brand.name}
      </h2>

      <div className="grid gap-16 px-4 pt-20 sm:px-6 md:px-[6vw] md:pt-28 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-20">
        {/* The Earth from the Moon, tonight. */}
        <section aria-labelledby="tonight-title" className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
          <EarthGlobe date={when} label={footer.globeLabel(Math.round(earthLit * 100), earthName)} className="size-44 shrink-0 md:size-60" />

          <div className="min-w-0">
            <p id="tonight-title" className="font-mono text-label text-earth uppercase">
              {footer.from(ahead)}
            </p>
            <p className="mt-3 font-display text-[clamp(1.5rem,2.8vw,2.5rem)] leading-[1.1] text-white" aria-live="polite">
              {footer.earthIs(Math.round(earthLit * 100))}
            </p>
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 font-mono text-label text-regolith/50 uppercase">
              <div>
                <dt>{footer.phase}</dt>
                <dd className="mt-1 text-[0.8125rem] tracking-normal text-white normal-case">{earthName}</dd>
              </div>
              <div>
                <dt>{footer.distance}</dt>
                <dd className="mt-1 text-[0.8125rem] tracking-normal text-white tabular-nums">{Math.round(sky.km).toLocaleString('en-US')} km</dd>
              </div>
              <div>
                <dt>{footer.light}</dt>
                <dd className="mt-1 text-[0.8125rem] tracking-normal text-earth tabular-nums">{sky.seconds.toFixed(2)} s</dd>
              </div>
              <div>
                <dt>{footer.overhead}</dt>
                <dd className="mt-1 text-[0.8125rem] tracking-normal text-white tabular-nums">
                  {deg(overhead.lat, 'N', 'S')} {deg(overhead.lon, 'E', 'W')}
                </dd>
              </div>
            </dl>

            <label className="mt-7 block max-w-[22rem]">
              <span className="flex justify-between font-mono text-label text-regolith/60 uppercase">
                <span>{footer.scrub}</span>
                <output className="text-sunlit">{footer.daysAhead(ahead)}</output>
              </span>
              <input
                type="range"
                min={0}
                max={29}
                step={1}
                value={ahead}
                onChange={(e) => setAhead(Number(e.target.value))}
                className="mt-3 w-full cursor-pointer accent-sunlit"
              />
            </label>
            <p className="mt-3 max-w-[40ch] text-[0.75rem] leading-relaxed text-regolith/40">
              {footer.approx} {footer.spin}
            </p>
          </div>
        </section>

        {/* Index. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
          <nav aria-label={footer.chapters}>
            <p className="font-mono text-label text-regolith/45 uppercase">{footer.chapters}</p>
            <ul className="mt-4 space-y-2.5">
              {[{label: 'Earthrise', href: '#top'}, ...nav].map((item) => (
                <li key={item.href}>
                  <a href={item.href} onClick={(e) => go(e)} className="text-[0.9375rem] text-regolith/85 transition-colors hover:text-white">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="font-mono text-label text-regolith/45 uppercase">{footer.missions}</p>
            <ul className="mt-4 space-y-2.5">
              {missions.items.map((m) => (
                <li key={m.name}>
                  <a href="#missions" onClick={(e) => go(e)} className="flex items-baseline justify-between gap-3 text-[0.9375rem] text-regolith/85 transition-colors hover:text-white">
                    {m.name}
                    <span className="font-mono text-label text-regolith/40 tabular-nums">{m.days} d</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="font-mono text-label text-regolith/45 uppercase">{footer.contact}</p>
            <a href={`mailto:${brand.email}`} className="mt-4 block text-[0.9375rem] break-all text-white underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-earth">
              {brand.email}
            </a>
            <p className="mt-2 text-[0.875rem] text-regolith/55">{footer.contactBody}</p>
          </div>
        </div>
      </div>

      {/* The wordmark, raked by a low sun. */}
      <div ref={lightRef} onPointerMove={onLight} aria-hidden="true" className="mt-20 overflow-hidden px-4 text-center leading-[0.8] select-none sm:px-6 md:mt-28 md:px-[3vw]">
        <span ref={markRef} className="lit-type inline-block font-display tracking-[0.2em] whitespace-nowrap" style={{marginRight: '-0.2em'}}>
          {brand.wordmark}
        </span>
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between md:px-[6vw]">
        <p className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-regolith/50 md:items-center">
          <Crescent className="mt-0.5 size-4 shrink-0 text-white/70 md:mt-0" />
          <span>
            © {new Date(now).getFullYear()} {brand.wordmark}. {footer.disclaimer}
          </span>
        </p>
        <a href="#top" onClick={(e) => go(e)} className="shrink-0 font-mono text-label text-white/80 uppercase transition-colors hover:text-white">
          {footer.back} ↑
        </a>
      </div>
    </footer>
  );
}
