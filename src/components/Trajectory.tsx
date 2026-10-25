import {useEffect, useRef, useState} from 'react';
import {trajectory} from '../content';
import {clamp, easeOutCubic, pinProgress, range} from '../lib/math';
import {earthBox} from '../lib/earth';
import {onFrame} from '../lib/scroll';

/**
 * Earth → Moon, drawn as you scroll. The section pins while the four legs of
 * the flight ink themselves one after another, a capsule riding the leg
 * being drawn; the distance flown ticks up to 384,400 km during the
 * coast. The Earth is cut from the hero's own Earth layer.
 */

const SECTION_VH = 380;
const WINDOW = [0.06, 0.92] as const;
const DISTANCE = 384400;

const EARTH = {cx: 230, cy: 320, r: 92};
const MOON = {cx: 985, cy: 300, r: 46};

const LEGS = [
  // Parking orbit: a lap and a bit around the Earth.
  `M${EARTH.cx} ${EARTH.cy - 128} a128 128 0 1 1 -0.1 0 a128 128 0 0 1 106 57`,
  // Trans-lunar coast.
  `M${EARTH.cx + 106} ${EARTH.cy - 71} C 520 40, 820 70, ${MOON.cx - 20} ${MOON.cy - 84}`,
  // Capture into lunar orbit.
  `M${MOON.cx - 20} ${MOON.cy - 84} a86 86 0 1 1 -0.1 0.2 a86 86 0 0 1 20 1`,
  // Descent to the surface.
  `M${MOON.cx} ${MOON.cy - 86} Q ${MOON.cx + 40} ${MOON.cy - 70} ${MOON.cx + 30} ${MOON.cy - 36}`,
];


export function Trajectory() {
  const rootRef = useRef<HTMLElement>(null);
  const legRefs = useRef<SVGPathElement[]>([]);
  const capsuleRef = useRef<SVGGElement>(null);
  const kmRef = useRef<HTMLSpanElement>(null);
  const [leg, setLeg] = useState(0);

  useEffect(() => {
    let lastP = -1;
    let current = 0;
    return onFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const {p, rect, vh} = pinProgress(root);
      if (rect.bottom < 0 || rect.top > vh) return;
      if (Math.abs(p - lastP) < 0.00005) return;
      lastP = p;

      const u = range(p, ...WINDOW) * LEGS.length;
      const s = clamp(Math.floor(u), 0, LEGS.length - 1);
      if (s !== current) {
        current = s;
        setLeg(s);
      }
      legRefs.current.forEach((path, i) => {
        const k = easeOutCubic(clamp(u - i));
        path.style.strokeDashoffset = String(1 - k);
        if (i === s) {
          const pt = path.getPointAtLength(path.getTotalLength() * k);
          capsuleRef.current!.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
        }
      });
      const coast = easeOutCubic(clamp(u - 1));
      kmRef.current!.textContent = Math.round(coast * DISTANCE).toLocaleString('en-US');
    });
  }, []);

  const current = trajectory.legs[leg];
  const earthImg = earthBox(EARTH.cx, EARTH.cy, EARTH.r);

  return (
    <section ref={rootRef} id="trajectory" aria-labelledby="trajectory-title" className="relative bg-void" style={{height: `${SECTION_VH}svh`}}>
      <div className="sticky top-0 flex h-screen-s flex-col overflow-hidden px-4 pt-20 pb-8 sm:px-6 md:px-[6vw] md:pt-24">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-label text-earth uppercase">{trajectory.eyebrow}</p>
            <h2 id="trajectory-title" className="mt-3 max-w-[20ch] font-display text-display text-white">
              {trajectory.heading}
            </h2>
          </div>
          <p className="font-mono text-label text-regolith/60 uppercase" aria-live="off">
            Distance flown <span ref={kmRef} className="text-white tabular-nums">0</span> km
          </p>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center">
          <svg viewBox="0 0 1200 600" className="h-auto max-h-full w-full" role="img" aria-label="The flight path from Earth to the Moon, drawn in four legs.">
            <defs>
              <clipPath id="earth-clip">
                <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r} />
              </clipPath>
              <radialGradient id="moon-shade" cx="35%" cy="35%" r="75%">
                <stop offset="0" stopColor="#e4e6ea" />
                <stop offset="0.7" stopColor="#8b909b" />
                <stop offset="1" stopColor="#2a2e36" />
              </radialGradient>
              <radialGradient id="earth-glow">
                <stop offset="0.8" stopColor="#6fb6ff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#6fb6ff" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Faint star field. */}
            <g fill="#fff">
              {Array.from({length: 70}, (_, i) => (
                <circle key={i} cx={(i * 173) % 1200} cy={(i * 97) % 600} r={i % 7 === 0 ? 1.4 : 0.7} opacity={0.15 + ((i * 37) % 50) / 100} />
              ))}
            </g>

            <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r * 1.18} fill="url(#earth-glow)" />
            <image
              href="/layers/m/earth.webp"
              x={earthImg.x}
              y={earthImg.y}
              width={earthImg.w}
              height={earthImg.h}
              clipPath="url(#earth-clip)"
              preserveAspectRatio="none"
            />
            <circle cx={MOON.cx} cy={MOON.cy} r={MOON.r} fill="url(#moon-shade)" />
            <g fill="#5d626c" opacity="0.6">
              <circle cx={MOON.cx - 14} cy={MOON.cy - 10} r="7" />
              <circle cx={MOON.cx + 12} cy={MOON.cy + 14} r="5" />
              <circle cx={MOON.cx + 18} cy={MOON.cy - 18} r="3.5" />
            </g>

            {/* Ghost of the full route, then the inked legs over it. */}
            {LEGS.map((d, i) => (
              <path key={`g${i}`} d={d} fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="1.5" strokeDasharray="3 6" />
            ))}
            {LEGS.map((d, i) => (
              <path
                key={i}
                ref={(el) => {
                  if (el) legRefs.current[i] = el;
                }}
                d={d}
                pathLength={1}
                fill="none"
                stroke={i === 1 ? '#6fb6ff' : '#f2e6c9'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="1 1"
                strokeDashoffset="1"
              />
            ))}

            <g ref={capsuleRef} transform={`translate(${EARTH.cx} ${EARTH.cy - 128})`}>
              <circle r="11" fill="#6fb6ff" opacity="0.25" />
              <circle r="4.5" fill="#fff" />
            </g>

            <g fontFamily="IBM Plex Mono, monospace" fontSize="13" letterSpacing="2" fill="#8b909b">
              <text x={EARTH.cx} y={EARTH.cy + EARTH.r + 58} textAnchor="middle">
                EARTH
              </text>
              <text x={MOON.cx} y={MOON.cy + MOON.r + 70} textAnchor="middle">
                MOON
              </text>
            </g>
          </svg>
        </div>

        {/* Current leg. */}
        <div className="grid gap-4 border-t border-white/10 pt-5 md:grid-cols-[auto_1fr_auto] md:items-end md:gap-10">
          <p className="font-mono text-label text-earth uppercase">
            {current.day} · Leg {leg + 1}/{trajectory.legs.length}
          </p>
          <div key={leg} className="animate-[leg-in_0.6s_cubic-bezier(0.2,0.7,0.1,1)]" aria-live="polite">
            <h3 className="font-display text-[1.125rem] tracking-[0.08em] text-white uppercase md:text-[1.375rem]">{current.title}</h3>
            <p className="mt-1.5 max-w-[40rem] text-body text-regolith/70">{current.body}</p>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {trajectory.legs.map((_, i) => (
              <span key={i} className={`h-1 w-8 rounded-full transition-colors duration-500 ${i <= leg ? 'bg-earth' : 'bg-white/15'}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
