import {useEffect, useRef} from 'react';
import {intro, log} from '../content';
import {clamp, pinProgress, range} from '../lib/math';
import {onFrame} from '../lib/scroll';

/**
 * The mission, as a reel of stills. The section pins and the reel slides
 * sideways with the scroll; the frame nearest the middle is in focus, the
 * rest dim back, and each picture drifts against its frame.
 */

const SECTION_VH = 270;

export function MissionLog() {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const cardRefs = useRef<HTMLLIElement[]>([]);
  const imgRefs = useRef<HTMLImageElement[]>([]);
  const barRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastP = -1;
    return onFrame(() => {
      const root = rootRef.current;
      const track = trackRef.current;
      if (!root || !track) return;
      const {p, rect, vh} = pinProgress(root);
      if (rect.bottom < 0 || rect.top > vh) return;
      if (Math.abs(p - lastP) < 0.00005) return;
      lastP = p;

      const vw = window.innerWidth;
      const k = range(p, 0.02, 0.98);
      const isDesktop = vw >= 768;
      const focusX = vw * (isDesktop ? 0.62 : 0.5);

      const firstCard = cardRefs.current[0];
      const lastCard = cardRefs.current[cardRefs.current.length - 1];
      const travel =
        firstCard && lastCard
          ? lastCard.offsetLeft - firstCard.offsetLeft
          : Math.max(0, track.offsetLeft + track.scrollWidth - vw * 0.94);
      track.style.transform = `translate3d(${-k * travel}px, 0, 0)`;

      // Batch reads first to prevent forced layout thrashing in rAF
      const cardRects = cardRefs.current.map((card) => card?.getBoundingClientRect());

      let nearest = 0;
      let best = Infinity;

      // Write phase
      cardRects.forEach((r, i) => {
        const card = cardRefs.current[i];
        const img = imgRefs.current[i];
        if (!r || !card || !img) return;

        const off = (r.left + r.width / 2 - focusX) / vw;
        const a = clamp(Math.abs(off) * 1.6);
        card.style.opacity = String(1 - a * 0.55);
        card.style.transform = `scale(${1 - a * 0.07})`;
        img.style.transform = `translate3d(${off * -60}px, 0, 0) scale(1.15)`;
        if (Math.abs(off) < best) {
          best = Math.abs(off);
          nearest = i;
        }
      });
      if (barRef.current) barRef.current.style.transform = `scaleX(${k})`;
      if (countRef.current) countRef.current.textContent = `0${nearest + 1}`;
    });
  }, []);

  return (
    <section ref={rootRef} id="log" aria-labelledby="log-title" className="relative bg-void" style={{height: `${SECTION_VH}svh`}}>
      <div className="sticky top-0 flex h-screen-s flex-col justify-start overflow-hidden pt-16 md:flex-row md:items-center md:justify-start md:pt-0">
        <div className="relative z-10 shrink-0 px-4 sm:px-6 md:w-[32vw] md:pl-[6vw] md:pr-10 md:self-stretch md:flex md:flex-col md:justify-center md:bg-void">
          <p className="font-mono text-label text-earth uppercase">{intro.eyebrow}</p>
          <h2 id="log-title" className="mt-4 font-display text-display text-white">
            {intro.heading}
          </h2>
          <p className="mt-5 max-w-[26rem] text-body text-regolith/70 max-md:hidden">{intro.body}</p>
          <div className="mt-8 flex items-center gap-4 font-mono text-label text-regolith/60 uppercase max-md:hidden" aria-hidden="true">
            <span>
              <span ref={countRef} className="text-white">
                01
              </span>{' '}
              / 0{log.length}
            </span>
            <span className="relative h-px w-32 bg-white/15">
              <span ref={barRef} className="absolute inset-0 origin-left bg-earth" style={{transform: 'scaleX(0)'}} />
            </span>
          </div>
        </div>

        <ol ref={trackRef} className="mt-8 flex gap-5 pl-[15vw] will-change-transform sm:pl-[28vw] md:mt-0 md:gap-7 md:pl-[calc(62vw-32vw-clamp(8rem,12vw,11.5rem))]">
          {log.map((entry, i) => (
            <li
              key={entry.title}
              ref={(el) => {
                if (el) cardRefs.current[i] = el;
              }}
              className="w-[70vw] shrink-0 origin-bottom sm:w-[44vw] md:w-[clamp(16rem,24vw,23rem)]"
            >
              <figure>
                <div className="relative aspect-[3/4] overflow-hidden rounded-[6px] bg-void-2">
                  <img
                    ref={(el) => {
                      if (el) imgRefs.current[i] = el;
                    }}
                    src={entry.image}
                    alt={`${entry.title}: ${entry.body}`}
                    width={840}
                    height={1120}
                    loading="eager"
                    decoding="async"
                    className="size-full object-cover will-change-transform"
                  />
                  <span className="absolute top-3 left-3 rounded-[3px] bg-void/70 px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-white uppercase backdrop-blur">
                    {entry.tag}
                  </span>
                </div>
                <figcaption className="mt-4 flex gap-4">
                  <span className="font-mono text-label text-earth">0{i + 1}</span>
                  <span>
                    <span className="block font-display text-[0.9375rem] tracking-[0.08em] text-white uppercase">{entry.title}</span>
                    <span className="mt-1.5 block text-[0.875rem] leading-relaxed text-regolith/65">{entry.body}</span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
