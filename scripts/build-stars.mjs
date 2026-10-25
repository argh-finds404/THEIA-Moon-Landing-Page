#!/usr/bin/env node
/**
 * The real night sky behind the hero's exit and the Orbit scene: the core
 * of the Milky Way, cut from NASA's Deep Star Maps 2020 (public domain;
 * NASA/Goddard Space Flight Center Scientific Visualization Studio, Gaia
 * DR2: ESA/Gaia/DPAC — svs.gsfc.nasa.gov/4851).
 *
 *   raw/space/starmap_2020_4k.ppm   starmap_2020_4k.exr converted to a 16-bit
 *                                   linear PPM (sharp can't read EXR; any EXR
 *                                   tool will do, e.g. Python's OpenEXR)
 *
 *   node scripts/build-stars.mjs
 *
 * Writes public/media/space/stars-d.webp (1920×1080, native pixels, no
 * upscaling) and stars-m.webp (a portrait cut for phones).
 */
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';

const OUT = 'public/media/space';
const buf = await readFile('raw/space/starmap_2020_4k.ppm');
const head = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(buf.subarray(0, 64).toString('latin1'));
const W = +head[1];
const H = +head[2];
const off = head[0].length;

// The galactic core sits at about (0.74, 0.62) of this map.
const CORE = [Math.round(W * 0.74), Math.round(H * 0.62)];

/** Tone-map a window of the linear map: lift the black point so space reads black, keep the stars crisp. */
function cut(w, h) {
  const x0 = CORE[0] - Math.round(w / 2);
  const y0 = CORE[1] - Math.round(h / 2);
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = (((x0 + x) % W) + W) % W;
      const sy = Math.min(H - 1, Math.max(0, y0 + y));
      for (let c = 0; c < 3; c++) {
        let v = (buf.readUInt16BE(off + ((sy * W + sx) * 3 + c) * 2) / 65535) * 2;
        v = Math.max(0, v - 0.009) * 1.5;
        out[(y * w + x) * 3 + c] = Math.round(255 * Math.min(1, Math.pow(v, 1 / 2.2)));
      }
    }
  }
  return sharp(out, {raw: {width: w, height: h, channels: 3}});
}

await cut(1920, 1080).webp({quality: 82}).toFile(`${OUT}/stars-d.webp`);
await cut(1080, 1440).webp({quality: 80}).toFile(`${OUT}/stars-m.webp`);
console.log('wrote', `${OUT}/stars-{d,m}.webp`);
