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
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const y = h / 2;
      const ex = 22;
      const mx = w - 14;
      const a = ex + 22;
      const b = mx - 14;

      g.strokeStyle = 'rgba(201,204,211,0.2)';
      g.setLineDash([2, 6]);
      g.beginPath();
      g.moveTo(a, y);
      g.lineTo(b, y);
      g.stroke();
      g.setLineDash([]);

      const earth = g.createRadialGradient(ex - 5, y - 6, 2, ex, y, 16);
      earth.addColorStop(0, '#a8d4ff');
      earth.addColorStop(1, '#1b4f8f');
      g.fillStyle = earth;
      g.beginPath();
      g.arc(ex, y, 16, 0, Math.PI * 2);
      g.fill();
      const moon = g.createRadialGradient(mx - 3, y - 3, 1, mx, y, 9);
      moon.addColorStop(0, '#f1efe8');
      moon.addColorStop(1, '#7d828d');
      g.fillStyle = moon;
      g.beginPath();
      g.arc(mx, y, 9, 0, Math.PI * 2);
      g.fill();

      const photon = (x: number, col: string) => {
        const glow = g.createRadialGradient(x, y, 0, x, y, 16);
        glow.addColorStop(0, `rgba(${col},0.95)`);
        glow.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = glow;
        g.fillRect(x - 16, y - 16, 32, 32);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x, y, 2.2, 0, Math.PI * 2);
        g.fill();
      };
      for (const m of msgsRef.current) {
        const d = m.delay * 1000;
        const up = (now - m.sentAt) / d;
        const down = (now - landedAt(m)) / d;
        if (up >= 0 && up < 1) photon(a + (b - a) * (reduced ? 0.5 : up), '111,182,255');
        if (down >= 0 && down < 1) photon(b - (b - a) * (reduced ? 0.5 : down), '242,230,201');
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

  return (
    <section ref={ref} id="signal" aria-labelledby="signal-title" className="relative bg-void px-4 py-28 sm:px-6 md:px-[6vw] md:py-36">
      <div className="max-w-[44rem]" data-reveal>
        <p className="font-mono text-label text-earth uppercase">{signal.eyebrow}</p>
        <h2 id="signal-title" className="mt-4 font-display text-display text-balance text-white">
          {signal.heading}
        </h2>
        <p className="mt-5 max-w-[40rem] text-body text-pretty text-regolith/70">{signal.body(Math.round(sky.km).toLocaleString('en-US'), sky.seconds.toFixed(2))}</p>
      </div>

      {/* One console: Houston, the link, the crew. */}
      <div className="relative mt-14 overflow-hidden rounded-[16px] bg-void-2/60 shadow-[0_40px_120px_-60px_rgb(111_182_255/0.35)] ring-1 ring-white/10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.62fr)_minmax(0,1fr)]" data-reveal>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.03)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.03)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_50%_40%,black,transparent_75%)]"
        />

        {/* Earth: you. */}
        <div className={station}>
          <p className="flex items-center justify-between font-mono text-label uppercase">
            <span className="flex items-center gap-2.5 text-white">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-earth shadow-[0_0_10px_rgb(111_182_255/0.9)]" />
              {signal.earth}
            </span>
            <span className="text-earth/80">{signal.earthWhere}</span>
          </p>

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
                key={c}
                type="button"
                onClick={() => send(c)}
                className="min-h-9 rounded-full bg-white/[0.03] px-3.5 text-[0.8125rem] text-regolith/85 ring-1 ring-white/12 transition-[background-color,color,box-shadow,scale] duration-200 hover:bg-earth/10 hover:text-white hover:ring-earth/50 focus-visible:ring-earth focus-visible:outline-none active:scale-[0.97] motion-reduce:active:scale-100"
              >
                {c}
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
        <div className="relative flex flex-col justify-center gap-5 border-y border-white/10 bg-black/25 px-5 py-7 lg:border-x lg:border-y-0 lg:px-6">
          <p className="text-center font-mono text-[0.625rem] tracking-[0.18em] text-regolith/45 uppercase">{signal.link}</p>
          <canvas ref={canvasRef} aria-hidden="true" className="block h-16 w-full lg:h-24" />
          <dl className="grid grid-cols-3 divide-x divide-white/10 text-center font-mono text-[0.5625rem] tracking-[0.14em] text-regolith/50 uppercase">
            <div className="px-1">
              <dt>{signal.distance}</dt>
              <dd className="mt-1.5 text-[0.8125rem] tracking-normal text-white tabular-nums">{Math.round(sky.km / 1000)}k km</dd>
            </div>
            <div className="px-1">
              <dt>{signal.oneWay}</dt>
              <dd className="mt-1.5 text-[0.8125rem] tracking-normal text-earth tabular-nums">{sky.seconds.toFixed(2)} s</dd>
            </div>
            <div className="px-1">
              <dt>{signal.roundTrip}</dt>
              <dd className="mt-1.5 text-[0.8125rem] tracking-normal text-white tabular-nums">{(sky.seconds * 2).toFixed(2)} s</dd>
            </div>
          </dl>
        </div>

        {/* The Moon: the crew, who only hear what has arrived. */}
        <div className={station}>
          <p className="flex items-center justify-between font-mono text-label uppercase">
            <span className="flex items-center gap-2.5 text-white">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-sunlit shadow-[0_0_10px_rgb(242_230_201/0.8)]" />
              {signal.moon}
            </span>
            <span className="text-sunlit/80">{signal.moonWhere}</span>
          </p>

          <ol className={transcript} aria-live="polite">
            {msgs.filter((m) => stageOf(m, now) >= 1).length === 0 && (
              <li className="flex h-full min-h-44 flex-col items-center justify-center gap-5 text-[0.875rem] text-regolith/45">
                {/* A receiver, waiting. */}
                <span aria-hidden="true" className="relative grid size-16 place-items-center">
                  <span className="absolute inset-0 rounded-full ring-1 ring-sunlit/10" />
                  <span className="absolute inset-3 rounded-full ring-1 ring-sunlit/20" />
                  <span className="absolute inset-0 animate-ping rounded-full ring-1 ring-sunlit/30 [animation-duration:2.4s] motion-reduce:hidden" />
                  <span className="size-1.5 rounded-full bg-sunlit/80" />
                </span>
                {signal.emptyMoon}
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

          <p className="mt-6 flex min-h-12 items-center border-t border-white/10 pt-4 font-mono text-[0.625rem] tracking-[0.12em] text-regolith/50 uppercase tabular-nums">{signal.lag(sky.seconds.toFixed(2))}</p>
        </div>
      </div>

      <p className="mt-6 max-w-[60ch] text-[0.75rem] leading-relaxed text-regolith/40" data-reveal>
        {signal.note}
      </p>
    </section>
  );
}
