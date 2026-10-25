import {useEffect, useRef, useState, type FormEvent} from 'react';
import {brand, missions, reserve} from '../content';
import {useReveals} from '../hooks/useReveals';
import {MissionPlaque} from './MissionPlaque';

type Status = 'idle' | 'invalid' | 'sent';

const UNITS = ['Days', 'Hrs', 'Min', 'Sec'];

const remaining = (target: string) => {
  const s = Math.floor(Math.max(0, new Date(target).getTime() - Date.now()) / 1000);
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
};
const timerLabel = ([d, h, m]: number[]) => `${d} days, ${h} hours, ${m} minutes until the next launch window`;

/**
 * Ticks once a second by writing digits straight into the DOM — a state
 * update here would re-render the section every second, mid-scroll.
 */
function useCountdown(target: string) {
  const timerRef = useRef<HTMLDivElement>(null);
  const digitRefs = useRef<HTMLSpanElement[]>([]);
  useEffect(() => {
    const tick = () => {
      const v = remaining(target);
      v.forEach((n, i) => {
        const el = digitRefs.current[i];
        const text = String(n).padStart(2, '0');
        if (el && el.textContent !== text) el.textContent = text;
      });
      timerRef.current?.setAttribute('aria-label', timerLabel(v));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return {timerRef, digitRefs};
}

/**
 * Waitlist, with a keepsake. The plaque on the left is engraved live from
 * the form on the right: type a name and it appears round the rim; pick a
 * mission and the curve redraws. The form hands a drafted message to the
 * visitor's mail app; the launch-window countdown sits under it.
 */
export function Reserve() {
  const ref = useReveals<HTMLElement>();
  const {timerRef, digitRefs} = useCountdown(reserve.window);
  const [initial] = useState(() => remaining(reserve.window));
  const [status, setStatus] = useState<Status>('idle');
  const [name, setName] = useState('');
  const [mission, setMission] = useState('Lander');

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      setStatus('invalid');
      form.reportValidity();
      return;
    }
    const data = new FormData(form);
    const subject = encodeURIComponent(`Manifest: ${String(data.get('mission'))}`);
    const body = encodeURIComponent(`Name: ${String(data.get('name'))}\nEmail: ${String(data.get('email'))}\nMission: ${String(data.get('mission'))}`);
    window.location.href = `mailto:${brand.email}?subject=${subject}&body=${body}`;
    setStatus('sent');
  };

  const field =
    'w-full rounded-[4px] bg-white/[0.04] px-4 py-3.5 text-body text-white ring-1 ring-white/15 outline-none placeholder:text-regolith/40 focus:ring-earth user-invalid:ring-red-400/70';

  return (
    <section ref={ref} id="reserve" aria-labelledby="reserve-title" className="relative overflow-hidden bg-void px-4 pb-28 sm:px-6 md:px-[6vw] md:pb-40">
      {/* A sliver of the Earth rising at the bottom edge — the hero, bookended. */}
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-[62vw] left-1/2 size-[90vw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_50%_30%,rgba(111,182,255,0.35),rgba(111,182,255,0.05)_55%,transparent_70%)]" />

      {/* Phones: heading, form, plaque (so the plaque is right there when you finish typing).
          Desktop: heading and plaque on the left, the form beside them. */}
      <div className="relative grid gap-12 border-t border-white/10 pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-20 lg:gap-y-12 lg:pt-28">
        <div className="lg:col-start-1 lg:row-start-1" data-reveal>
          <p className="font-mono text-label text-earth uppercase">{reserve.eyebrow}</p>
          <h2 id="reserve-title" className="mt-4 font-display text-display text-balance text-white">
            {reserve.heading}
          </h2>
          <p className="mt-5 max-w-[30rem] text-body text-pretty text-regolith/70">{reserve.body}</p>
        </div>

        <div className="max-lg:order-3 lg:col-start-1 lg:row-start-2" data-reveal>
          <MissionPlaque name={name} mission={mission} />
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-2" data-reveal>
          <form noValidate onSubmit={onSubmit} aria-describedby="reserve-status" className="space-y-5">
            <label className="block">
              <span className="mb-1.5 flex items-baseline justify-between gap-3 font-mono text-label text-regolith/60 uppercase">
                Name
                <span className="tracking-normal text-sunlit/80 normal-case">{reserve.nameHint}</span>
              </span>
              <input
                name="name"
                required
                autoComplete="name"
                maxLength={60}
                placeholder="As it should appear on the manifest"
                className={field}
                onInput={(e) => {
                  setStatus('idle');
                  setName(e.currentTarget.value);
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-label text-regolith/60 uppercase">Email</span>
              <input name="email" type="email" required autoComplete="email" placeholder="you@earth.com" className={field} onInput={() => setStatus('idle')} />
            </label>
            <fieldset>
              <legend className="mb-1.5 font-mono text-label text-regolith/60 uppercase">Mission</legend>
              <div className="grid grid-cols-3 gap-2">
                {missions.items.map((m) => (
                  <label key={m.name} className="relative cursor-pointer">
                    <input type="radio" name="mission" value={m.name} checked={mission === m.name} onChange={() => setMission(m.name)} className="peer sr-only" />
                    <span className="block rounded-[6px] px-3 py-3 text-center ring-1 ring-white/15 transition-[background-color,box-shadow] peer-checked:bg-earth/12 peer-checked:ring-earth peer-focus-visible:ring-2 peer-focus-visible:ring-earth hover:ring-white/30">
                      <span className="block font-display text-[0.6875rem] tracking-[0.06em] text-white uppercase sm:text-[0.8125rem] sm:tracking-[0.12em]">{m.name}</span>
                      <span className="mt-1 block font-mono text-[0.6875rem] text-regolith/60 tabular-nums">{m.days} days</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="w-full rounded-[4px] bg-white px-5 py-4 font-mono text-label text-void uppercase transition-[background-color,scale] hover:bg-earth active:scale-[0.99] motion-reduce:active:scale-100">
              Add me to the manifest
            </button>
            <p id="reserve-status" role="status" className="min-h-[1.25rem] text-[0.8125rem] text-regolith/70">
              {status === 'invalid' && 'Name and a valid email, please — the manifest is strict.'}
              {status === 'sent' && `Your mail app should be open with your request drafted. If not: ${brand.email}.`}
            </p>
          </form>

          <div className="mt-10 border-t border-white/10 pt-8">
            <p className="font-mono text-label text-regolith/50 uppercase">{reserve.windowLabel}</p>
            <div ref={timerRef} className="mt-3 flex gap-2 md:gap-3" role="timer" aria-label={timerLabel(initial)}>
              {UNITS.map((label, i) => (
                <div key={label} className="brackets min-w-[4.25rem] px-3 py-3 text-center text-white/25 md:min-w-[5.5rem]">
                  <span
                    ref={(el) => {
                      if (el) digitRefs.current[i] = el;
                    }}
                    className="block font-display text-[1.5rem] text-white tabular-nums md:text-[2.25rem]"
                  >
                    {String(initial[i]).padStart(2, '0')}
                  </span>
                  <span className="mt-1 block font-mono text-[0.625rem] tracking-[0.14em] text-regolith/60 uppercase">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
