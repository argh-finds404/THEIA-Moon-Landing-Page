import {useEffect, useRef} from 'react';
import {ignition} from '../content';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {clamp, easeOutCubic, lerp, pinProgress, range, smoothstep} from '../lib/math';
import {onFrame} from '../lib/scroll';

/**
 * Ignition. A launch at dusk over the water, scrubbed by scroll:
 *
 *   0.00 – 0.21  T−10 → T−3. Vapour vents off the tanks; the arm swings away.
 *   0.21 – 0.30  Engines light against the clamps; the smoke cloud blooms.
 *   0.30          T−0, liftoff. The camera holds, then locks onto the vehicle.
 *   0.30 – 0.74  The climb: sky darkens to black, stars come out, the
 *                vehicle pitches downrange; max-Q's vapour collar at 0.60.
 *   0.74 – 0.79  Booster shuts down, separates and tumbles away; the upper
 *                stage lights with a wide vacuum plume.
 *   0.80 – 0.97  The curve of the Earth rises into frame.
 *
 * Everything on the canvas — vehicle, plume, every smoke puff — is a pure
 * function of pin progress, so scrubbing back un-billows the smoke. Only
 * the flame flicker, venting and water shimmer tick with time, and those
 * stop under reduced motion. Camera shake lives on a wrapper element.
 */

const SECTION_VH = 340;
const IGNITE = 0.21;
const LIFTOFF = 0.3;
const MAX_Q = [0.58, 0.7] as const;
const MECO = 0.74;
const SEP = 0.76;
const UPPER = 0.79;
const MECO_S = 160;

type Sprite = HTMLCanvasElement;

/** Soft, lumpy smoke puffs, pre-rendered once in three tints. */
function makePuffs() {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const shapes: Sprite[] = [];
  for (let s = 0; s < 3; s++) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 11; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * 26;
      const x = 64 + Math.cos(a) * d;
      const y = 64 + Math.sin(a) * d * 0.8;
      const r = 22 + rand() * 20;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    shapes.push(c);
  }
  const tint = (src: Sprite, color: string) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    return c;
  };
  return {
    cool: shapes.map((s) => tint(s, '#aeb3bd')),
    shade: shapes.map((s) => tint(s, '#1a1f29')),
    warm: shapes.map((s) => tint(s, '#ffb36b')),
  };
}

type Puff = {side: number; birth: number; speed: number; lift: number; size: number; shape: number; front: boolean};

function makeGroundCloud(): Puff[] {
  let seed = 23;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({length: 72}, (_, i) => ({
    side: i % 2 ? 1 : -1,
    birth: IGNITE + Math.pow(rand(), 1.6) * 0.3,
    speed: 0.35 + rand() * 1.1,
    lift: rand(),
    size: 0.14 + rand() * 0.16,
    shape: i % 3,
    front: rand() > 0.55,
  }));
}

/** Where the vehicle is at progress p (px of altitude, px downrange, radians of pitch). */
function flight(p: number, H: number, W: number) {
  const a = range(p, LIFTOFF, 1);
  return {
    alt: Math.pow(a, 2.1) * H * 36,
    x: Math.pow(range(p, 0.42, 1), 2.4) * W * 4,
    pitch: smoothstep(range(p, 0.4, 0.95)) * 0.5,
  };
}

const fmtClock = (p: number) => {
  if (p < LIFTOFF) {
    const s = (1 - p / LIFTOFF) * 10;
    return `T− 00:00:${s.toFixed(1).padStart(4, '0')}`;
  }
  const s = range(p, LIFTOFF, MECO) * MECO_S + range(p, MECO, 1) * 90;
  const m = Math.floor(s / 60);
  return `T+ 00:${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export function Ignition() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLParagraphElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const velRef = useRef<HTMLSpanElement>(null);
  const stageRefs = useRef<HTMLLIElement[]>([]);
  const barRefs = useRef<HTMLSpanElement[]>([]);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const c = canvasRef.current!;
    const sync = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const puffs = makePuffs();
    const cloud = makeGroundCloud();
    let seed = 41;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const stars = Array.from({length: 160}, () => ({x: rand(), y: rand() * 0.9, r: 0.4 + rand() * 1.1, a: 0.3 + rand() * 0.7}));
    let lastStage = -1;
    let lastP = -1;
    let lastSize = 0;

    const puff = (set: Sprite[], i: number, x: number, y: number, s: number, a: number) => {
      if (a <= 0.004) return;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(set[i % set.length], x - s / 2, y - s / 2, s, s);
    };

    return onFrame((time) => {
      const root = rootRef.current;
      if (!root) return;
      const {p, rect, vh} = pinProgress(root);
      if (rect.bottom < 0 || rect.top > vh) return;

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (!W || !H) return;
      // With no flicker to animate, only redraw when scroll (or the size) moves.
      if (reducedRef.current && Math.abs(p - lastP) < 0.00005 && canvas.width * 1e5 + canvas.height === lastSize) return;
      lastP = p;
      lastSize = canvas.width * 1e5 + canvas.height;
      const dpr = canvas.width / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const still = reducedRef.current;
      const t = still ? 0 : time / 1000;
      const flick = (f: number, k: number) => 1 + (still ? 0 : Math.sin(t * f + k) * 0.05 + Math.sin(t * f * 2.3 + k) * 0.03);

      // ---------------------------------------------------------------
      // Geometry and camera
      // ---------------------------------------------------------------
      const mobile = W < 768;
      const L = clamp(H * (mobile ? 0.34 : 0.44), 200, 440); // vehicle length
      const R = L * 0.045; // vehicle radius
      const X0 = W * (mobile ? 0.6 : 0.66); // vehicle screen x
      const padY = H * 0.84; // pad deck
      const mountH = L * 0.05;
      const lockY = H * (mobile ? 0.66 : 0.62); // nozzle height once the camera tracks
      const f = flight(p, H, W);
      const camY = Math.max(0, f.alt - (padY - mountH - lockY));
      const sx = (wx: number) => X0 + wx - f.x;
      const sy = (wy: number) => padY - wy + camY;
      const nozzleX = X0;
      const nozzleY = sy(mountH + f.alt);
      const high = clamp(f.alt / (H * 14)); // 0 at sea level → 1 above the air
      const engine = range(p, IGNITE, IGNITE + 0.04) * (1 - range(p, MECO, MECO + 0.008));
      const upper = range(p, UPPER, UPPER + 0.02);
      const near = 1 - range(f.alt, 0, H * 0.9); // fire still lighting the pad
      const limb = easeOutCubic(range(p, 0.8, 0.97));

      // ---------------------------------------------------------------
      // Sky: dusk, draining to black with altitude
      // ---------------------------------------------------------------
      const horizonY = padY - H * 0.06 + camY * 0.05;
      const sky = ctx.createLinearGradient(0, horizonY - H, 0, horizonY);
      const mix = (a: number[], b: number[]) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], high))).join(',')})`;
      sky.addColorStop(0, mix([7, 14, 30], [5, 7, 12]));
      sky.addColorStop(0.62, mix([16, 34, 64], [5, 7, 12]));
      sky.addColorStop(0.9, mix([52, 78, 112], [6, 9, 16]));
      sky.addColorStop(1, mix([150, 120, 104], [8, 12, 20]));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // The last of the sunset, low on the left.
      const dusk = ctx.createRadialGradient(W * 0.12, horizonY, 0, W * 0.12, horizonY, W * 0.7);
      dusk.addColorStop(0, `rgba(242,180,120,${0.38 * (1 - high)})`);
      dusk.addColorStop(1, 'rgba(242,180,120,0)');
      ctx.fillStyle = dusk;
      ctx.fillRect(0, 0, W, H);

      const starA = 0.25 + smoothstep(range(f.alt, H * 2, H * 14)) * 0.75;
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        const y = s.y * horizonY;
        ctx.globalAlpha = s.a * starA * (1 - range(y, horizonY - H * 0.35, horizonY) * (1 - high));
        ctx.fillRect(s.x * W, y, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      // ---------------------------------------------------------------
      // The curve of the Earth, late in the climb
      // ---------------------------------------------------------------
      if (limb > 0) {
        const Rr = W * 2.4;
        const top = H * lerp(1.04, 0.8, limb);
        const cx = W * 0.66;
        const cy = top + Rr;
        const body = ctx.createRadialGradient(cx, top, 0, cx, top, H * 0.5);
        body.addColorStop(0, '#12233d');
        body.addColorStop(1, '#05070c');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, Rr, 0, Math.PI * 2);
        ctx.fill();
        // Atmosphere: three passes, wide and faint to thin and bright.
        for (const [lw, a, col] of [
          [26, 0.07, '111,182,255'],
          [8, 0.22, '111,182,255'],
          [1.6, 0.85, '190,225,255'],
        ] as const) {
          ctx.strokeStyle = `rgba(${col},${a * limb})`;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.arc(cx, cy, Rr + lw / 2, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        // Sunset band along the left of the limb.
        const band = ctx.createLinearGradient(0, 0, W, 0);
        band.addColorStop(0, `rgba(255,170,100,${0.55 * limb})`);
        band.addColorStop(0.35, 'rgba(255,170,100,0)');
        ctx.strokeStyle = band;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, Rr + 1, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }

      // ---------------------------------------------------------------
      // The ground: far shore, pad complex, water (all fall away on ascent)
      // ---------------------------------------------------------------
      if (horizonY < H + 20) {
        // Far shore: a low, ragged treeline.
        ctx.fillStyle = '#070a11';
        ctx.beginPath();
        ctx.moveTo(0, horizonY + 4);
        for (let x = 0; x <= W + 20; x += 20) {
          const n = Math.sin(x * 0.031) * 2 + Math.sin(x * 0.013 + 1) * 3 + Math.sin(x * 0.11) * 1.2;
          ctx.lineTo(x, horizonY - 4 - Math.max(0, n));
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.fill();
      }

      const padTop = sy(0);
      if (padTop < H + L * 1.2) {
        const px = sx(0);
        // Lightning masts, far left and right of the pad.
        ctx.strokeStyle = '#121824';
        ctx.lineWidth = 2;
        for (const off of [-L * 0.75, L * 0.62]) {
          ctx.beginPath();
          ctx.moveTo(px + off, padTop);
          ctx.lineTo(px + off, padTop - L * 1.32);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(18,24,36,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(px - L * 0.75, padTop - L * 1.32);
        ctx.quadraticCurveTo(px, padTop - L * 0.95, px + L * 0.62, padTop - L * 1.32);
        ctx.stroke();

        // Service tower: a lattice, lit from the front by the floodlights.
        const tx = px - L * 0.24;
        const tw = L * 0.085;
        const th = L * 1.08;
        ctx.fillStyle = '#0a0e16';
        ctx.fillRect(tx - tw / 2, padTop - th, tw, th);
        ctx.strokeStyle = 'rgba(160,170,190,0.28)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(tx - tw / 2, padTop - th, tw, th);
        ctx.beginPath();
        for (let y = padTop - th; y < padTop; y += tw) {
          ctx.moveTo(tx - tw / 2, y);
          ctx.lineTo(tx + tw / 2, y + tw);
          ctx.moveTo(tx + tw / 2, y);
          ctx.lineTo(tx - tw / 2, y + tw);
          ctx.moveTo(tx - tw / 2, y);
          ctx.lineTo(tx + tw / 2, y);
        }
        ctx.stroke();
        // Aviation lights.
        const blink = still || Math.sin(t * 3) > -0.2 ? 1 : 0.25;
        ctx.fillStyle = `rgba(255,70,60,${0.9 * blink})`;
        for (const [lx, ly] of [
          [tx, padTop - th - 3],
          [px - L * 0.75, padTop - L * 1.32 - 2],
          [px + L * 0.62, padTop - L * 1.32 - 2],
        ]) {
          ctx.beginPath();
          ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Crew access arm: swings back toward the tower (foreshortening).
        const swing = smoothstep(range(p, 0.12, 0.22));
        const armY = padTop - L * 0.86;
        const reach = px - R - (tx + tw / 2);
        ctx.fillStyle = '#1a212e';
        ctx.fillRect(tx + tw / 2, armY, reach * lerp(1, 0.12, swing), L * 0.022);
        ctx.fillStyle = 'rgba(242,230,201,0.5)';
        ctx.fillRect(tx + tw / 2, armY, reach * lerp(1, 0.12, swing), 1);

        // Land and pad deck.
        const land = ctx.createLinearGradient(0, horizonY, 0, padTop + H * 0.05);
        land.addColorStop(0, '#080b12');
        land.addColorStop(1, '#0c1018');
        ctx.fillStyle = land;
        ctx.fillRect(0, padTop - 2, W, H * 0.05);
        // Launch mount.
        ctx.fillStyle = '#0f141e';
        ctx.fillRect(px - L * 0.11, padTop - mountH, L * 0.22, mountH);
        ctx.fillStyle = 'rgba(242,230,201,0.18)';
        ctx.fillRect(px - L * 0.11, padTop - mountH, L * 0.22, 1);

        // Floodlight pools on the pad before ignition.
        const flood = ctx.createRadialGradient(px, padTop, 0, px, padTop, L * 0.7);
        flood.addColorStop(0, `rgba(242,230,201,${0.22 * (1 - engine)})`);
        flood.addColorStop(1, 'rgba(242,230,201,0)');
        ctx.fillStyle = flood;
        ctx.fillRect(px - L, padTop - L * 0.8, L * 2, L);
      }

      // ---------------------------------------------------------------
      // Trail: a ribbon of exhaust behind the climbing vehicle
      // ---------------------------------------------------------------
      if (p > LIFTOFF + 0.004) {
        ctx.lineCap = 'round';
        const steps = 36;
        let prev: [number, number] | null = null;
        for (let j = 0; j <= steps; j++) {
          const q = p - j * 0.0075;
          if (q < LIFTOFF) break;
          const g = flight(q, H, W);
          const pt: [number, number] = [sx(g.x), sy(mountH + g.alt)];
          if (prev && q < MECO) {
            const fade = 1 - j / steps;
            // High up, the trail catches the sun that has already set below.
            const lit = smoothstep(range(g.alt, H * 3, H * 12));
            ctx.strokeStyle = `rgba(${Math.round(lerp(150, 242, lit))},${Math.round(lerp(156, 214, lit))},${Math.round(lerp(168, 180, lit))},${0.32 * fade})`;
            ctx.lineWidth = R * (1.2 + j * 0.35);
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(pt[0], pt[1]);
            ctx.stroke();
          }
          prev = pt;
        }
      }

      // ---------------------------------------------------------------
      // Ground cloud (back half), lit by the fire while it's close
      // ---------------------------------------------------------------
      const drawCloud = (front: boolean) => {
        for (const c of cloud) {
          if (c.front !== front) continue;
          const age = (p - c.birth) / 0.14;
          if (age <= 0) continue;
          const grow = 1 - Math.exp(-age * 1.5);
          const x = sx(0) + c.side * grow * c.speed * W * 0.42;
          const wy = (0.04 + c.lift * grow * 0.55) * L;
          const y = sy(wy);
          const s = L * c.size * (1 + grow * 2.6);
          if (y - s > H) continue;
          const a = Math.min(1, age * 3) * 0.95;
          const heat = engine * near * Math.exp(-Math.abs(x - nozzleX) / (W * 0.3));
          puff(puffs.shade, c.shape, x, y + s * 0.12, s, a * 0.7);
          puff(puffs.cool, c.shape, x, y, s, a * (0.55 + 0.25 * (1 - engine)));
          puff(puffs.warm, c.shape, x, y + s * 0.05, s, a * heat * 0.95);
        }
        ctx.globalAlpha = 1;
      };
      drawCloud(false);

      // ---------------------------------------------------------------
      // Vehicle and plume
      // ---------------------------------------------------------------
      const zoom = lerp(1, 0.72, limb);
      const drawPlume = (len: number, width: number, vacuum: number, power: number) => {
        if (power <= 0.001) return;
        ctx.globalCompositeOperation = 'lighter';
        const fl = flick(23, 0);
        const Lp = len * fl;
        const tail = width * (1.3 + high * 4 + vacuum * 4.5);
        const body = ctx.createLinearGradient(0, 0, 0, Lp);
        if (vacuum) {
          body.addColorStop(0, `rgba(235,244,255,${0.9 * power})`);
          body.addColorStop(0.12, `rgba(170,205,255,${0.3 * power})`);
          body.addColorStop(1, 'rgba(111,182,255,0)');
        } else {
          body.addColorStop(0, `rgba(255,253,240,${power})`);
          body.addColorStop(0.16, `rgba(255,236,190,${0.95 * power})`);
          body.addColorStop(0.45, `rgba(255,143,63,${0.7 * power})`);
          body.addColorStop(1, 'rgba(255,110,40,0)');
        }
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(-width / 2, 0);
        ctx.bezierCurveTo(-width * 0.7, Lp * 0.25, -tail / 2, Lp * 0.6, 0, Lp);
        ctx.bezierCurveTo(tail / 2, Lp * 0.6, width * 0.7, Lp * 0.25, width / 2, 0);
        ctx.fill();
        // White-hot core and, low down, shock diamonds.
        const core = ctx.createLinearGradient(0, 0, 0, Lp * 0.4);
        core.addColorStop(0, `rgba(255,255,255,${power})`);
        core.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.moveTo(-width * 0.32, 0);
        ctx.quadraticCurveTo(0, Lp * 0.5, width * 0.32, 0);
        ctx.fill();
        if (!vacuum && high < 0.6) {
          ctx.fillStyle = `rgba(255,250,235,${0.55 * power * (1 - high)})`;
          for (let k = 1; k <= 4; k++) {
            const y = k * width * 1.25 * fl;
            ctx.beginPath();
            ctx.ellipse(0, y, width * 0.2, width * 0.36, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Bloom around the nozzle.
        const glow = power * (1 - high * 0.65);
        const bloom = ctx.createRadialGradient(0, width, 0, 0, width, L * (0.45 + vacuum * 0.2));
        bloom.addColorStop(0, vacuum ? `rgba(160,200,255,${0.3 * glow})` : `rgba(255,170,90,${0.5 * glow})`);
        bloom.addColorStop(0.35, vacuum ? `rgba(160,200,255,${0.08 * glow})` : `rgba(255,150,80,${0.14 * glow})`);
        bloom.addColorStop(1, 'rgba(255,150,80,0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(-L, -L * 0.6, L * 2, L * 1.6);
        ctx.globalCompositeOperation = 'source-over';
      };

      /** One cylinder section, shaded as a lit tube (sunset key from the left). */
      const tube = (y0: number, y1: number, r: number, base: string) => {
        const g = ctx.createLinearGradient(-r, 0, r, 0);
        g.addColorStop(0, '#f6e9cf');
        g.addColorStop(0.18, base);
        g.addColorStop(0.62, '#59606d');
        g.addColorStop(1, '#151a24');
        ctx.fillStyle = g;
        ctx.fillRect(-r, y0, r * 2, y1 - y0);
      };

      const drawBooster = (power: number) => {
        // Engine bells.
        ctx.fillStyle = '#2a303b';
        for (const bx of [-0.62, 0, 0.62]) {
          ctx.beginPath();
          ctx.moveTo(bx * R - R * 0.18, -L * 0.035);
          ctx.lineTo(bx * R + R * 0.18, -L * 0.035);
          ctx.lineTo(bx * R + R * 0.3, 0);
          ctx.lineTo(bx * R - R * 0.3, 0);
          ctx.fill();
        }
        // Body, with soot gathering toward the engines.
        tube(-L * 0.6, -L * 0.035, R, '#dcdad4');
        const soot = ctx.createLinearGradient(0, -L * 0.3, 0, -L * 0.035);
        soot.addColorStop(0, 'rgba(20,22,28,0)');
        soot.addColorStop(1, 'rgba(20,22,28,0.55)');
        ctx.fillStyle = soot;
        ctx.fillRect(-R, -L * 0.3, R * 2, L * 0.265);
        // Panel seams.
        ctx.fillStyle = 'rgba(10,12,18,0.25)';
        for (let y = -L * 0.56; y < -L * 0.05; y += L * 0.07) ctx.fillRect(-R, y, R * 2, 0.8);
        // Grid fins and folded legs.
        ctx.fillStyle = '#1b212c';
        ctx.fillRect(-R - R * 0.55, -L * 0.585, R * 0.55, L * 0.025);
        ctx.fillRect(R, -L * 0.585, R * 0.55, L * 0.025);
        ctx.fillRect(-R - 1.5, -L * 0.2, 1.5, L * 0.16);
        ctx.fillRect(R, -L * 0.2, 1.5, L * 0.16);
        // Wordmark.
        ctx.save();
        ctx.translate(-R * 0.15, -L * 0.48);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = 'rgba(11,15,24,0.85)';
        ctx.font = `${Math.max(7, R * 0.62)}px Michroma, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('THEIA', 0, 0);
        ctx.restore();
        // Fire light on the underside.
        if (power > 0) {
          const under = ctx.createLinearGradient(0, -L * 0.18, 0, 0);
          under.addColorStop(0, 'rgba(255,143,63,0)');
          under.addColorStop(1, `rgba(255,143,63,${0.6 * power})`);
          ctx.fillStyle = under;
          ctx.fillRect(-R, -L * 0.18, R * 2, L * 0.145);
        }
      };

      const drawUpper = () => {
        // Interstage, upper stage, fairing with an ogive nose.
        ctx.fillStyle = '#10141c';
        ctx.fillRect(-R, -L * 0.64, R * 2, L * 0.04);
        tube(-L * 0.83, -L * 0.64, R, '#e4e2dc');
        const g = ctx.createLinearGradient(-R, 0, R, 0);
        g.addColorStop(0, '#fbf3e1');
        g.addColorStop(0.2, '#ecebe6');
        g.addColorStop(0.62, '#646b78');
        g.addColorStop(1, '#171c26');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-R, -L * 0.83);
        ctx.lineTo(-R, -L * 0.88);
        ctx.quadraticCurveTo(-R, -L * 0.97, 0, -L);
        ctx.quadraticCurveTo(R, -L * 0.97, R, -L * 0.88);
        ctx.lineTo(R, -L * 0.83);
        ctx.fill();
        ctx.fillStyle = 'rgba(10,12,18,0.35)';
        ctx.fillRect(-R, -L * 0.835, R * 2, 0.8);
      };

      // Separation: the booster falls back and tumbles out of frame.
      const sep = range(p, SEP, 1);
      ctx.save();
      ctx.translate(nozzleX, nozzleY);
      ctx.rotate(f.pitch);
      ctx.scale(zoom, zoom);

      if (p >= SEP) {
        const d = sep;
        ctx.save();
        // Falls back and away from the camera: drops, shrinks, tumbles, fades.
        ctx.translate(-d * W * 0.4, L * 0.2 + d * H * 2.8);
        ctx.scale(1 - Math.min(d, 0.3) * 1.6, 1 - Math.min(d, 0.3) * 1.6);
        ctx.rotate(d * 2.6);
        ctx.globalAlpha = 1 - range(d, 0.06, 0.24);
        drawBooster(0);
        ctx.restore();
        ctx.globalAlpha = 1;
        // Upper stage carries on; the camera eases down to centre it.
        ctx.translate(0, L * 0.42 * smoothstep(range(p, SEP, 0.9)));
        // Cold-gas puff at the split.
        const burst = range(p, SEP, SEP + 0.05);
        if (burst > 0 && burst < 1) {
          ctx.fillStyle = `rgba(230,236,245,${0.6 * (1 - burst)})`;
          for (let k = 0; k < 14; k++) {
            const a = (k / 14) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * burst * L * 0.25, -L * 0.62 + Math.sin(a) * burst * L * 0.12, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Upper stage engine bell, then its vacuum plume.
        ctx.fillStyle = '#2a303b';
        ctx.beginPath();
        ctx.moveTo(-R * 0.3, -L * 0.64);
        ctx.lineTo(R * 0.3, -L * 0.64);
        ctx.lineTo(R * 0.55, -L * 0.6);
        ctx.lineTo(-R * 0.55, -L * 0.6);
        ctx.fill();
        ctx.save();
        ctx.translate(0, -L * 0.6);
        drawPlume(L * 1.15, R * 1.1, 1, upper);
        ctx.restore();
        drawUpper();
      } else {
        drawPlume(L * (0.75 + 0.5 * high), R * 1.9, 0, engine);
        drawBooster(engine);
        drawUpper();
        // Max-Q: a vapour collar where the air is thickest against the hull.
        const q = range(p, MAX_Q[0], MAX_Q[1]);
        if (q > 0 && q < 1) {
          const a = Math.sin(q * Math.PI) * 0.42;
          ctx.save();
          ctx.translate(0, -L * 0.66);
          ctx.scale(1, 0.5);
          const cone = ctx.createRadialGradient(0, 0, R, 0, 0, R * 5.5);
          cone.addColorStop(0, `rgba(235,240,248,${a})`);
          cone.addColorStop(0.45, `rgba(235,240,248,${a * 0.35})`);
          cone.addColorStop(1, 'rgba(235,240,248,0)');
          ctx.fillStyle = cone;
          ctx.beginPath();
          ctx.arc(0, 0, R * 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();

      // Cryogenic venting while the vehicle is fuelled and holding.
      const vent = 1 - range(p, IGNITE, LIFTOFF);
      if (vent > 0) {
        for (let k = 0; k < 14; k++) {
          const ph = still ? k / 14 : (t * 0.22 + k / 14) % 1;
          const side = k % 2 ? 1 : -1;
          const vy = nozzleY - L * (k % 3 === 0 ? 0.62 : 0.4);
          const x = nozzleX + side * (R + ph * L * 0.12);
          const y = vy + ph * L * 0.16;
          puff(puffs.cool, k, x, y, L * (0.03 + ph * 0.1), vent * 0.42 * (1 - ph) * Math.min(1, ph * 6));
        }
        ctx.globalAlpha = 1;
      }

      drawCloud(true);

      // ---------------------------------------------------------------
      // Water in the foreground, mirroring whatever is brightest
      // ---------------------------------------------------------------
      const waterY = sy(0) + H * 0.035;
      if (waterY < H) {
        const water = ctx.createLinearGradient(0, waterY, 0, H);
        water.addColorStop(0, '#0b1220');
        water.addColorStop(1, '#05070c');
        ctx.fillStyle = water;
        ctx.fillRect(0, waterY, W, H - waterY);
        const glow = Math.max(engine * near, 0.18 * (1 - engine));
        const streak = ctx.createLinearGradient(0, waterY, 0, H);
        streak.addColorStop(0, engine > 0 ? `rgba(255,170,90,${0.7 * glow})` : `rgba(242,230,201,${glow})`);
        streak.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.fillStyle = streak;
        for (let y = waterY + 2; y < H; y += 5) {
          const wobble = still ? 0 : Math.sin(t * 1.4 + y * 0.21) * 8;
          const half = (L * 0.08 + (y - waterY) * 0.5) * (0.6 + 0.4 * Math.sin(y * 1.7));
          ctx.fillRect(sx(0) - half + wobble, y, half * 2, 1.6);
        }
      }

      // Fire light washing the whole frame at ignition and liftoff.
      const wash = engine * near;
      if (wash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(nozzleX, padY, 0, nozzleX, padY, W * 0.8);
        g.addColorStop(0, `rgba(255,143,63,${0.32 * wash * flick(17, 2)})`);
        g.addColorStop(1, 'rgba(255,143,63,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Hand over to black at the end.
      const out = range(p, 0.95, 1);
      if (out > 0) {
        ctx.fillStyle = `rgba(5,7,12,${out})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Rumble: on the wrapper, never on the canvas itself.
      const shake = shakeRef.current!;
      const rumble = still ? 0 : range(p, IGNITE, LIFTOFF) * (1 - range(p, LIFTOFF + 0.02, 0.5)) * 3.5;
      shake.style.transform = rumble > 0.05 ? `translate3d(${(Math.sin(t * 61) * rumble).toFixed(2)}px, ${(Math.cos(t * 53) * rumble).toFixed(2)}px, 0)` : '';

      // ---------------------------------------------------------------
      // HUD (illustrative figures)
      // ---------------------------------------------------------------
      clockRef.current!.textContent = fmtClock(p);
      const secs = range(p, LIFTOFF, MECO) * MECO_S + range(p, MECO, 1) * 90;
      const km = 68 * Math.pow(Math.min(secs, MECO_S) / MECO_S, 2) + Math.max(0, secs - MECO_S) * 0.9;
      const kmh = 7600 * Math.pow(Math.min(secs, MECO_S) / MECO_S, 1.4) + Math.max(0, secs - MECO_S) * 32;
      altRef.current!.textContent = km.toFixed(1);
      velRef.current!.textContent = Math.round(kmh).toLocaleString('en-US');

      const stage = p < IGNITE ? 0 : p < MAX_Q[0] ? 1 : 2;
      const spans: [number, number][] = [
        [0, IGNITE],
        [IGNITE, MAX_Q[0]],
        [MAX_Q[0], UPPER + 0.04],
      ];
      spans.forEach(([a, b], i) => {
        barRefs.current[i].style.transform = `scaleX(${range(p, a, b)})`;
      });
      if (stage !== lastStage) {
        lastStage = stage;
        stageRefs.current.forEach((el, i) => {
          el.dataset.state = i === stage ? 'now' : i < stage ? 'done' : 'next';
        });
      }
    });
  }, []);

  return (
    <section ref={rootRef} id="ignition" aria-labelledby="ignition-title" className="relative bg-void" style={{height: `${SECTION_VH}svh`}}>
      <div className="sticky top-0 h-screen-s overflow-hidden bg-void">
        <div ref={shakeRef} className="absolute -inset-2 will-change-transform">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="A rocket lifts off at dusk over the water, climbs into the dark, drops its booster and flies on above the curve of the Earth."
            className="absolute inset-0 size-full"
          />
        </div>

        {/* The sky deepens to black overhead, so the Earthrise's starfield flows into it. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[22vh] bg-linear-to-b from-void to-transparent" />

        {/* Scrims keep the copy legible over the sky. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(5_7_12/0.82),rgb(5_7_12/0.35)_38%,transparent_58%)] max-md:bg-[linear-gradient(180deg,rgb(5_7_12/0.85),rgb(5_7_12/0.2)_40%,transparent_60%,rgb(5_7_12/0.7)_88%)]" />

        <div className="relative z-10 flex h-full flex-col justify-between px-4 pt-20 pb-6 sm:px-6 md:w-[min(34rem,46vw)] md:justify-center md:gap-10 md:pt-24 md:pb-10 md:pl-[6vw]">
          <div>
            <p className="font-mono text-label text-earth uppercase">
              {ignition.eyebrow} <span className="text-regolith/45">/ {ignition.note}</span>
            </p>
            <h2 id="ignition-title" className="mt-3 max-w-[18ch] font-display text-[clamp(1.375rem,2.6vw,2.5rem)] leading-[1.12] text-white">
              {ignition.heading}
            </h2>
            <p ref={clockRef} aria-hidden="true" className="mt-5 font-display text-[clamp(1.75rem,3.6vw,3.25rem)] leading-none tracking-[0.04em] whitespace-nowrap text-sunlit tabular-nums md:mt-8">
              T− 00:00:10.0
            </p>
          </div>

          <ol className="space-y-1 md:space-y-2">
            {ignition.stages.map((s, i) => (
              <li
                key={s.title}
                ref={(el) => {
                  if (el) stageRefs.current[i] = el;
                }}
                data-state={i === 0 ? 'now' : 'next'}
                className="group relative grid grid-cols-[1.75rem_1fr] gap-x-3 py-2 transition-opacity duration-500 data-[state=done]:opacity-45 data-[state=next]:opacity-35 max-md:data-[state=done]:hidden max-md:data-[state=next]:hidden"
              >
                <span className="pt-0.5 font-mono text-label text-earth tabular-nums">{i + 1}/3</span>
                <div>
                  <h3 className="font-display text-[0.9375rem] tracking-widest text-white uppercase md:text-[1rem]">{s.title}</h3>
                  <div className="grid transition-[grid-template-rows] duration-500 ease-out group-data-[state=now]:grid-rows-[1fr] grid-rows-[0fr] motion-reduce:transition-none">
                    <p className="overflow-hidden text-body text-regolith/80">
                      <span className="block pt-1.5">{s.body}</span>
                    </p>
                  </div>
                  <span className="mt-2.5 block h-px w-full max-w-[18rem] bg-white/12">
                    <span
                      ref={(el) => {
                        if (el) barRefs.current[i] = el;
                      }}
                      className="block h-full origin-left bg-linear-to-r from-earth to-sunlit"
                      style={{transform: 'scaleX(0)'}}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Telemetry, bottom right. */}
        <dl aria-hidden="true" className="absolute right-4 bottom-6 z-10 hidden gap-8 font-mono text-label text-regolith/60 uppercase sm:flex md:right-[calc(3vw+2.5rem)] md:bottom-10">
          <div>
            <dt>Altitude</dt>
            <dd className="mt-1 text-[1rem] text-white tabular-nums">
              <span ref={altRef}>0.0</span> km
            </dd>
          </div>
          <div>
            <dt>Velocity</dt>
            <dd className="mt-1 text-[1rem] text-white tabular-nums">
              <span ref={velRef}>0</span> km/h
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
