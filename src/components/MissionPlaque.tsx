import {useEffect, useRef, useState} from 'react';
import {missions, plaque} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';

/**
 * A flight plaque, after the Voyager record: black anodised disc, gold rim,
 * grooves. Around the rim the name is engraved in binary, eight ticks a
 * letter (long = 1, dot = 0). In the middle a harmonograph traces the lunar
 * month (27.32 days) against the mission's length, its phases seeded from
 * the name — so every plaque is different and the same name always draws
 * the same one. It can be saved as a PNG, and its two frequencies played as
 * a chord (sound only on request).
 */

const LUNAR_MONTH = 27.32;
const GOLD_DIM = 'rgba(214, 178, 106, 0.16)';

/** A small, stable hash of the name (FNV-1a), for the curve's phases. */
function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function draw(c: HTMLCanvasElement, size: number, name: string, missionName: string) {
  const mission = missions.items.find((m) => m.name === missionName) ?? missions.items[1];
  const label = (name.trim() || plaque.placeholder).toUpperCase().slice(0, 28);
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const S = size;
  const R = S / 2;
  g.clearRect(0, 0, S, S);
  g.save();
  g.translate(R, R);

  // The disc.
  const disc = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R);
  disc.addColorStop(0, '#171a22');
  disc.addColorStop(0.7, '#0a0c12');
  disc.addColorStop(1, '#05070c');
  g.fillStyle = disc;
  g.beginPath();
  g.arc(0, 0, R * 0.985, 0, Math.PI * 2);
  g.fill();

  // Gold rim, lit from the upper left.
  const rim = g.createLinearGradient(-R, -R, R, R);
  rim.addColorStop(0, '#f2e6c9');
  rim.addColorStop(0.35, '#c9a35a');
  rim.addColorStop(0.7, '#7a5a26');
  rim.addColorStop(1, '#d9bd7e');
  g.strokeStyle = rim;
  g.lineWidth = S * 0.012;
  g.beginPath();
  g.arc(0, 0, R * 0.975, 0, Math.PI * 2);
  g.stroke();

  // Grooves.
  g.lineWidth = Math.max(0.5, S * 0.0011);
  for (let r = R * 0.6; r < R * 0.93; r += S * 0.0065) {
    g.strokeStyle = GOLD_DIM;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }

  // The name in binary, around the rim, starting at the top.
  const bits = [...label].flatMap((ch) => ch.charCodeAt(0).toString(2).padStart(8, '0').slice(-8).split(''));
  const n = bits.length;
  bits.forEach((b, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    g.strokeStyle = b === '1' ? '#e8cf93' : 'rgba(232, 207, 147, 0.45)';
    g.lineWidth = S * 0.003;
    g.lineCap = 'round';
    g.beginPath();
    const r0 = R * 0.875;
    const r1 = b === '1' ? R * 0.925 : R * 0.88;
    g.moveTo(cos * r0, sin * r0);
    g.lineTo(cos * r1, sin * r1);
    g.stroke();
  });
  // Letter boundaries: a slightly brighter tick every eighth bit.
  for (let i = 0; i < n; i += 8) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    g.fillStyle = '#f2e6c9';
    g.beginPath();
    g.arc(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85, S * 0.003, 0, Math.PI * 2);
    g.fill();
  }

  // Harmonograph: the lunar month against the mission's days.
  const seed = seedOf(label + mission.name);
  const p1 = ((seed & 0xffff) / 0xffff) * Math.PI * 2;
  const p2 = ((seed >>> 16) / 0xffff) * Math.PI * 2;
  const f1 = 1;
  const f2 = LUNAR_MONTH / mission.days;
  const A = R * 0.5;
  const T = 120;
  g.strokeStyle = 'rgba(232, 207, 147, 0.78)';
  g.lineWidth = Math.max(0.6, S * 0.0014);
  g.beginPath();
  for (let t = 0; t <= T; t += 0.02) {
    const decay = Math.exp(-t * 0.022);
    const x = A * decay * (Math.sin(f1 * t + p1) * 0.82 + Math.sin(f2 * 0.5 * t) * 0.18);
    const y = A * decay * (Math.sin(f2 * t + p2) * 0.82 + Math.cos(f1 * 0.5 * t + p1) * 0.18);
    if (t === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();

  // Earth and Moon, hatched like an engraving (not to scale).
  g.strokeStyle = '#e8cf93';
  g.lineWidth = S * 0.0022;
  const er = R * 0.055;
  g.beginPath();
  g.arc(-R * 0.12, R * 0.66, er, 0, Math.PI * 2);
  g.stroke();
  g.save();
  g.beginPath();
  g.arc(-R * 0.12, R * 0.66, er, 0, Math.PI * 2);
  g.clip();
  for (let y = -er; y < er; y += S * 0.006) {
    g.beginPath();
    g.moveTo(-R * 0.12 - er, R * 0.66 + y);
    g.lineTo(-R * 0.12 + er, R * 0.66 + y);
    g.stroke();
  }
  g.restore();
  g.beginPath();
  g.arc(R * 0.14, R * 0.66, R * 0.02, 0, Math.PI * 2);
  g.fillStyle = '#e8cf93';
  g.fill();
  g.setLineDash([S * 0.004, S * 0.006]);
  g.beginPath();
  g.moveTo(-R * 0.12 + er + S * 0.01, R * 0.66);
  g.lineTo(R * 0.14 - R * 0.02 - S * 0.01, R * 0.66);
  g.stroke();
  g.setLineDash([]);

  // Engraving.
  g.fillStyle = '#f2e6c9';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.round(S * 0.034)}px Michroma, sans-serif`;
  g.fillText(label, 0, -R * 0.7, R * 1.1);
  g.fillStyle = 'rgba(232, 207, 147, 0.75)';
  g.font = `${Math.round(S * 0.02)}px "IBM Plex Mono", monospace`;
  g.fillText(`THEIA  ${mission.name.toUpperCase()}  ${mission.days} DAYS`, 0, -R * 0.61);
  g.fillText(`${LUNAR_MONTH} : ${mission.days}`, 0, R * 0.78);
  g.restore();
}

export function MissionPlaque({name, mission}: {name: string; mission: string}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const render = () => draw(c, Math.round(c.clientWidth * Math.min(window.devicePixelRatio || 1, 2)), name, mission);
    render();
    // Re-engrave once the display face has loaded (canvas text uses it).
    document.fonts?.ready.then(render);
    const ro = new ResizeObserver(render);
    ro.observe(c);
    return () => ro.disconnect();
  }, [name, mission]);

  useEffect(() => () => void audio.current?.close(), []);

  const playChord = () => {
    const m = missions.items.find((x) => x.name === mission) ?? missions.items[1];
    const Ctx = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!Ctx) return;
    audio.current ??= new Ctx();
    const ctx = audio.current;
    void ctx.resume();
    // The two curve frequencies as pitches: a root, and the lunar-month ratio folded into the octave above.
    const root = 196;
    const fold = (f: number) => {
      while (f >= root * 2) f /= 2;
      while (f < root) f *= 2;
      return f;
    };
    const tones = [root, fold(root * (LUNAR_MONTH / m.days)), fold(root * (LUNAR_MONTH / m.days) * 1.5)];
    const t0 = ctx.currentTime;
    const dur = 3.2;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(0.16, t0 + 0.08);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    out.connect(ctx.destination);
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(f, t0);
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.6 : 0.35;
      o.connect(g).connect(out);
      o.start(t0 + i * 0.12);
      o.stop(t0 + dur);
    });
    setPlaying(true);
    window.setTimeout(() => setPlaying(false), dur * 1000);
  };

  const download = () => {
    const c = document.createElement('canvas');
    draw(c, 2048, name, mission);
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `theia-plaque-${(name.trim() || 'crew').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const engraved = name.trim();
  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[24rem] lg:mx-0">
        <span aria-hidden="true" className="absolute -inset-[6%] rounded-full bg-[radial-gradient(circle,rgb(242_230_201/0.12),transparent_68%)]" />
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={plaque.alt(engraved || plaque.placeholder, mission)}
          className={`relative size-full ${reduced ? '' : 'transition-[rotate] duration-[1.4s] ease-out'} ${playing && !reduced ? 'rotate-[24deg]' : ''}`}
        />
      </div>
      <p className="mt-6 max-w-[24rem] text-[0.9375rem] text-pretty text-regolith/75 lg:max-w-[28rem]" aria-live="polite">
        {engraved ? plaque.engraved(engraved.slice(0, 28)) : plaque.empty}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={playChord}
          aria-describedby="plaque-chord"
          className="min-h-11 rounded-[4px] px-5 font-mono text-label text-white uppercase ring-1 ring-white/25 transition-[background-color,color,scale] hover:bg-white hover:text-void active:scale-[0.97] motion-reduce:active:scale-100"
        >
          {playing ? plaque.playing : plaque.play}
        </button>
        <button
          type="button"
          onClick={download}
          className="min-h-11 rounded-[4px] bg-sunlit px-5 font-mono text-label text-void uppercase transition-[background-color,scale] hover:bg-white active:scale-[0.97] motion-reduce:active:scale-100"
        >
          {plaque.download}
        </button>
      </div>
      <p id="plaque-chord" className="mt-3 max-w-[28rem] text-[0.75rem] leading-relaxed text-regolith/45">
        {plaque.chordHint}
      </p>
    </div>
  );
}
