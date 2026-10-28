import {useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type SyntheticEvent} from 'react';
import {legends} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {useReveals} from '../hooks/useReveals';
import {onFrame, setScrollLocked} from '../lib/scroll';

/**
 * Legends: the missions that made it, as an endless strip of tall cards.
 *
 * Three pieces of motion, each with a reduced-motion branch that skips it:
 *
 *   Deal. When the strip first comes into view, the visible cards start as
 *   a small deck in its centre. Each wipes open top-to-bottom in turn — a
 *   flip-book that ends on Apollo 8 — while the deck grows, then they deal
 *   out to their places, all landing together, and their labels roll up.
 *
 *   Breathe. The strip is an inertial track (drag, sideways wheel, swipe,
 *   arrows) that loops. Every visible card is scaled by its speed —
 *   1 − |v| × 0.002 — and by the page's scroll speed, then eased back to 1,
 *   so the cards shrink as they're thrown and breathe out as they settle.
 *
 *   Open. The other cards shrink and wipe upward in turn while their labels
 *   drop away; then a copy of the clicked picture grows from its card into
 *   the dossier's frame as the page goes dark, and the dossier writes
 *   itself in. Closing runs it backwards into the card.
 *
 * Continuous motion (track, breathing) runs in the shared frame loop and
 * writes styles; the one-shot sequences use the browser's Web Animations
 * API. Each card keeps one writer per property: the <li> carries the track
 * offset, its wrapper the breathing scale, the deal layer the sequences,
 * and the stage the CSS hover lift.
 */

type Mission = (typeof legends.items)[number];
const ITEMS = legends.items;
const N = ITEMS.length;
const pad = (n: number) => String(n).padStart(2, '0');
const card = (m: Mission) => `/media/legends/${m.id}-card.webp`;
const full = (m: Mission) => `/media/legends/${m.id}.webp`;
const videoOf = (m: Mission) => ('video' in m ? m.video : undefined);
const videoFocus = (m: Mission) => ('videoFocus' in m ? m.videoFocus : undefined);

/**
 * Each card's crop of its full frame, as fractions (scripts/build-legends.mjs
 * prints them): left, top, width, height, and the frame's aspect. From these
 * the full frame can be laid out to match its card exactly — so a single
 * picture can fly from the card into the dossier and back without a seam.
 */
const CROP: Record<string, {l: number; t: number; w: number; h: number; ar: number}> = {
  apollo8: {l: 698 / 3000, t: 300 / 3000, w: 1964 / 3000, h: 2700 / 3000, ar: 1},
  apollo11: {l: 856 / 5189, t: 0, w: 3685 / 5189, h: 1, ar: 5189 / 5067},
  lunokhod1: {l: 385 / 1000, t: 130 / 1000, w: 436 / 1000, h: 600 / 1000, ar: 1},
  apollo15: {l: 436 / 4096, t: 0, w: 2979 / 4096, h: 1, ar: 1},
  apollo17: {l: 13 / 3953, t: 0, w: 2978 / 3953, h: 1, ar: 3953 / 4095},
  change4: {l: 258 / 1100, t: 143 / 1100, w: 584 / 1100, h: 803 / 1100, ar: 1},
  chandrayaan3: {l: 266 / 1100, t: 145 / 1100, w: 584 / 1100, h: 803 / 1100, ar: 1},
  artemis2: {l: 1601 / 5568, t: 0, w: 2700 / 5568, h: 1, ar: 5568 / 3712},
};

/** The object-position that frames the full picture around the card's crop. */
function focusOf(id: string) {
  const c = CROP[id];
  const px = c.w < 1 ? c.l / (1 - c.w) : 0.5;
  const py = c.h < 1 ? c.t / (1 - c.h) : 0.5;
  return {px, py, css: `${(px * 100).toFixed(2)}% ${(py * 100).toFixed(2)}%`};
}

/** The full picture laid out in a w×h box exactly as its card shows it (crop, then IMG_REST zoom). */
function asCard(id: string, bw: number, bh: number): Keyframe {
  const c = CROP[id];
  const dw = bw / c.w;
  const dh = dw / c.ar;
  const s = IMG_REST;
  return {left: `${bw / 2 + (-c.l * dw - bw / 2) * s}px`, top: `${bh / 2 + (-c.t * dh - bh / 2) * s}px`, width: `${dw * s}px`, height: `${dh * s}px`};
}

/** The full picture cover-fitted to a w×h frame, as the dossier shows it. */
function asFrame(id: string, fw: number, fh: number): Keyframe {
  const c = CROP[id];
  const {px, py} = focusOf(id);
  const dw = Math.max(fw, fh * c.ar);
  const dh = dw / c.ar;
  return {left: `${(fw - dw) * px}px`, top: `${(fh - dh) * py}px`, width: `${dw}px`, height: `${dh}px`};
}

const EASE = {
  slow: 'cubic-bezier(0.9, 0, 0.58, 1)',
  reveal: 'cubic-bezier(0.46, 0, 0.09, 1)',
  out: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
};
const IMG_REST = 1.08;
const OPEN = 'inset(0% 0% 0% 0%)';
const SHUT = 'inset(0% 0% 100% 0%)';
const VOID = 'rgb(5 7 12 / 1)';
const CLEAR = 'rgb(5 7 12 / 0)';

/** Seconds. */
const INTRO = {delay: 0.3, grow: 1.3, reveal: [0, 0.6, 1.04, 1.26], revealDur: 1.05, deal: [0, 0.22, 0.4, 0.56], land: 1.35, labelStagger: 0.12};
const ACT = {out: 1, stagger: [0, 0.26, 0.45, 0.6], morph: 1};
const BACK = {fade: 0.25, morph: 0.95};
const BREATH = {follow: 0.06, ease: 0.06, perPx: 0.002, max: 100, page: 0.6};

type Phase = 'closed' | 'in' | 'open' | 'out';
type Clone = {index: number; from: DOMRect; to: DOMRect | null; film: boolean; time: number; dir: 'in' | 'out'};
type Parts = {
  li?: HTMLLIElement;
  wrap?: HTMLDivElement;
  deal?: HTMLDivElement;
  figure?: HTMLSpanElement;
  img?: HTMLImageElement;
  video?: HTMLVideoElement;
  rolls: HTMLSpanElement[];
  prefetched?: boolean;
};

function anim(el: Element | null | undefined, frames: Keyframe[], o: {delay?: number; duration: number; easing?: string; fill?: FillMode}) {
  return el?.animate(frames, {delay: (o.delay ?? 0) * 1000, duration: Math.max(0.01, o.duration) * 1000, easing: o.easing ?? 'linear', fill: o.fill ?? 'both'}) ?? null;
}
const settled = (list: (Animation | null)[]) => Promise.all(list.filter((a): a is Animation => a !== null).map((a) => a.finished));

function Chevron({dir, className = ''}: {dir: 'left' | 'right'; className?: string}) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-4 ${className}`}>
      <path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const roundButton =
  'grid size-11 place-items-center rounded-full text-white ring-1 ring-white/25 transition-[background-color,color,scale] duration-200 hover:bg-white hover:text-void active:scale-95 disabled:pointer-events-none disabled:opacity-30 motion-reduce:active:scale-100';

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function LegendCard({m, parts, onOpen, onFocus}: {m: Mission; parts: Parts; onOpen: () => void; onFocus: () => void}) {
  const reduced = useReducedMotion();
  const video = videoOf(m);
  const roll = (el: HTMLSpanElement | null) => {
    if (el && !parts.rolls.includes(el)) parts.rolls.push(el);
  };

  // Fetch the full frame early, so the picture that flies into the dossier is ready.
  const prefetch = () => {
    if (parts.prefetched) return;
    parts.prefetched = true;
    new Image().src = full(m);
  };
  const play = (e: React.PointerEvent) => {
    prefetch();
    const v = parts.video;
    if (!v || reduced || e.pointerType !== 'mouse') return;
    if (!v.src) v.src = video!;
    v.play()
      .then(() => (v.style.opacity = '1'))
      .catch(() => {});
  };
  const stop = () => {
    const v = parts.video;
    if (!v) return;
    v.style.opacity = '0';
    v.pause();
  };

  const label = (hidden = false) => (
    <span aria-hidden={hidden || undefined} className="flex items-baseline justify-between gap-3 font-mono text-label uppercase">
      <span className="flex items-baseline gap-3 whitespace-nowrap">
        <span className="text-earth tabular-nums">{m.year}</span>
        <span className="font-display text-[0.8125rem] tracking-[0.14em] text-white">{m.name}</span>
      </span>
      <span className="truncate text-regolith/45">{m.agency}</span>
    </span>
  );

  return (
    <li
      ref={(el) => {
        if (el) parts.li = el;
      }}
      onFocus={() => {
        prefetch();
        onFocus();
      }}
      onTouchStart={prefetch}
      className="relative w-[72vw] shrink-0 sm:w-[42vw] md:w-[clamp(15rem,22vw,26rem)]"
    >
      <div
        ref={(el) => {
          if (el) parts.wrap = el;
        }}
      >
        <div
          ref={(el) => {
            if (el) parts.deal = el;
          }}
          className="legend-deal"
        >
          <button
            type="button"
            onClick={onOpen}
            onPointerEnter={play}
            onPointerLeave={stop}
            aria-label={`${m.name}, ${m.year}: ${m.first}. ${legends.open}.`}
            className="legend-stage group block w-full text-left outline-none"
          >
            <span className="mb-3 block overflow-hidden">
              <span ref={roll} className="legend-roll relative block">
                <span className="legend-roll-a block">{label()}</span>
                <span className="legend-roll-b absolute inset-x-0 top-full block">{label(true)}</span>
              </span>
            </span>

            <span
              ref={(el) => {
                if (el) parts.figure = el;
              }}
              className="legend-lift relative block aspect-[8/11] overflow-hidden rounded-[6px] bg-void-2 ring-1 ring-white/10 group-focus-visible:ring-earth"
            >
              <img
                ref={(el) => {
                  if (el) parts.img = el;
                }}
                src={card(m)}
                alt=""
                width={960}
                height={1320}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="legend-img size-full object-cover"
              />
              {video && (
                <video
                  ref={(el) => {
                    if (el) parts.video = el;
                  }}
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-hidden="true"
                  className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-700"
                  style={{objectPosition: videoFocus(m)}}
                />
              )}
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-void/80 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" />
              <span aria-hidden="true" className="brackets absolute inset-3 text-transparent transition-colors duration-300 group-hover:text-white/60 group-focus-visible:text-white/60" />
              {!m.crewed && (
                <span className="absolute top-3 left-3 rounded-[3px] bg-void/75 px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-white uppercase backdrop-blur">
                  {legends.orbital}
                </span>
              )}
              {video && (
                <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-[3px] bg-void/75 px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-white uppercase backdrop-blur">
                  <span className="size-1.5 rounded-full bg-ember" />
                  {legends.film}
                </span>
              )}
              <span aria-hidden="true" className="absolute bottom-4 left-4 flex translate-y-2 items-center gap-2 font-mono text-label text-white uppercase opacity-0 transition-[opacity,translate] duration-500 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                {legends.open}
                <Chevron dir="right" className="size-3.5" />
              </span>
            </span>

            <span className="mt-4 block overflow-hidden">
              <span ref={roll} className="legend-roll block max-w-[26ch] text-[0.9375rem] leading-snug text-regolith/80 transition-colors group-hover:text-white">
                {m.first}
              </span>
            </span>
          </button>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Dossier                                                             */
/* ------------------------------------------------------------------ */

function Dossier({
  index,
  phase,
  mode,
  setMode,
  animateMedia,
  clone,
  mediaVideoRef,
  onGo,
  onRequestClose,
  onCloneDone,
}: {
  index: number | null;
  phase: Phase;
  mode: 'film' | 'photo';
  setMode: (m: 'film' | 'photo') => void;
  animateMedia: boolean;
  clone: Clone | null;
  mediaVideoRef: MutableRefObject<HTMLVideoElement | null>;
  onGo: (i: number) => void;
  onRequestClose: () => void;
  onCloneDone: (dir: 'in' | 'out') => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const mediaRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const cloneRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLImageElement>(null);
  const reduced = useReducedMotion();
  const m = index === null ? null : ITEMS[index];
  const video = m ? videoOf(m) : undefined;
  const cm = clone ? ITEMS[clone.index] : null;

  useLayoutEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (phase === 'closed') {
      if (d.open) d.close();
      return;
    }
    if (!d.open) d.showModal();
    if (phase === 'open') backRef.current?.focus({preventScroll: true});
  }, [phase]);

  // The morph: the clone grows from the card into the media frame (or back).
  useLayoutEffect(() => {
    const el = cloneRef.current;
    const media = mediaRef.current;
    const d = dialogRef.current;
    if (!clone || !el || !media || !d) return;
    const frame = media.getBoundingClientRect();
    const inward = clone.dir === 'in';
    const a = inward ? clone.from : frame;
    const b = inward ? frame : (clone.to ?? clone.from);
    const box = (r: DOMRect, radius: number): Keyframe => ({top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${radius}px`});
    const delay = inward ? ACT.out : BACK.fade;
    const dur = inward ? ACT.morph : BACK.morph;

    const id = ITEMS[clone.index].id;
    const atCard = asCard(id, (inward ? a : b).width, (inward ? a : b).height);
    const atFrame = asFrame(id, (inward ? b : a).width, (inward ? b : a).height);
    const list = [
      anim(el, [box(a, inward ? 6 : 0), box(b, inward ? 0 : 6)], {delay, duration: dur, easing: EASE.reveal}),
      anim(d, [{backgroundColor: inward ? CLEAR : VOID}, {backgroundColor: inward ? VOID : CLEAR}], {delay: inward ? delay : delay + dur * 0.15, duration: dur * 0.8}),
      // Inside it, the picture goes from the card's crop to the frame's fit.
      anim(pictureRef.current, inward ? [atCard, atFrame] : [atFrame, atCard], {delay, duration: dur, easing: EASE.reveal}),
    ];
    if (!inward) {
      list.push(anim(bodyRef.current, [{opacity: 1}, {opacity: 0}], {duration: BACK.fade, fill: 'forwards'}));
      list.push(anim(chromeRef.current, [{opacity: 1}, {opacity: 0}], {duration: BACK.fade, fill: 'forwards'}));
    }

    let live = true;
    settled(list)
      .then(() => live && onCloneDone(clone.dir))
      .catch(() => {});
    return () => {
      live = false;
      list.forEach((x) => x?.cancel());
    };
  }, [clone, onCloneDone]);

  useEffect(() => {
    if (index === null || phase !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('video')) return;
      if (e.key === 'ArrowRight' && index < N - 1) onGo(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onGo(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, phase, onGo]);

  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault();
    if (phase === 'open') onRequestClose();
  };

  const showFilm = Boolean(video) && mode === 'film';
  const next = index !== null && index < N - 1 ? ITEMS[index + 1] : null;
  const state =
    phase === 'in' ? 'is-morphing' : phase === 'out' ? 'is-returning' : phase === 'open' ? `is-open ${animateMedia ? 'fade-in' : ''}` : '';

  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      data-lenis-prevent
      aria-labelledby="dossier-title"
      className={`dossier m-0 h-dvh max-h-none w-full max-w-none overflow-x-hidden overflow-y-auto overscroll-contain border-0 bg-void p-0 text-regolith backdrop:bg-void lg:overflow-hidden ${state}`}
    >
      {/* Top bar first, so Back is the first stop for the keyboard. */}
      <div
        ref={chromeRef}
        className="dossier-chrome pointer-events-none fixed inset-x-0 top-0 z-10 flex items-center justify-between gap-4 p-4 max-lg:bg-linear-to-b max-lg:from-void max-lg:via-void/85 max-lg:to-transparent max-lg:pb-8 sm:p-6"
      >
        <button
          ref={backRef}
          type="button"
          onClick={onRequestClose}
          className="pointer-events-auto flex items-center gap-2.5 rounded-[4px] bg-void/70 px-4 py-2.5 font-mono text-label text-white uppercase ring-1 ring-white/25 backdrop-blur transition-[background-color,color,scale] duration-200 hover:bg-white hover:text-void active:scale-[0.97] motion-reduce:active:scale-100"
        >
          <Chevron dir="left" className="size-3.5" />
          {legends.back}
        </button>
        {index !== null && (
          <div className="pointer-events-auto flex items-center gap-2">
            <button type="button" aria-label={legends.prev} disabled={index === 0} onClick={() => onGo(index - 1)} className={`${roundButton} bg-void/70 backdrop-blur`}>
              <Chevron dir="left" />
            </button>
            <button type="button" aria-label={legends.next} disabled={index === N - 1} onClick={() => onGo(index + 1)} className={`${roundButton} bg-void/70 backdrop-blur`}>
              <Chevron dir="right" />
            </button>
          </div>
        )}
      </div>

      {m && index !== null && (
        <div ref={bodyRef} key={m.id} className="dossier-body grid min-h-full lg:h-full lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
          <figure ref={mediaRef} className="relative h-[56svh] overflow-hidden bg-black lg:h-full">
            {showFilm ? (
              <video
                ref={mediaVideoRef}
                key={video}
                src={video}
                poster={'poster' in m ? m.poster : undefined}
                autoPlay={!reduced}
                controls={reduced}
                muted
                loop
                playsInline
                onLoadedMetadata={(e) => {
                  if (clone?.dir === 'in' && clone.film) e.currentTarget.currentTime = clone.time;
                }}
                className="dossier-media size-full object-cover"
                style={{objectPosition: videoFocus(m)}}
              />
            ) : (
              <img
                src={full(m)}
                alt={`${m.name}: ${m.first}.`}
                decoding="async"
                className="dossier-media size-full object-cover"
                style={{objectPosition: focusOf(m.id).css}}
              />
            )}
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-void/80 to-transparent" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-void/85 to-transparent" />

            <figcaption className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3 sm:inset-x-6 sm:bottom-6">
              <span className="max-w-[46ch] font-mono text-[0.625rem] leading-relaxed tracking-[0.12em] text-regolith/75 uppercase">
                {'orbital' in m ? m.orbital : showFilm && 'filmNote' in m ? m.filmNote : m.where}
              </span>
              {video && (
                <span role="group" aria-label="Media" className="flex rounded-[7px] bg-void/70 p-1 ring-1 ring-white/15 backdrop-blur">
                  {(['film', 'photo'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={mode === k}
                      onClick={() => setMode(k)}
                      className="min-h-10 rounded-[3px] px-3.5 font-mono text-[0.625rem] tracking-[0.14em] text-regolith/70 uppercase transition-[background-color,color] hover:text-white aria-pressed:bg-white aria-pressed:text-void"
                    >
                      {k === 'film' ? legends.film : 'Photo'}
                    </button>
                  ))}
                </span>
              )}
            </figcaption>
          </figure>

          <div className="dossier-copy flex flex-col justify-between px-5 pt-6 pb-8 sm:px-8 lg:overflow-y-auto lg:px-9 lg:pt-14 lg:pb-5 xl:px-11 xl:pt-16 xl:pb-6 2xl:pt-20 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" data-lenis-prevent>
            <div>
              <p className="flex items-baseline justify-between gap-4 font-mono text-label uppercase" style={{'--d': 0} as React.CSSProperties}>
                <span className="text-earth">
                  {m.year} <span className="text-regolith/45">/ {m.agency}</span>
                </span>
                <span className="text-regolith/45 tabular-nums">
                  {pad(index + 1)} / {pad(N)}
                </span>
              </p>
              <h2 id="dossier-title" className="mt-2.5 font-display text-[clamp(1.35rem,2.2vw,2.4rem)] leading-[1.08] tracking-[0.05em] text-balance text-white uppercase" style={{'--d': 1} as React.CSSProperties}>
                {m.name}
              </h2>
              <p className="mt-1.5 text-[clamp(0.9375rem,1.15vw,1.1875rem)] leading-snug text-sunlit" style={{'--d': 2} as React.CSSProperties}>
                {m.first}
              </p>
              <p className="mt-3 max-w-[46ch] text-[0.875rem] leading-relaxed text-regolith/85 xl:text-[0.9375rem]" style={{'--d': 3} as React.CSSProperties}>
                {m.story}
              </p>

              <dl className="mt-3.5 grid gap-2.5 border-t border-white/10 pt-3 sm:grid-cols-[auto_1fr] sm:gap-x-6" style={{'--d': 4} as React.CSSProperties}>
                {[
                  [legends.when, m.when],
                  [m.crewed ? legends.crew : legends.craft, m.who],
                  [legends.where, m.where],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-label text-regolith/45 uppercase sm:pt-0.5">{k}</dt>
                    <dd className="-mt-1.5 text-[0.875rem] text-white sm:mt-0">{v}</dd>
                  </div>
                ))}
              </dl>

              <dl className="mt-3.5 grid gap-3 border-y border-white/10 py-3 sm:grid-cols-3" style={{'--d': 5} as React.CSSProperties}>
                {m.stats.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 sm:flex-col-reverse sm:items-start sm:justify-end">
                    <dt className="font-mono text-[0.625rem] tracking-[0.14em] text-regolith/50 uppercase">{k}</dt>
                    <dd className="font-display text-[clamp(0.9375rem,1.35vw,1.25rem)] leading-tight text-white">{v}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-2.5 text-[0.6875rem] leading-snug text-regolith/50" style={{'--d': 6} as React.CSSProperties}>
                <span className="font-mono tracking-[0.14em] uppercase">{legends.credit}</span> {m.credit}
              </p>
            </div>

            {next && (
              <button
                type="button"
                onClick={() => onGo(index + 1)}
                className="group mt-3.5 flex items-center justify-between gap-4 border-t border-white/10 pt-3 text-left"
                style={{'--d': 7} as React.CSSProperties}
              >
                <span>
                  <span className="block font-mono text-label text-regolith/45 uppercase">
                    {legends.nextUp}, {next.year}
                  </span>
                  <span className="mt-1 block font-display text-[0.9375rem] tracking-[0.12em] text-white uppercase">{next.name}</span>
                </span>
                <span className={roundButton}>
                  <Chevron dir="right" />
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* The picture in flight between the card and the frame. */}
      {clone && cm && (
        <div
          ref={cloneRef}
          aria-hidden="true"
          className="pointer-events-none fixed z-20 overflow-hidden bg-black"
          style={{top: clone.from.top, left: clone.from.left, width: clone.from.width, height: clone.from.height, borderRadius: 6}}
        >
          {clone.film ? (
            <video
              src={videoOf(cm)}
              muted
              autoPlay
              playsInline
              ref={(v) => {
                if (v) v.currentTime = clone.time;
              }}
              className="size-full object-cover"
              style={{objectPosition: videoFocus(cm)}}
            />
          ) : (
            <>
              {/* The card's own image underneath, in case the full frame is still loading. */}
              <img src={card(cm)} alt="" className="absolute inset-0 size-full object-cover" style={{scale: String(IMG_REST)}} />
              <img ref={pictureRef} src={full(cm)} alt="" decoding="sync" className="absolute max-w-none" />
            </>
          )}
        </div>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export function Legends() {
  const ref = useReveals<HTMLElement>();
  const viewRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const mediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const parts = useRef<Parts[]>(ITEMS.map(() => ({rolls: []})));
  const sequence = useRef<Animation[]>([]);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const eng = useRef({
    S: 0,
    C: 0,
    prevC: 0,
    T: 1,
    step: 1,
    cardW: 1,
    total: 1,
    padL: 0,
    W: 0,
    gap: 0,
    visible: Array<boolean>(N).fill(false),
    scale: Array<number>(N).fill(1),
    frozen: false,
    ready: false,
    lastY: 0,
    lastTime: 0,
    lastIdx: -1,
    suppressClick: false,
  });

  const [active, setActive] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('closed');
  const [mode, setMode] = useState<'film' | 'photo'>('photo');
  const [clone, setClone] = useState<Clone | null>(null);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const activeRef = useRef(active);
  activeRef.current = active;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pendingClose = useRef(false);

  /* ---- Track ------------------------------------------------------- */

  const wrapPos = (v: number) => {
    const e = eng.current;
    return ((((v + e.step) % e.total) + e.total) % e.total) - e.step;
  };

  const measure = () => {
    const list = listRef.current;
    const view = viewRef.current;
    const li = parts.current[0].li;
    if (!list || !view || !li) return false;
    const e = eng.current;
    const cs = getComputedStyle(list);
    e.gap = parseFloat(cs.columnGap) || 0;
    e.cardW = li.offsetWidth;
    e.step = e.cardW + e.gap;
    e.total = e.step * N;
    e.padL = parseFloat(cs.paddingLeft) || 0;
    e.W = view.clientWidth;
    return e.step > 1;
  };

  const place = () => {
    const e = eng.current;
    for (let i = 0; i < N; i++) {
      const natural = i * e.step;
      const pos = wrapPos(natural - e.C);
      const li = parts.current[i].li;
      if (li) li.style.transform = `translate3d(${(pos - natural).toFixed(2)}px, 0, 0)`;
      const left = e.padL + pos;
      e.visible[i] = left < e.W + e.gap && left + e.cardW > -e.gap;
    }
  };

  const breathe = () => {
    const e = eng.current;
    for (let i = 0; i < N; i++) {
      const s = e.visible[i] ? e.T : 1;
      if (s === e.scale[i]) continue;
      e.scale[i] = s;
      const w = parts.current[i].wrap;
      if (w) w.style.transform = s === 1 ? '' : `scale(${s.toFixed(4)})`;
    }
  };

  const visibleExcept = (skip: number) => ITEMS.map((_, i) => i).filter((i) => i !== skip && eng.current.visible[i]);

  useLayoutEffect(() => {
    const view = viewRef.current!;
    view.dataset.intro = reducedRef.current ? 'done' : 'pending';
    if (measure()) {
      place();
      eng.current.ready = true;
    }
    const ro = new ResizeObserver(() => {
      if (measure()) {
        place();
        eng.current.ready = true;
      }
    });
    ro.observe(view);
    return () => ro.disconnect();
    // Runs once: the engine reads only refs.
  }, []);

  // The frame: ease the track toward its target, then breathe.
  useEffect(() => {
    return onFrame((time) => {
      const e = eng.current;
      const view = viewRef.current;
      if (!view || !e.ready) return;
      const n = Math.min(4, Math.max(0.25, (e.lastTime ? time - e.lastTime : 16.67) / 16.67));
      e.lastTime = time;
      const y = window.scrollY;
      const dy = (y - e.lastY) / n;
      e.lastY = y;
      const r = view.getBoundingClientRect();
      if (r.bottom < -100 || r.top > window.innerHeight + 100) return;

      if (Math.abs(e.S - e.C) <= 0.01) e.C = e.S;
      else e.C += (e.S - e.C) * (1 - (1 - BREATH.follow) ** n);
      const v = (e.C - e.prevC) / n;
      const moved = e.C !== e.prevC;
      e.prevC = e.C;
      if (moved) place();

      if (reducedRef.current || e.frozen) e.T = 1;
      else {
        const target = 1 - Math.min(BREATH.max, Math.abs(v) + Math.abs(dy) * BREATH.page) * BREATH.perPx;
        e.T += (target - e.T) * (1 - (1 - BREATH.ease) ** n);
        if (target === 1 && Math.abs(1 - e.T) < 1e-4) e.T = 1;
      }
      breathe();

      const idx = ((Math.round(e.C / e.step) % N) + N) % N;
      if (idx !== e.lastIdx) {
        e.lastIdx = idx;
        countRef.current!.textContent = pad(idx + 1);
      }
      if (moved) {
        const k = (((e.C / e.step) % N) + N) % N;
        thumbRef.current!.style.transform = `translate3d(${(k * 100).toFixed(2)}%, 0, 0)`;
      }
    });
  }, []);

  // Input: drag (mouse, pen, touch), sideways wheel, and a drag never clicks.
  useEffect(() => {
    const view = viewRef.current!;
    const e = eng.current;
    let d: {id: number; x: number; y: number; lastX: number; lastT: number; v: number; moved: boolean} | null = null;

    const onWheel = (ev: WheelEvent) => {
      if (e.frozen || Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      e.S += ev.deltaX * 1.2;
    };
    const down = (ev: PointerEvent) => {
      e.suppressClick = false;
      if (e.frozen || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      d = {id: ev.pointerId, x: ev.clientX, y: ev.clientY, lastX: ev.clientX, lastT: ev.timeStamp, v: 0, moved: false};
    };
    const move = (ev: PointerEvent) => {
      if (!d || ev.pointerId !== d.id) return;
      if (!d.moved) {
        const dx = ev.clientX - d.x;
        if (Math.abs(dx) < 5 || Math.abs(dx) < Math.abs(ev.clientY - d.y)) return;
        d.moved = true;
        view.setPointerCapture(ev.pointerId);
      }
      const delta = d.lastX - ev.clientX;
      d.v = delta / Math.max(1, ev.timeStamp - d.lastT);
      d.lastX = ev.clientX;
      d.lastT = ev.timeStamp;
      e.S += delta;
      e.C += delta;
    };
    const up = (ev: PointerEvent) => {
      if (!d || ev.pointerId !== d.id) return;
      if (d.moved) {
        e.S += d.v * 320;
        e.suppressClick = true;
      }
      d = null;
    };
    const click = (ev: MouseEvent) => {
      if (!e.suppressClick) return;
      ev.preventDefault();
      ev.stopPropagation();
      e.suppressClick = false;
    };

    view.addEventListener('wheel', onWheel, {passive: false});
    view.addEventListener('pointerdown', down);
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
    view.addEventListener('click', click, true);
    return () => {
      view.removeEventListener('wheel', onWheel);
      view.removeEventListener('pointerdown', down);
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', up);
      view.removeEventListener('pointercancel', up);
      view.removeEventListener('click', click, true);
    };
  }, []);

  const step = (dir: 1 | -1) => {
    const e = eng.current;
    if (e.frozen) return;
    e.S = (Math.round(e.S / e.step) + dir) * e.step;
  };

  /** Keyboard focus brings an off-screen card into the first slot. */
  const reveal = (i: number) => {
    const e = eng.current;
    const pos = wrapPos(i * e.step - e.C);
    const left = e.padL + pos;
    if (left < 0 || left + e.cardW > e.W) e.S = e.C + pos;
  };

  /* ---- Deal (the loading stage) -------------------------------------- */

  useEffect(() => {
    const view = viewRef.current!;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || view.dataset.intro !== 'pending') return;
        io.disconnect();
        runIntro();
      },
      {threshold: 0.35},
    );
    io.observe(view);
    return () => io.disconnect();
  }, []);

  const runIntro = () => {
    const view = viewRef.current!;
    const e = eng.current;
    if (reducedRef.current || !measure()) {
      view.dataset.intro = 'done';
      return;
    }
    e.frozen = true;
    e.S = e.C = e.prevC = 0;
    place();
    view.style.pointerEvents = 'none';

    const vr = view.getBoundingClientRect();
    const cx = vr.left + vr.width / 2;
    const cy = vr.top + vr.height / 2;
    const deck = ITEMS.map((_, i) => i)
      .filter((i) => e.padL + i * e.step < e.W)
      .slice(0, 4);
    const k = deck.length;
    const mobile = window.innerWidth < 768;
    const grown = INTRO.delay + INTRO.grow;
    const landAt = grown + INTRO.land;
    const list: (Animation | null)[] = [];

    deck.forEach((i, o) => {
      const p = parts.current[i];
      const r = p.deal!.getBoundingClientRect();
      const t = `${(cx - (r.left + r.width / 2)).toFixed(1)}px ${(cy - (r.top + r.height / 2)).toFixed(1)}px`;
      const s0 = String(0.4 - o * 0.001);
      const s1 = String(0.7 - o * 0.001);
      p.li!.style.zIndex = String(k - o + 1);
      const start = grown + (mobile ? [0, 0.15][o] ?? 0.15 : INTRO.deal[o]);
      // The deck grows in the middle of the strip…
      list.push(anim(p.deal, [{translate: t, scale: s0}, {translate: t, scale: s1}], {delay: INTRO.delay, duration: INTRO.grow, easing: EASE.slow}));
      // …each picture wipes in, the last card first so Apollo 8 lands on top…
      list.push(anim(p.deal, [{clipPath: SHUT}, {clipPath: OPEN}], {delay: INTRO.delay + INTRO.reveal[k - 1 - o], duration: INTRO.revealDur, easing: EASE.reveal}));
      list.push(anim(p.img, [{scale: '1.5'}, {scale: '1.2'}], {delay: INTRO.delay, duration: INTRO.grow, easing: EASE.slow}));
      // …then the cards deal out, staggered so they all land together.
      list.push(anim(p.deal, [{translate: t, scale: s1}, {translate: '0px 0px', scale: '1'}], {delay: start, duration: landAt - start, easing: EASE.reveal, fill: 'forwards'}));
      list.push(anim(p.img, [{scale: '1.2'}, {scale: String(IMG_REST)}], {delay: start, duration: landAt - start, easing: EASE.reveal, fill: 'forwards'}));
      p.rolls.forEach((roll) =>
        list.push(anim(roll, [{translate: '0 100%'}, {translate: '0 0'}], {delay: landAt - 0.2 + o * INTRO.labelStagger, duration: 0.8, easing: EASE.out})),
      );
    });
    // The rest wait off to the right and simply appear as the deck lands.
    ITEMS.forEach((_, i) => {
      if (!deck.includes(i)) list.push(anim(parts.current[i].deal, [{opacity: 0}, {opacity: 1}], {delay: landAt - 0.2, duration: 0.3}));
    });
    view.dataset.intro = 'running';

    settled(list)
      .then(() => {
        view.dataset.intro = 'done';
        list.forEach((a) => a?.cancel());
        deck.forEach((i) => (parts.current[i].li!.style.zIndex = ''));
        view.style.pointerEvents = '';
        e.frozen = false;
      })
      .catch(() => {});
  };

  /* ---- Open and close -------------------------------------------------- */

  const cancelSequence = () => {
    sequence.current.forEach((a) => a.cancel());
    sequence.current = [];
  };

  const restoreCards = () => {
    cancelSequence();
    parts.current.forEach((p) => {
      if (p.figure) p.figure.style.visibility = '';
      if (p.deal) p.deal.style.transformOrigin = '';
    });
    eng.current.frozen = false;
  };

  const open = (i: number) => {
    const view = viewRef.current;
    history.pushState({legend: ITEMS[i].id}, '', `#legends/${ITEMS[i].id}`);
    setOpenedAt(i);
    const p = parts.current[i];
    if (reducedRef.current || !p.figure || view?.dataset.intro !== 'done') {
      setMode('photo');
      setActive(i);
      setPhase('open');
      return;
    }
    const e = eng.current;
    e.frozen = true;
    e.S = e.C;
    e.T = 1;
    breathe();

    const v = p.video;
    const film = Boolean(v && v.style.opacity === '1' && !v.paused);
    const from = p.figure.getBoundingClientRect();
    parts.current.forEach((q) => q.video && !q.video.paused && q.video.pause());

    // Act one: everything else steps back and wipes away upward.
    const list: (Animation | null)[] = [];
    visibleExcept(i).forEach((j, o) => {
      const q = parts.current[j];
      const a = Math.min(ACT.stagger[o] ?? ACT.stagger[ACT.stagger.length - 1] + 0.12 * (o - 3), ACT.out - 0.25);
      q.deal!.style.transformOrigin = '50% 40%';
      list.push(anim(q.deal, [{scale: '1'}, {scale: '0.7'}], {duration: ACT.out, easing: EASE.slow, fill: 'forwards'}));
      list.push(anim(q.deal, [{clipPath: OPEN}, {clipPath: SHUT}], {delay: a, duration: ACT.out - a, easing: EASE.slow}));
      list.push(anim(q.img, [{scale: String(IMG_REST)}, {scale: '1.4'}], {duration: ACT.out, easing: EASE.slow, fill: 'forwards'}));
      q.rolls.forEach((r) => list.push(anim(r, [{translate: '0 0'}, {translate: '0 100%'}], {delay: a, duration: ACT.out - a, easing: EASE.slow, fill: 'forwards'})));
    });
    p.rolls.forEach((r) => list.push(anim(r, [{translate: '0 0'}, {translate: '0 100%'}], {duration: ACT.out, easing: EASE.slow, fill: 'forwards'})));
    sequence.current = list.filter((a): a is Animation => a !== null);

    // Act two runs in the dossier: the clone takes the card's place now.
    p.figure.style.visibility = 'hidden';
    setMode(film ? 'film' : 'photo');
    setClone({index: i, from, to: null, film, time: v?.currentTime ?? 0, dir: 'in'});
    setActive(i);
    setPhase('in');
  };

  /** Lay the cards out for the return and give back the card's frame. */
  const prepareReturn = (i: number) => {
    const e = eng.current;
    cancelSequence();
    e.frozen = true;
    e.T = 1;
    measure();
    const pos = wrapPos(i * e.step - e.C);
    const left = e.padL + pos;
    if (left < 0 || left + e.cardW > e.W) e.S = e.C = e.prevC = e.C + pos;
    place();
    breathe();

    const p = parts.current[i];
    p.figure!.style.visibility = 'hidden';
    const start = BACK.fade + 0.1;
    const list: (Animation | null)[] = [];
    visibleExcept(i).forEach((j, o) => {
      const q = parts.current[j];
      const a = ACT.stagger[o] ?? 0.6;
      q.deal!.style.transformOrigin = '50% 40%';
      list.push(anim(q.deal, [{scale: '0.7'}, {scale: '1'}], {delay: start + a * 0.6, duration: BACK.morph, easing: EASE.reveal}));
      list.push(anim(q.deal, [{clipPath: SHUT}, {clipPath: OPEN}], {delay: start + a * 0.6, duration: BACK.morph, easing: EASE.reveal}));
      list.push(anim(q.img, [{scale: '1.4'}, {scale: String(IMG_REST)}], {delay: start + a * 0.6, duration: BACK.morph, easing: EASE.reveal}));
      q.rolls.forEach((r) => list.push(anim(r, [{translate: '0 100%'}, {translate: '0 0'}], {delay: start + 0.3 + a * 0.6, duration: 0.7, easing: EASE.out})));
    });
    p.rolls.forEach((r) => list.push(anim(r, [{translate: '0 100%'}, {translate: '0 0'}], {delay: start + BACK.morph * 0.6, duration: 0.7, easing: EASE.out})));
    sequence.current = list.filter((a): a is Animation => a !== null);
    return p.figure!.getBoundingClientRect();
  };

  const beginClose = () => {
    if (phaseRef.current === 'in') {
      pendingClose.current = true;
      return;
    }
    const i = activeRef.current;
    if (phaseRef.current !== 'open' || i === null) return;
    if (reducedRef.current || viewRef.current?.dataset.intro !== 'done') {
      restoreCards();
      setPhase('closed');
      setActive(null);
      return;
    }
    const to = prepareReturn(i);
    const vid = mediaVideoRef.current;
    const film = modeRef.current === 'film' && Boolean(videoOf(ITEMS[i]));
    setClone({index: i, from: to, to, film, time: film && vid ? vid.currentTime : 0, dir: 'out'});
    setPhase('out');
  };

  const onCloneDone = (dir: 'in' | 'out') => {
    setClone(null);
    if (dir === 'in') {
      setPhase('open');
      return;
    }
    restoreCards();
    setPhase('closed');
    setActive(null);
  };
  const onCloneDoneRef = useRef(onCloneDone);
  onCloneDoneRef.current = onCloneDone;
  const stableCloneDone = useCallback((dir: 'in' | 'out') => onCloneDoneRef.current(dir), []);

  useEffect(() => {
    if (phase === 'open' && pendingClose.current) {
      pendingClose.current = false;
      beginClose();
    }
  }, [phase]);

  // Back, Esc and the browser's back button all come through history.
  const requestClose = () => {
    if ((history.state as {legend?: string} | null)?.legend) history.back();
    else beginClose();
  };
  const go = (i: number) => {
    history.replaceState({legend: ITEMS[i].id}, '', `#legends/${ITEMS[i].id}`);
    setMode('photo');
    setActive(i);
  };

  useEffect(() => {
    const onPop = () => {
      const id = (history.state as {legend?: string} | null)?.legend;
      const i = ITEMS.findIndex((m) => m.id === id);
      if (i < 0) beginClose();
      else if (phaseRef.current === 'closed') {
        setOpenedAt(null);
        setMode('photo');
        setActive(i);
        setPhase('open');
      } else setActive(i);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (phase === 'closed') return;
    setScrollLocked(true, 'legend');
    return () => setScrollLocked(false, 'legend');
  }, [phase]);

  return (
    <section ref={ref} id="legends" aria-labelledby="legends-title" className="relative bg-void py-28 md:py-40">
      <div className="flex flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-end md:justify-between md:px-[6vw]" data-reveal>
        <div>
          <p className="font-mono text-label text-earth uppercase">
            {legends.eyebrow} <span className="text-regolith/45">/ {ITEMS[0].year}–{ITEMS[N - 1].year}</span>
          </p>
          <h2 id="legends-title" className="mt-4 font-display text-display text-balance text-white">
            {legends.heading}
          </h2>
          <p className="mt-5 max-w-[34rem] text-body text-regolith/70">{legends.body}</p>
        </div>
        <div className="flex items-center gap-5">
          <p className="font-mono text-label text-regolith/50 uppercase tabular-nums" aria-hidden="true">
            <span ref={countRef} className="text-white">
              01
            </span>{' '}
            / {pad(N)}
          </p>
          <div className="flex gap-2">
            <button type="button" aria-label={legends.prev} onClick={() => step(-1)} className={roundButton}>
              <Chevron dir="left" />
            </button>
            <button type="button" aria-label={legends.next} onClick={() => step(1)} className={roundButton}>
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      </div>

      <div ref={viewRef} data-lenis-prevent-horizontal className="legend-view mt-12 touch-pan-y select-none md:mt-16">
        <ol ref={listRef} aria-label={legends.eyebrow} className="flex gap-4 px-4 pt-3 pb-6 sm:px-6 md:gap-6 md:px-[6vw]">
          {ITEMS.map((m, i) => (
            <LegendCard key={m.id} m={m} parts={parts.current[i]} onOpen={() => open(i)} onFocus={() => reveal(i)} />
          ))}
        </ol>
      </div>

      <div className="mt-6 flex flex-col gap-3 px-4 sm:px-6 md:flex-row md:items-center md:justify-between md:px-[6vw]" data-reveal>
        <span aria-hidden="true" className="relative block h-px w-full max-w-[28rem] overflow-hidden bg-white/12">
          <span ref={thumbRef} className="absolute inset-y-0 left-0 bg-earth" style={{width: `${100 / N}%`}} />
        </span>
        <p className="font-mono text-[0.625rem] tracking-[0.14em] text-regolith/40 uppercase">{legends.hint}</p>
      </div>

      <Dossier
        index={active}
        phase={phase}
        mode={mode}
        setMode={setMode}
        animateMedia={openedAt === null || active !== openedAt}
        clone={clone}
        mediaVideoRef={mediaVideoRef}
        onGo={go}
        onRequestClose={requestClose}
        onCloneDone={stableCloneDone}
      />
    </section>
  );
}
