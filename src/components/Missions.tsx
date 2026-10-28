import type {MouseEvent} from 'react';
import {missions} from '../content';
import {useReveals} from '../hooks/useReveals';
import {scrollToHash} from '../lib/scroll';
import {BorderBeam} from './ui/BorderBeam';

const toReserve = (e: MouseEvent<HTMLAnchorElement>, name: string) => {
  e.preventDefault();
  // Choose it in the form, which redraws the plaque too.
  document.querySelector<HTMLInputElement>(`#reserve input[name="mission"][value="${name}"]`)?.click();
  scrollToHash('#reserve');
};

/** Three mission classes. Each card carries its length as a set of orbit rings. */
export function Missions() {
  const ref = useReveals<HTMLElement>();
  return (
    <section ref={ref} id="missions" aria-labelledby="missions-title" className="relative bg-void px-4 py-28 sm:px-6 md:px-[6vw] md:py-40">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between" data-reveal>
        <div>
          <p className="font-mono text-label text-earth uppercase">{missions.eyebrow}</p>
          <h2 id="missions-title" className="mt-4 font-display text-display text-white">
            {missions.heading}
          </h2>
        </div>
        <p className="font-mono text-label text-regolith/50 uppercase">{missions.note}</p>
      </div>

      <ol className="mt-14 grid gap-4 md:mt-20 md:grid-cols-3 md:gap-5">
        {missions.items.map((m, i) => (
          <li
            key={m.name}
            data-reveal
            style={{transitionDelay: `${i * 110}ms`}}
            className={`group relative flex flex-col overflow-hidden rounded-[8px] p-6 ring-1 transition-[transform,box-shadow] duration-500 hover:-translate-y-1.5 md:p-8 ${
              m.featured ? 'bg-void-2 ring-earth/60 hover:shadow-[0_30px_80px_-30px_rgb(111_182_255/0.45)]' : 'bg-void-2/60 ring-white/10 hover:ring-white/25'
            }`}
          >
            {/* Orbit rings — one per week of the mission. */}
            <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute -top-10 -right-10 size-48 text-white/10 transition-transform duration-[1.2s] group-hover:rotate-45">
              {Array.from({length: Math.ceil(m.days / 7)}, (_, k) => (
                <ellipse key={k} cx="100" cy="100" rx={40 + k * 18} ry={18 + k * 8} fill="none" stroke="currentColor" transform={`rotate(${-20 + k * 14} 100 100)`} />
              ))}
              <circle cx="100" cy="100" r="9" fill="currentColor" />
            </svg>

            {m.featured && (
              <BorderBeam
                size={220}
                duration={10}
                colorFrom="#f2e6c9"
                colorTo="#6fb6ff"
                borderWidth={1.5}
              />
            )}
            {m.featured && <span className="self-start rounded-[3px] bg-earth px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-void uppercase">Most requested</span>}
            <h3 className={`font-display text-[1.25rem] tracking-[0.14em] text-white uppercase ${m.featured ? 'mt-5' : ''}`}>{m.name}</h3>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-[3.5rem] leading-none text-white">{m.days}</span>
              <span className="font-mono text-label text-regolith/60 uppercase">days</span>
            </p>
            <ul className="mt-8 space-y-2.5 border-t border-white/10 pt-6">
              {m.lines.map((l) => (
                <li key={l} className="flex gap-3 text-[0.9375rem] text-regolith/80">
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-earth" />
                  {l}
                </li>
              ))}
            </ul>
            <a
              href="#reserve"
              onClick={(e) => toReserve(e, m.name)}
              className={`mt-8 rounded-[4px] px-5 py-3.5 text-center font-mono text-label uppercase transition-colors md:mt-auto ${
                m.featured ? 'bg-earth text-void hover:bg-white' : 'text-white ring-1 ring-white/25 hover:bg-white hover:text-void'
              }`}
            >
              {m.cta}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
