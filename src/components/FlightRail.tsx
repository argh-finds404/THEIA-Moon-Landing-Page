import {useEffect, useRef} from 'react';
import {clamp} from '../lib/math';
import {onFrame, scrollToHash} from '../lib/scroll';

/**
 * FlightRail — Right-edge interactive visual orbital tracker.
 *
 * Fixed on the right edge (desktop only).
 * Displays:
 *   - Glowing miniature Earth at top
 *   - Cratered Moon disc at bottom
 *   - Curved orbital trajectory arc
 *   - Clickable chapter ticks, one per section
 *   - Glowing spacecraft beacon that rides along the arc in real time driven via onFrame
 */

interface SectionMark {
  id: string;
  label: string;
  code: string;
}

const SECTIONS: SectionMark[] = [
  {id: '#top', label: 'Earthrise', code: '01'},
  {id: '#ignition', label: 'Ignition', code: '02'},
  {id: '#log', label: 'Mission Log', code: '03'},
  {id: '#orbit', label: 'Orbit', code: '04'},
  {id: '#trajectory', label: 'Trajectory', code: '05'},
  {id: '#legends', label: 'Legends', code: '06'},
  {id: '#sites', label: 'Landing sites', code: '07'},
  {id: '#missions', label: 'Missions', code: '08'},
  {id: '#reserve', label: 'Reserve', code: '09'},
];

export function FlightRail() {
  const pathRef = useRef<SVGPathElement>(null);
  const beaconRef = useRef<SVGGElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastY = -1;

    return onFrame(() => {
      const path = pathRef.current;
      const beacon = beaconRef.current;
      if (!path || !beacon) return;

      const currentY = window.scrollY;
      if (Math.abs(currentY - lastY) < 1) return;
      lastY = currentY;

      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? clamp(currentY / docHeight) : 0;

      const totalLen = path.getTotalLength();
      const pt = path.getPointAtLength(totalLen * progress);
      beacon.setAttribute('transform', `translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
    });
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    scrollToHash(id);
  };

  return (
    <aside
      ref={railRef}
      aria-label="Orbital Mission Flight Rail"
      className="fixed right-3 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col items-center justify-between pointer-events-none select-none"
      style={{height: '62vh', width: '32px'}}
    >
      {/* Top: Miniature Glowing Blue Earth */}
      <a
        href="#top"
        onClick={(e) => handleClick(e, '#top')}
        aria-label="Scroll to Earthrise"
        className="group relative pointer-events-auto flex items-center justify-center size-6 rounded-full bg-void-2 border border-earth/50 shadow-[0_0_12px_rgba(111,182,255,0.4)] transition-transform hover:scale-125"
      >
        <span className="size-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#6fb6ff,#0c1626_80%)]" />
        <span className="pointer-events-none absolute right-8 rounded bg-void/90 px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] text-earth uppercase opacity-0 border border-white/10 backdrop-blur transition-opacity group-hover:opacity-100 whitespace-nowrap">
          Earth · Mare
        </span>
      </a>

      {/* Center: Trajectory Arc SVG + Spacecraft Beacon + Section Ticks */}
      <div className="relative flex-1 w-full flex items-center justify-center my-2">
        <svg
          viewBox="0 0 32 380"
          className="size-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="beacon-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6fb6ff" stopOpacity="0.8" />
              <stop offset="40%" stopColor="#6fb6ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#6fb6ff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Curved Orbital Flight Trajectory Path */}
          <path
            ref={pathRef}
            d="M 16 10 Q 28 100, 16 190 T 16 370"
            fill="none"
            stroke="#6fb6ff"
            strokeOpacity="0.25"
            strokeWidth="1.5"
            strokeDasharray="3 4"
          />

          {/* Real-time Spacecraft Beacon (driven via onFrame) */}
          <g ref={beaconRef} transform="translate(16, 10)">
            <circle r="10" fill="url(#beacon-glow)" />
            <circle r="2.8" fill="#ffffff" className="shadow-[0_0_6px_#ffffff]" />
            <circle r="4.5" fill="none" stroke="#6fb6ff" strokeWidth="0.8" opacity="0.8" />
          </g>
        </svg>

        {/* Section Tick Links */}
        <div className="absolute inset-y-0 inset-x-0 flex flex-col justify-between items-center py-2">
          {SECTIONS.map((sec) => (
            <a
              key={sec.id}
              href={sec.id}
              onClick={(e) => handleClick(e, sec.id)}
              aria-label={`Jump to ${sec.label}`}
              className="group pointer-events-auto relative flex items-center justify-center size-3 rounded-full"
            >
              <span className="size-1 rounded-full bg-white/25 transition-all group-hover:size-2 group-hover:bg-earth group-hover:shadow-[0_0_6px_#6fb6ff]" />
              <span className="pointer-events-none absolute right-7 rounded bg-void/90 px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] text-white uppercase opacity-0 border border-white/10 backdrop-blur transition-opacity group-hover:opacity-100 whitespace-nowrap">
                {sec.code} · {sec.label}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Bottom: Cratered Moon Disc */}
      <a
        href="#reserve"
        onClick={(e) => handleClick(e, '#reserve')}
        aria-label="Scroll to Reserve"
        className="group relative pointer-events-auto flex items-center justify-center size-6 rounded-full bg-void-2 border border-white/20 shadow-[0_0_10px_rgba(200,204,211,0.2)] transition-transform hover:scale-125"
      >
        <span className="size-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#e4e6ea,#2a2e36_85%)] relative overflow-hidden">
          {/* Craters */}
          <span className="absolute top-0.5 left-1 size-1 rounded-full bg-black/40" />
          <span className="absolute bottom-1 right-0.5 size-1.5 rounded-full bg-black/35" />
        </span>
        <span className="pointer-events-none absolute right-8 rounded bg-void/90 px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] text-regolith uppercase opacity-0 border border-white/10 backdrop-blur transition-opacity group-hover:opacity-100 whitespace-nowrap">
          Moon · Tranquillitatis
        </span>
      </a>
    </aside>
  );
}
