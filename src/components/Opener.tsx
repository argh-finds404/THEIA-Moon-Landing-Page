import {useEffect, useRef, useState} from 'react';
import {opener, phases} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {phaseIndex, phasePath, SYNODIC_DAYS} from '../lib/astro';
import {onFrame, setScrollLocked} from '../lib/scroll';

/**
 * The opener. While the six hero layers decode, a Moon waxes from new to
 * full — its lit fraction *is* the load progress, and its label is the real
 * phase name for that fraction. At full the disc dissolves into a hole in
 * the curtain of exactly its size, and the hole opens out to the screen
 * edges: the Moon becomes a porthole onto the Earthrise.
 *
 * It waits only for what the first frame shows — sky, Earth, moonscape and
 * the fonts (capped at FONT_WAIT_MS); the crater, astronaut and ground
 * layers don't appear until well into the scroll and keep loading behind.
 *
 * Fallbacks: it never waxes faster than MIN_SWEEP_S (so a warm cache still
 * shows the phases), gives up waiting after GIVE_UP_MS, and any key, click
 * or wheel skips ahead. `index.html` paints the same new-moon disc before
 * React mounts, so the very first frame already matches this one.
 */

const FIRST_FRAME = ['sky', 'earth', 'moonscape'];
const MIN_SWEEP_S = 1.2;
const FONT_WAIT_MS = 2500;
const GIVE_UP_MS = 8000;
const R = 100;

/** A few maria and craters, placed by eye on the near side. */
const MARIA = [
  {cx: -30, cy: -34, rx: 30, ry: 22, rot: -20},
  {cx: 4, cy: -46, rx: 20, ry: 14, rot: 10},
  {cx: 22, cy: -30, rx: 26, ry: 18, rot: -8},
  {cx: 40, cy: -4, rx: 18, ry: 26, rot: 0},
  {cx: -50, cy: 10, rx: 26, ry: 40, rot: 15},
  {cx: -18, cy: 2, rx: 22, ry: 16, rot: 20},
  {cx: 10, cy: 10, rx: 16, ry: 12, rot: 0},
  {cx: -30, cy: 40, rx: 14, ry: 10, rot: 0},
];
const CRATERS = [
  {cx: -18, cy: 62, r: 9},
  {cx: 40, cy: 44, r: 5},
  {cx: -60, cy: -40, r: 4},
  {cx: 62, cy: -42, r: 3.5},
  {cx: 8, cy: 78, r: 3},
];

type Stage = 'loading' | 'opening' | 'gone';

export function Opener() {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [stage, setStage] = useState<Stage>('loading');
  const litRef = useRef<SVGPathElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setScrollLocked(true, 'opener');
    delete document.documentElement.dataset.opened;

    const cut = window.matchMedia('(max-width: 767px)').matches ? 'm' : 'd';
    const total = FIRST_FRAME.length + 1;
    let loaded = 0;
    const tick = () => {
      loaded += 1;
    };
    FIRST_FRAME.forEach((name) => {
      const img = new Image();
      img.src = `/layers/${cut}/${name}.webp`;
      img.decode().then(tick, tick);
    });
    const fontWait = new Promise((resolve) => window.setTimeout(resolve, FONT_WAIT_MS));
    Promise.race([document.fonts?.ready, fontWait]).then(tick, tick);

    let forced = false;
    let hurry = false;
    let shown = 0;
    let last = 0;
    let opened = false;
    let goneTimer = 0;

    const skip = () => {
      forced = true;
      hurry = true;
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    window.addEventListener('wheel', skip, {passive: true});
    window.addEventListener('touchstart', skip, {passive: true});

    const open = () => {
      opened = true;
      setScrollLocked(false, 'opener');
      document.documentElement.dataset.opened = '';
      setStage('opening');
      goneTimer = window.setTimeout(() => setStage('gone'), reducedRef.current ? 700 : 2300);
    };

    // Stop waiting: wax to full now; and if frames aren't running at all
    // (a throttled tab), open anyway a moment later.
    const giveUp = window.setTimeout(() => (forced = true), GIVE_UP_MS);
    const hardStop = window.setTimeout(() => !opened && open(), GIVE_UP_MS + 2000);

    const off = onFrame((time) => {
      if (opened) return;
      const dt = last ? Math.min(0.25, (time - last) / 1000) : 0;
      last = time;
      const target = forced ? 1 : loaded / total;
      const sweep = hurry || reducedRef.current ? 0.3 : MIN_SWEEP_S;
      if (target > shown) {
        // Frame-rate independent: the same pace at 30 fps as at 120.
        const eased = Math.max((target - shown) * (1 - Math.exp(-dt * 7)), dt * 0.3);
        shown = Math.min(target, shown + Math.min(eased, dt / sweep));
      }

      litRef.current?.setAttribute('d', phasePath(0, 0, R, shown, true));
      const age = (Math.acos(1 - 2 * shown) / (2 * Math.PI)) * SYNODIC_DAYS;
      if (nameRef.current) nameRef.current.textContent = phases[shown >= 0.995 ? 4 : phaseIndex(age)];
      if (pctRef.current) pctRef.current.textContent = `${Math.round(shown * 100)}%`;

      if (shown >= 1) open();
    });

    return () => {
      off();
      window.clearTimeout(giveUp);
      window.clearTimeout(hardStop);
      window.clearTimeout(goneTimer);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('wheel', skip);
      window.removeEventListener('touchstart', skip);
      setScrollLocked(false, 'opener');
    };
  }, []);

  if (stage === 'gone') return null;
  const opening = stage === 'opening';

  return (
    <div
      role="status"
      className={`opener fixed inset-0 z-100 select-none ${opening ? 'is-opening pointer-events-none' : ''}`}
    >
      <p className="sr-only">{opener.loading}</p>

      <div aria-hidden="true" className="opener-curtain absolute inset-0 bg-void" />

      {/* The porthole rim rides the edge of the hole as it opens. */}
      <div
        aria-hidden="true"
        className={`opener-ring absolute left-1/2 top-(--moon-y) -translate-x-1/2 -translate-y-1/2 rounded-full border border-sunlit/50 shadow-[0_0_40px_rgb(242_230_201/0.25),inset_0_0_40px_rgb(242_230_201/0.15)] transition-opacity duration-500 motion-reduce:hidden ${
          opening ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <svg
        aria-hidden="true"
        viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
        className={`absolute left-1/2 top-(--moon-y) size-[calc(var(--moon-r)*2)] -translate-x-1/2 -translate-y-1/2 overflow-visible transition-[opacity,filter] duration-700 ease-out ${
          opening ? 'opacity-0 blur-[2px]' : 'opacity-100'
        }`}
      >
        <defs>
          <radialGradient id="opener-regolith" cx="38%" cy="34%" r="80%">
            <stop offset="0" stopColor="#f4f1ea" />
            <stop offset="0.55" stopColor="#c9ccd3" />
            <stop offset="1" stopColor="#7d828d" />
          </radialGradient>
          <radialGradient id="opener-glow">
            <stop offset="0.7" stopColor="#f2e6c9" stopOpacity="0.16" />
            <stop offset="1" stopColor="#f2e6c9" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="opener-mare">
            <stop offset="0" stopColor="#3f434c" stopOpacity="0.6" />
            <stop offset="0.65" stopColor="#3f434c" stopOpacity="0.35" />
            <stop offset="1" stopColor="#3f434c" stopOpacity="0" />
          </radialGradient>
          <clipPath id="opener-lit">
            <path ref={litRef} d={phasePath(0, 0, R, 0)} />
          </clipPath>
        </defs>

        <circle r={R * 1.45} fill="url(#opener-glow)" className="opacity-60" />
        {/* The unlit disc, faintly lit by earthshine. */}
        <circle r={R} fill="#0b0f18" />
        <g opacity="0.06" fill="#c9ccd3">
          {MARIA.map((m, i) => (
            <ellipse key={i} cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry} transform={`rotate(${m.rot} ${m.cx} ${m.cy})`} />
          ))}
        </g>

        <g clipPath="url(#opener-lit)">
          <circle r={R} fill="url(#opener-regolith)" />
          <g fill="url(#opener-mare)">
            {MARIA.map((m, i) => (
              <ellipse key={i} cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry} transform={`rotate(${m.rot} ${m.cx} ${m.cy})`} />
            ))}
          </g>
          <g fill="none" stroke="#5d626c" strokeOpacity="0.35">
            {CRATERS.map((c, i) => (
              <circle key={i} cx={c.cx} cy={c.cy} r={c.r} strokeWidth={c.r / 3} />
            ))}
          </g>
        </g>
        <circle r={R - 0.5} fill="none" stroke="#fff" strokeOpacity="0.1" />
      </svg>

      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-[calc(var(--moon-y)+var(--moon-r)+2.75rem)] flex flex-col items-center gap-4 text-center transition-opacity duration-500 ${
          opening ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <p className="font-display text-[0.9375rem] tracking-[0.5em] text-white" style={{marginRight: '-0.5em'}}>
          THEIA
        </p>
        <p className="flex items-baseline gap-3 font-mono text-label tracking-[0.16em] text-regolith/80 uppercase">
          <span ref={nameRef}>{phases[0]}</span>
          <span ref={pctRef} className="w-[4ch] text-left text-sunlit tabular-nums">
            0%
          </span>
        </p>
        <p className="font-mono text-[0.625rem] tracking-[0.16em] text-regolith/35 uppercase">{opener.skip}</p>
      </div>
    </div>
  );
}
