#!/usr/bin/env node
/**
 * Turns raw generator output into the exact WebP cuts the Earthrise stage loads.
 *
 *   npm i -D sharp
 *   node scripts/build-layers.mjs raw/layers                       # replace/add layers
 *   node scripts/build-layers.mjs raw/night --out public/layers-night --alpha-from public/layers
 *   node scripts/build-layers.mjs raw/cards --size 840x1120 --out public/media/cards   # stills
 *
 * raw/<dir>/ holds one image per layer, named like the layer: sky, earth,
 * moonscape, frame, astronaut, ground (any of png/jpg/webp, any 16:9-ish size).
 *
 * Output is public/layers/{d,m}/<name>.webp at EXACTLY 2400x1357 and 1280x724 —
 * the sizes of the originals — so a new layer registers with the others.
 *
 * --size WxH         Not a layer set: write ONE cut of exactly WxH straight into --out
 *                     (reel stills 840x1120, patches 600x600, a cutaway 1600x900...).
 * --alpha-from <dir>  Re-use the alpha channel of the existing layer (same name,
 *                     same cut). Use it for relit / restyled variants (night,
 *                     dawn, Earthshine): the model repaints the pixels, the
 *                     original silhouette keeps them registered. Layers with no
 *                     alpha (sky) are written as they are.
 */
import sharp from 'sharp';
import {mkdir, readdir} from 'node:fs/promises';
import {basename, extname, join} from 'node:path';

const [rawDir, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i === -1 ? fallback : rest[i + 1];
};

if (!rawDir || rawDir.startsWith('--')) {
  console.error('usage: node scripts/build-layers.mjs <rawDir> [--out public/layers] [--alpha-from public/layers] [--size WxH] [--quality 82]');
  process.exit(1);
}

const SIZE = opt('--size', null);
const OUT = opt('--out', 'public/layers');
const ALPHA_FROM = opt('--alpha-from', null);
const QUALITY = Number(opt('--quality', 82));
// Layer sets get both cuts, exactly the originals' sizes. --size gives one flat cut.
const CUTS = SIZE ? {'': SIZE.split('x').map(Number)} : {d: [2400, 1357], m: [1280, 724]};

const files = (await readdir(rawDir)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) {
  console.error(`No images found in ${rawDir}`);
  process.exit(1);
}

for (const file of files) {
  const name = basename(file, extname(file));
  for (const [cut, [w, h]] of Object.entries(CUTS)) {
    await mkdir(join(OUT, cut), {recursive: true});

    // fit:'fill' forces the exact size (the stretch from 16:9 is < 0.6%, invisible).
    let img = sharp(join(rawDir, file)).resize(w, h, {fit: 'fill'});

    if (ALPHA_FROM) {
      const original = sharp(join(ALPHA_FROM, cut, `${name}.webp`));
      if ((await original.metadata()).hasAlpha) {
        const mask = await original.extractChannel('alpha').png().toBuffer();
        const rgb = await img.removeAlpha().png().toBuffer();
        img = sharp(rgb).joinChannel(mask);
      }
    }

    const dest = join(OUT, cut, `${name}.webp`);
    await img.webp({quality: QUALITY, alphaQuality: 100, effort: 5}).toFile(dest);
    console.log(`${dest}  ${w}x${h}`);
  }
}
