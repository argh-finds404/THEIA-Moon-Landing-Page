#!/usr/bin/env node
/**
 * Builds the Legends stills from the masters in raw/legends/ (git-ignored).
 *
 *   node scripts/build-legends.mjs
 *
 * For each mission it writes, into public/media/legends/:
 *   <id>-card.webp  960×1320 portrait crop around the subject (the strip card)
 *   <id>.webp       the whole frame, long side ≤ 2400 px (the open mission view)
 *
 * Crops are given as a centre (cx, cy) and a height (h), all as fractions of
 * the master; the width follows from the card's aspect. Orbital (LROC) frames
 * are never upscaled for the full view — they're published at 1000–1100 px.
 *
 * Masters (all public domain or free to use with credit):
 *   apollo8.jpg        NASA AS08-14-2383            images.nasa.gov
 *   apollo11.jpg       NASA AS11-40-5903            images.nasa.gov
 *   apollo15.jpg       NASA AS15-86-11603           images.nasa.gov
 *   apollo17.jpg       NASA AS17-140-21496          images.nasa.gov
 *   artemis2.jpg       NASA art002e021278           images.nasa.gov
 *   lunokhod1-l17.png  LROC M175502049R (Luna 17)   lroc.asu.edu/images/402
 *   change4.png        LROC M1303570617 (Chang'e 4) lroc.asu.edu/images/1091
 *   chandrayaan3.png   LROC M1447750764, annotated  lroc.asu.edu/images/1314
 *
 * The two clips were cut with ffmpeg (not a project dependency):
 *   apollo8-earthrise.mp4  SVS 4129 earthrise_2160p30.mp4, 70–150 s at 8×, 1080p
 *   artemis2-flyby.mp4     jsc2026m000073 (Flight Day 6 highlights), 1214–1226 s, 1080p
 *   ffmpeg -ss <in> -t <len> -i <src> -vf "[setpts=PTS/8,]fps=30,scale=1920:1080" \
 *          -an -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart <out>.mp4
 */
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';

const RAW = 'raw/legends';
const OUT = 'public/media/legends';
const CARD = {w: 960, h: 1320};

const SHOTS = [
  {id: 'apollo8', src: 'apollo8.jpg', crop: {cx: 0.56, cy: 0.55, h: 0.9}},
  {id: 'apollo11', src: 'apollo11.jpg', crop: {cx: 0.52, cy: 0.5, h: 1}},
  {id: 'lunokhod1', src: 'lunokhod1-l17.png', crop: {cx: 0.603, cy: 0.43, h: 0.6}},
  {id: 'apollo15', src: 'apollo15.jpg', crop: {cx: 0.47, cy: 0.5, h: 1}},
  {id: 'apollo17', src: 'apollo17.jpg', crop: {cx: 0.38, cy: 0.5, h: 1}},
  {id: 'change4', src: 'change4.png', crop: {cx: 0.5, cy: 0.495, h: 0.73}},
  {id: 'chandrayaan3', src: 'chandrayaan3-anot.png', crop: {cx: 0.507, cy: 0.497, h: 0.73}},
  {id: 'artemis2', src: 'artemis2.jpg', crop: {cx: 0.53, cy: 0.5, h: 1}},
];

await mkdir(OUT, {recursive: true});

for (const {id, src, crop} of SHOTS) {
  const file = `${RAW}/${src}`;
  const {width: W, height: H} = await sharp(file).metadata();
  const h = Math.round(crop.h * H);
  const w = Math.min(W, Math.round((h * CARD.w) / CARD.h));
  const left = Math.max(0, Math.min(W - w, Math.round(crop.cx * W - w / 2)));
  const top = Math.max(0, Math.min(H - h, Math.round(crop.cy * H - h / 2)));

  await sharp(file)
    .extract({left, top, width: w, height: h})
    .resize(CARD.w, CARD.h, {fit: 'cover', kernel: 'lanczos3'})
    .webp({quality: 80})
    .toFile(`${OUT}/${id}-card.webp`);

  await sharp(file)
    .resize(2400, 2400, {fit: 'inside', withoutEnlargement: true})
    .webp({quality: 80})
    .toFile(`${OUT}/${id}.webp`);

  console.log(`${id}: crop ${w}×${h} at ${left},${top} of ${W}×${H}`);
}
