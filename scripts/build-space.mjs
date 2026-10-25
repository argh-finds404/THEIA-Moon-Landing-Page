#!/usr/bin/env node
/**
 * Textures for the two WebGL scenes (Orbit, Landing sites), from NASA
 * masters in raw/ (git-ignored). All public domain:
 *
 *   raw/earth/world.topo.bathy.200412.3x5400x2700.jpg  Blue Marble NG (visibleearth.nasa.gov/images/73909)
 *   raw/earth/BlackMarble_2016_01deg.jpg               Black Marble 2016 city lights
 *   raw/earth/cloud_combined_2048.jpg                  Blue Marble clouds (visibleearth.nasa.gov/images/57747)
 *   raw/moon/lroc_color_poles_4k.tif                   LRO LROC colour (svs.gsfc.nasa.gov/4720)
 *   raw/moon/ldem_16_uint.tif                          LRO LOLA elevation, 16 px/degree (svs.gsfc.nasa.gov/4720)
 *
 *   node scripts/build-space.mjs
 *
 * Writes public/media/space/*-{4k,2k}.webp. The Moon's elevation becomes a
 * normal map here (from the 16-bit heights), so the shader gets smooth,
 * exact relief without 8-bit banding. Last, it renders moon-poster.webp:
 * the Landing-sites Moon exactly as its shader first draws it, shown while
 * the maps load and as the fallback without WebGL2.
 */
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';

const OUT = 'public/media/space';

// The same rotations as GLSL_COMMON in src/lib/gl.ts.
const rotX = ([x, y, z], a) => [x, Math.cos(a) * y - Math.sin(a) * z, Math.sin(a) * y + Math.cos(a) * z];
const rotY = ([x, y, z], a) => [Math.cos(a) * x + Math.sin(a) * z, y, -Math.sin(a) * x + Math.cos(a) * z];
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
};
await mkdir(OUT, {recursive: true});

const sizes = [
  ['4k', 4096, 2048],
  ['2k', 2048, 1024],
];

for (const [tag, w, h] of sizes) {
  await sharp('raw/earth/world.topo.bathy.200412.3x5400x2700.jpg').resize(w, h, {kernel: 'lanczos3'}).webp({quality: 80}).toFile(`${OUT}/earth-day-${tag}.webp`);
  await sharp('raw/earth/BlackMarble_2016_01deg.jpg').resize(w, h, {kernel: 'lanczos3'}).linear(1.35, -28).webp({quality: 78}).toFile(`${OUT}/earth-night-${tag}.webp`);
  await sharp('raw/moon/lroc_color_poles_4k.tif').resize(w, h, {kernel: 'lanczos3'}).webp({quality: 82}).toFile(`${OUT}/moon-color-${tag}.webp`);
}
// Clouds exist at 2048 px; one cut serves both.
await sharp('raw/earth/cloud_combined_2048.jpg').greyscale().webp({quality: 80}).toFile(`${OUT}/earth-clouds.webp`);

// Moon normal map from LOLA heights: east/north slopes → RGB.
{
  const W = 2048;
  const H = 1024;
  const {data} = await sharp('raw/moon/ldem_16_uint.tif').resize(W, H, {kernel: 'cubic'}).toColourspace('grey16').raw({depth: 'ushort'}).toBuffer({resolveWithObject: true});
  const height = new Uint16Array(data.buffer, data.byteOffset, W * H);
  // ldem_16_uint stores elevation in half-metres; a pixel spans 2π·1737.4 km / W at the equator.
  const metresPerPx = (2 * Math.PI * 1737400) / W;
  const EXAGGERATE = 2.2;
  const out = Buffer.alloc(W * H * 3);
  const at = (x, y) => height[Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)] * 0.5;
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    const eastScale = Math.max(0.05, Math.cos(lat)); // longitude pixels shrink toward the poles
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * metresPerPx * eastScale);
      const dy = (at(x, y - 1) - at(x, y + 1)) / (2 * metresPerPx);
      let nx = -dx * EXAGGERATE;
      let ny = -dy * EXAGGERATE;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (y * W + x) * 3;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  await sharp(out, {raw: {width: W, height: H, channels: 3}}).webp({quality: 90}).toFile(`${OUT}/moon-normal-2k.webp`);
}

// The Landing-sites poster: the same view, light and shading as MoonSites.tsx
// (keep VIEW, SUN and the shading constants in step with that file).
{
  const VIEW = {lon: (15 * Math.PI) / 180, lat: (8 * Math.PI) / 180};
  const SUN = norm([0.72, 0.32, 0.6]);
  const SS = 2400; // render at 2× and downsample, for clean edges and texels
  const OUTPX = 1200;
  const color = await sharp(`${OUT}/moon-color-4k.webp`).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const normal = await sharp(`${OUT}/moon-normal-2k.webp`).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const sample = ({data, info}, u, v, out) => {
    const x = u * info.width - 0.5;
    const y = Math.min(info.height - 1, Math.max(0, v * info.height - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const y1 = Math.min(info.height - 1, y0 + 1);
    for (let c = 0; c < 3; c++) {
      const at = (xx, yy) => data[(yy * info.width + ((xx % info.width) + info.width) % info.width) * info.channels + c];
      const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
      const bot = at(x0, y1) * (1 - fx) + at(x0 + 1, y1) * fx;
      out[c] = (top * (1 - fy) + bot * fy) / 255;
    }
  };
  const tone = (x) => Math.pow(Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14))), 1 / 2.2);
  const img = Buffer.alloc(SS * SS * 4);
  const a = [0, 0, 0];
  const t = [0, 0, 0];
  const R = SS / 2;
  for (let py = 0; py < SS; py++) {
    for (let px = 0; px < SS; px++) {
      const x = (px + 0.5 - R) / R;
      const y = (R - py - 0.5) / R;
      const d = Math.hypot(x, y);
      if (d >= 1) continue;
      const n = [x, y, Math.sqrt(1 - d * d)];
      const b = rotY(rotX(n, -VIEW.lat), VIEW.lon);
      const lon = Math.atan2(b[0], b[2]);
      const lat = Math.asin(Math.max(-1, Math.min(1, b[1])));
      const u = lon / (2 * Math.PI) + 0.5;
      const v = 0.5 - lat / Math.PI;
      sample(color, u, v, a);
      sample(normal, u, v, t);
      const tn = t.map((c) => c * 2 - 1);
      const east = [Math.cos(lon), 0, -Math.sin(lon)];
      const north = [-Math.sin(lon) * Math.sin(lat), Math.cos(lat), -Math.cos(lon) * Math.sin(lat)];
      const nb = norm([0, 1, 2].map((k) => east[k] * tn[0] + north[k] * tn[1] + b[k] * tn[2]));
      const nv = rotX(rotY(nb, -VIEW.lon), VIEW.lat);
      const mu0 = Math.max(0, nv[0] * SUN[0] + nv[1] * SUN[1] + nv[2] * SUN[2]);
      const mu = Math.max(n[2], 0.05);
      const lit = (mu0 / (mu0 + mu + 1e-6)) * 1.25 + mu0 * 0.75;
      const shine = [0.5, 0.62, 0.9].map((k) => k * 0.02);
      const o = (py * SS + px) * 4;
      const edge = Math.min(1, (1 - d) * R * 0.5);
      for (let c = 0; c < 3; c++) {
        const lin = Math.pow(a[c], 2.2);
        img[o + c] = Math.round(tone(lin * (lit + shine[c]) * 0.95) * 255);
      }
      img[o + 3] = Math.round(edge * 255);
    }
  }
  await sharp(img, {raw: {width: SS, height: SS, channels: 4}}).resize(OUTPX, OUTPX, {kernel: 'lanczos3'}).webp({quality: 84, alphaQuality: 90}).toFile(`${OUT}/moon-poster.webp`);
}

console.log('wrote', OUT);
