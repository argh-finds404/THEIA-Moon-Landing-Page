import {useEffect, useRef, useState, type FormEvent} from 'react';
import {signal} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {useReveals} from '../hooks/useReveals';
import {moonAt} from '../lib/astro';
import {onFrame} from '../lib/scroll';

/**
 * Signal. Houston on the left, the crew on the right, the laser link in
 * between. A message you send crosses at the speed of light for tonight's
 * distance; only when it lands does the crew see it, and their answer takes
 * as long again to reach you. Each side shows only what light could have
 * carried to it so far.
 *
 * Photons are drawn from the shared frame loop; React re-renders only when
 * a message crosses a stage (sent → landed → answered), never per frame.
 */

const MAX_TEXT = 80;
const KEEP = 4;

type Msg = {id: number; text: string; reply: string; sentAt: number; delay: number};
const landedAt = (m: Msg) => m.sentAt + m.delay * 1000;
const answeredAt = (m: Msg) => m.sentAt + m.delay * 2000;
const stageOf = (m: Msg, now: number) => (now < landedAt(m) ? 0 : now < answeredAt(m) ? 1 : 2);

function crewReply(text: string) {
  const t = text.trim().toLowerCase();
  if (/^ping\b/.test(t)) return signal.replies.ping;
  if (/\b(good (morning|evening|night)|hello|hi|hey)\b/.test(t)) return signal.replies.greeting;
  if (/\b(view|see|look)\b/.test(t)) return signal.replies.view;
  if (t.endsWith('?')) return signal.replies.question;
  return signal.replies.other;
}

export function Signal() {
  const ref = useReveals<HTMLElement>();
  const reduced = useReducedMotion();
  const [sky] = useState(() => moonAt(new Date()));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [, setTick] = useState(0);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const stages = useRef(new Map<number, number>());
  const nextId = useRef(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const send = (words: string) => {
    const t = words.trim().slice(0, MAX_TEXT);
    if (!t) return;
    const m: Msg = {id: nextId.current++, text: t, reply: crewReply(t), sentAt: performance.now(), delay: moonAt(new Date()).seconds};
    stages.current.set(m.id, 0);
    setMsgs((list) => [m, ...list].slice(0, KEEP));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
    setText('');
  };

  useEffect(() => {
    return onFrame(() => {
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const now = performance.now();

      // Re-render only when something lands.
      let changed = false;
      for (const m of msgsRef.current) {
        const s = stageOf(m, now);
        if (stages.current.get(m.id) !== s) {
          stages.current.set(m.id, s);
          changed = true;
        }
      }
      if (changed) setTick((t) => t + 1);
      if (r.bottom < 0 || r.top > window.innerHeight) return;

      // The link.
      const w = c.clientWidth;
      const h = c.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const y = h / 2;
      const ex = 24;
      const mx = w - 16;
      const a = ex + 20;
      const b = mx - 12;

      // Check active transit states
      let activeUp = false;
      let activeDown = false;
      for (const m of msgsRef.current) {
        const d = m.delay * 1000;
        const up = (now - m.sentAt) / d;
        const down = (now - landedAt(m)) / d;
        if (up >= 0 && up < 1) activeUp = true;
        if (down >= 0 && down < 1) activeDown = true;
      }

      // Deep space baseline and carrier path
      g.strokeStyle = activeUp ? 'rgba(111,182,255,0.45)' : activeDown ? 'rgba(242,230,201,0.45)' : 'rgba(201,204,211,0.22)';
      g.lineWidth = 1;
      g.setLineDash([2, 5]);
      g.beginPath();
      g.moveTo(a, y);
      g.lineTo(b, y);
      g.stroke();
      g.setLineDash([]);

      // Distance milestones along the laser baseline (25%, 50%, 75%)
      for (let f = 0.25; f <= 0.75; f += 0.25) {
        const tickX = a + (b - a) * f;
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.beginPath();
        g.moveTo(tickX, y - 3);
        g.lineTo(tickX, y + 3);
        g.stroke();
      }

      // Earth with atmosphere glow & ground optical terminal
      const earthAtmosphere = g.createRadialGradient(ex, y, 16, ex, y, 26);
      earthAtmosphere.addColorStop(0, 'rgba(111,182,255,0.35)');
      earthAtmosphere.addColorStop(1, 'rgba(111,182,255,0)');
      g.fillStyle = earthAtmosphere;
      g.beginPath();
      g.arc(ex, y, 26, 0, Math.PI * 2);
      g.fill();

      const earth = g.createRadialGradient(ex - 5, y - 6, 2, ex, y, 17);
      earth.addColorStop(0, '#a8d4ff');
      earth.addColorStop(0.6, '#2868b2');
      earth.addColorStop(1, '#0c2447');
      g.fillStyle = earth;
      g.beginPath();
      g.arc(ex, y, 17, 0, Math.PI * 2);
      g.fill();

      // Moon with crater depth & Tranquillity Base terminal
      const moonAtmosphere = g.createRadialGradient(mx, y, 9, mx, y, 16);
      moonAtmosphere.addColorStop(0, 'rgba(242,230,201,0.25)');
      moonAtmosphere.addColorStop(1, 'rgba(242,230,201,0)');
      g.fillStyle = moonAtmosphere;
      g.beginPath();
      g.arc(mx, y, 16, 0, Math.PI * 2);
      g.fill();

      const moon = g.createRadialGradient(mx - 3, y - 3, 1, mx, y, 10);
      moon.addColorStop(0, '#fbf9f4');
      moon.addColorStop(0.7, '#8f949e');
      moon.addColorStop(1, '#343840');
      g.fillStyle = moon;
      g.beginPath();
      g.arc(mx, y, 10, 0, Math.PI * 2);
      g.fill();

      // Draw photon packets, particle tails, and optical wavefronts
      const drawPacket = (px: number, col: string, dir: 1 | -1) => {
        // Laser core beam trail
        const trailLen = Math.min(50, Math.abs(px - (dir === 1 ? a : b)));
        const trailGrad = g.createLinearGradient(px - dir * trailLen, y, px, y);
        trailGrad.addColorStop(0, `rgba(${col},0)`);
        trailGrad.addColorStop(0.7, `rgba(${col},0.3)`);
        trailGrad.addColorStop(1, `rgba(${col},0.9)`);
        g.strokeStyle = trailGrad;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(px - dir * trailLen, y);
        g.lineTo(px, y);
        g.stroke();

        // Expanding optical wavefront arcs
        if (!reduced) {
          for (let w = 1; w <= 3; w++) {
            const arcR = w * 7;
            const arcAlpha = 0.6 - w * 0.18;
            g.strokeStyle = `rgba(${col},${arcAlpha})`;
            g.lineWidth = 1;
            g.beginPath();
            const startAng = dir === 1 ? -Math.PI / 3 : (2 * Math.PI) / 3;
            const endAng = dir === 1 ? Math.PI / 3 : (4 * Math.PI) / 3;
            g.arc(px, y, arcR, startAng, endAng);
            g.stroke();
          }
        }

        // Intense photon burst core
        const glow = g.createRadialGradient(px, y, 0, px, y, 18);
        glow.addColorStop(0, `rgba(${col},1)`);
        glow.addColorStop(0.3, `rgba(${col},0.6)`);
        glow.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = glow;
        g.fillRect(px - 18, y - 18, 36, 36);

        // Diffraction flare
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px - 8, y);
        g.lineTo(px + 8, y);
        g.moveTo(px, y - 8);
        g.lineTo(px, y + 8);
        g.stroke();

        // White-hot center
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(px, y, 2.5, 0, Math.PI * 2);
        g.fill();
      };

      for (const m of msgsRef.current) {
        const d = m.delay * 1000;
        const up = (now - m.sentAt) / d;
        const down = (now - landedAt(m)) / d;
        if (up >= 0 && up < 1) {
          const posX = a + (b - a) * (reduced ? 0.5 : up);
          drawPacket(posX, '111,182,255', 1);
        }
        if (down >= 0 && down < 1) {
          const posX = b - (b - a) * (reduced ? 0.5 : down);
          drawPacket(posX, '242,230,201', -1);
        }
      }
    });
  }, [reduced]);

  const now = performance.now();
  const secs = (ms: number) => (ms / 1000).toFixed(2);
  const station = 'relative flex min-w-0 flex-col p-5 sm:p-7';
  const transcript = 'mt-6 min-h-44 flex-1 space-y-4';
  const stamp = 'font-mono text-[0.625rem] tracking-[0.1em] text-regolith/50 uppercase tabular-nums';
  const sent = 'w-fit max-w-[85%] rounded-[12px] bg-earth/12 px-3.5 py-2 text-[0.9375rem] leading-snug text-white ring-1 ring-earth/30';
  const reply = 'w-fit max-w-[85%] rounded-[12px] bg-sunlit/[0.08] px-3.5 py-2 text-[0.9375rem] leading-snug text-sunlit ring-1 ring-sunlit/25';

  const getActiveStatus = () => {
    for (const m of msgs) {
      const s = stageOf(m, now);
      if (s === 0) {
        const rem = Math.max(0, (landedAt(m) - now) / 1000);
        return {
          inFlight: true,
          isReply: false,
          label: `Uplink Transit · ${rem.toFixed(2)}s to Moon`,
        };
      }
      if (s === 1) {
        const rem = Math.max(0, (answeredAt(m) - now) / 1000);
        return {
          inFlight: true,
          isReply: true,
          label: `Downlink Transit · ${rem.toFixed(2)}s to Earth`,
        };
      }
    }
    return {
      inFlight: false,
      isReply: false,
      label: 'Optical Link Synchronized · Ready',
    };
  };
  const activeStatus = getActiveStatus();

  return (
    <section ref={ref} id="signal" aria-labelledby="signal-title" className="relative bg-void px-4 py-28 sm:px-6 md:px-[6vw] md:py-36">
      <div className="max-w-[44rem]" data-reveal>
        <p className="font-mono text-label text-earth uppercase">{signal.eyebrow}</p>
        <h2 id="signal-title" className="mt-4 font-display text-display text-balance text-white">
          {signal.heading}
        </h2>
        <p className="mt-5 max-w-[40rem] text-body text-pretty text-regolith/70">{signal.body(Math.round(sky.km).toLocaleString('en-US'), sky.seconds.toFixed(2))}</p>
      </div>

      {/* Concept explainer HUD banner */}
      <div className="mt-8 flex flex-col gap-3 rounded-xl border border-white/10 bg-void-2/60 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between" data-reveal>
        <div className="flex items-center gap-2.5">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-earth shadow-[0_0_8px_rgb(111_182_255/0.8)]" />
          <span className="font-mono text-[0.6875rem] tracking-wider text-white uppercase">{signal.conceptBadge}</span>
        </div>
        <p className="text-[0.75rem] leading-relaxed text-regolith/75 sm:max-w-md">{signal.conceptExplanation}</p>
        <span className="shrink-0 font-mono text-[0.6875rem] tracking-wider text-earth uppercase">{signal.carrierSpeed}</span>
      </div>

      {/* One console: Houston, the link, the crew. */}
      <div className="relative mt-10 overflow-hidden rounded-[16px] bg-void-2/60 shadow-[0_40px_120px_-60px_rgb(111_182_255/0.35)] ring-1 ring-white/10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.62fr)_minmax(0,1fr)]" data-reveal>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.03)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.03)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_50%_40%,black,transparent_75%)]"
        />

        {/* Earth: you. */}
        <div className={station}>
          <div className="flex flex-col gap-1 border-b border-white/10 pb-3">
            <p className="flex items-center justify-between font-mono text-label uppercase">
              <span className="flex items-center gap-2.5 text-white">
                <span aria-hidden="true" className="size-2 rounded-full bg-earth shadow-[0_0_10px_rgb(111_182_255/0.9)]" />
                {signal.earth}
              </span>
              <span className="rounded bg-earth/15 px-2 py-0.5 font-mono text-[0.625rem] tracking-widest text-earth uppercase">{signal.earthWhere}</span>
            </p>
            <p className="font-mono text-[0.625rem] tracking-wider text-regolith/50 uppercase">{signal.earthStation}</p>
            <p className="font-mono text-[0.5625rem] tracking-widest text-earth/70 uppercase">{signal.earthTerminal}</p>
          </div>

          <ol className={transcript} aria-live="polite">
            {msgs.length === 0 && <li className="max-w-[30ch] text-[0.875rem] leading-relaxed text-regolith/45">{signal.emptyEarth}</li>}
            {msgs.map((m) => {
              const s = stageOf(m, now);
              return (
                <li key={m.id} className="space-y-1.5">
                  <p className={`ml-auto rounded-br-[4px] ${sent}`}>{m.text}</p>
                  <p className={`text-right ${stamp}`}>
                    {s === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-earth/80">
                        <span aria-hidden="true" className="size-1 animate-pulse rounded-full bg-earth motion-reduce:animate-none" />
                        {signal.inFlight}
                      </span>
                    ) : (
                      signal.delivered(m.delay.toFixed(2))
                    )}
                  </p>
                  {s === 2 && (
                    <>
                      <p className={`rounded-bl-[4px] ${reply}`}>{m.reply}</p>
                      <p className={stamp}>{signal.answered(secs(answeredAt(m) - m.sentAt))}</p>
                    </>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-6 flex flex-wrap gap-2">
            {signal.chips.map((c) => (
              <button
                key={c.text}
                type="button"
                onClick={() => send(c.text)}
                className="group flex min-h-9 items-center gap-2 rounded-full bg-white/[0.03] px-3.5 py-1.5 text-[0.8125rem] text-regolith/85 ring-1 ring-white/12 transition-[background-color,color,box-shadow,scale] duration-200 hover:bg-earth/10 hover:text-white hover:ring-earth/50 focus-visible:ring-earth focus-visible:outline-none active:scale-[0.97] motion-reduce:active:scale-100"
              >
                <span>{c.text}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.625rem] tracking-wider text-regolith/60 uppercase transition-colors group-hover:bg-earth/20 group-hover:text-earth">{c.tag}</span>
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-3 flex gap-1 rounded-[10px] bg-black/30 p-1 ring-1 ring-white/12 transition-[box-shadow] focus-within:ring-earth/70">
            <label htmlFor="signal-text" className="sr-only">
              {signal.label}
            </label>
            <input
              id="signal-text"
              value={text}
              maxLength={MAX_TEXT}
              onChange={(e) => setText(e.target.value)}
              placeholder={signal.placeholder}
              autoComplete="off"
              className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-[0.9375rem] text-white outline-none placeholder:text-regolith/40"
            />
            <button
              type="submit"
              className="min-h-10 rounded-[6px] bg-white px-4 font-mono text-label text-void uppercase transition-[background-color,scale] duration-200 hover:bg-earth focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-earth active:scale-[0.97] motion-reduce:active:scale-100"
            >
              {signal.send}
            </button>
          </form>
        </div>

        {/* The link between them. */}
        <div className="relative flex flex-col justify-between gap-5 border-y border-white/10 bg-black/30 px-5 py-7 lg:border-x lg:border-y-0 lg:px-6">
          <div className="flex items-center justify-between font-mono text-[0.625rem] tracking-[0.18em] text-regolith/65 uppercase">
            <span>{signal.link}</span>
            <span className="text-earth/90">1550 nm IR</span>
          </div>

          <div className="relative my-auto">
            <canvas ref={canvasRef} aria-hidden="true" className="block h-20 w-full lg:h-28" />
            <div className="mt-3 text-center">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[0.625rem] tracking-wider uppercase transition-colors duration-300 ${
                  activeStatus.inFlight
                    ? activeStatus.isReply
                      ? 'bg-sunlit/15 text-sunlit ring-1 ring-sunlit/30'
                      : 'bg-earth/15 text-earth ring-1 ring-earth/30'
                    : 'bg-white/5 text-regolith/60 ring-1 ring-white/10'
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    activeStatus.inFlight
                      ? activeStatus.isReply
                        ? 'animate-ping bg-sunlit'
                        : 'animate-ping bg-earth'
                      : 'bg-emerald-400'
                  }`}
                />
                {activeStatus.label}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-white/10 text-center font-mono text-[0.5625rem] tracking-[0.14em] text-regolith/65 uppercase">
            <div className="px-1">
              <dt>{signal.distance}</dt>
              <dd className="mt-1.5 text-[0.875rem] font-semibold tracking-normal text-white tabular-nums">{Math.round(sky.km / 1000)}k km</dd>
            </div>
            <div className="px-1">
              <dt>{signal.oneWay}</dt>
              <dd className="mt-1.5 text-[0.875rem] font-semibold tracking-normal text-earth tabular-nums">{sky.seconds.toFixed(2)} s</dd>
            </div>
            <div className="px-1">
              <dt>{signal.roundTrip}</dt>
              <dd className="mt-1.5 text-[0.875rem] font-semibold tracking-normal text-white tabular-nums">{(sky.seconds * 2).toFixed(2)} s</dd>
            </div>
          </dl>
        </div>

        {/* The Moon: the crew, who only hear what has arrived. */}
        <div className={station}>
          <div className="flex flex-col gap-1 border-b border-white/10 pb-3">
            <p className="flex items-center justify-between font-mono text-label uppercase">
              <span className="flex items-center gap-2.5 text-white">
                <span aria-hidden="true" className="size-2 rounded-full bg-sunlit shadow-[0_0_10px_rgb(242_230_201/0.8)]" />
                {signal.moon}
              </span>
              <span className="rounded bg-sunlit/15 px-2 py-0.5 font-mono text-[0.625rem] tracking-widest text-sunlit uppercase">{signal.moonWhere}</span>
            </p>
            <p className="font-mono text-[0.625rem] tracking-wider text-regolith/65 uppercase">{signal.moonStation}</p>
            <p className="font-mono text-[0.5625rem] tracking-widest text-sunlit/85 uppercase">{signal.moonTerminal}</p>
          </div>

          <ol className={transcript} aria-live="polite">
            {msgs.filter((m) => stageOf(m, now) >= 1).length === 0 && (
              <li className="flex h-full min-h-48 flex-col items-center justify-center gap-4 text-center">
                {/* A receiver, waiting. */}
                <span aria-hidden="true" className="relative grid size-20 place-items-center">
                  <span className="absolute inset-0 rounded-full ring-1 ring-sunlit/15" />
                  <span className="absolute inset-3 rounded-full ring-1 ring-sunlit/25" />
                  <span className="absolute inset-7 rounded-full ring-1 ring-sunlit/35" />
                  <span className="absolute inset-0 animate-ping rounded-full ring-1 ring-sunlit/30 [animation-duration:2.4s] motion-reduce:hidden" />
                  <span className="size-2 rounded-full bg-sunlit shadow-[0_0_12px_rgb(242_230_201/0.9)]" />
                </span>
                <div className="font-mono">
                  <p className="text-[0.8125rem] font-medium tracking-widest text-sunlit uppercase">{signal.emptyMoon}</p>
                  <p className="mt-1 text-[0.625rem] tracking-wider text-regolith/60 uppercase">0.67°N 23.47°E · Sea of Tranquillity</p>
                  <p className="mt-0.5 text-[0.5625rem] tracking-widest text-regolith/50 uppercase">Optical Carrier Locked · Awaiting Uplink</p>
                </div>
              </li>
            )}
            {msgs
              .filter((m) => stageOf(m, now) >= 1)
              .map((m) => {
                const s = stageOf(m, now);
                return (
                  <li key={m.id} className="space-y-1.5">
                    <p className={`rounded-bl-[4px] ${sent}`}>{m.text}</p>
                    <p className={stamp}>{signal.heard(m.delay.toFixed(2))}</p>
                    <p className={`ml-auto rounded-br-[4px] ${reply}`}>{m.reply}</p>
                    <p className={`text-right ${stamp}`}>{s === 1 ? signal.replyOut : signal.replyIn}</p>
                  </li>
                );
              })}
          </ol>

          <p className="mt-6 flex min-h-12 items-center border-t border-white/10 pt-4 font-mono text-[0.625rem] tracking-[0.12em] text-regolith/65 uppercase tabular-nums">{signal.lag(sky.seconds.toFixed(2))}</p>
        </div>
      </div>

      <p className="mt-6 max-w-[60ch] text-[0.75rem] leading-relaxed text-regolith/60" data-reveal>
        {signal.note}
      </p>
    </section>
  );
}
