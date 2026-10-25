#!/usr/bin/env node
/**
 * Builds the footer globe's two equirectangular maps from NASA masters in
 * raw/earth/ (git-ignored). Both are public domain (NASA Earth Observatory):
 *
 *   world.topo.bathy.200412.3x5400x2700.jpg  Blue Marble Next Generation, Dec 2004
 *     https://visibleearth.nasa.gov/images/73909
 *   cloud_combined_2048.jpg                  Blue Marble clouds
 *     https://visibleearth.nasa.gov/images/57747
 *   BlackMarble_2016_01deg.jpg               Black Marble 2016, city lights
 *     https://earthobservatory.nasa.gov/features/NightLights
 *
 *   node scripts/build-earth.mjs
 *
 * Writes public/media/earth/{day,night}.webp at 1536×768 — enough detail for
 * a ~260 px globe at 2× density, small enough to sample per pixel.
 */
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';

const OUT = 'public/media/earth';
const SIZE = {width: 1536, height: 768};

await mkdir(OUT, {recursive: true});

// Day: the surface with the cloud map laid over it as white, the cloud map as alpha.
const clouds = await sharp('raw/earth/cloud_combined_2048.jpg').resize(SIZE.width, SIZE.height).greyscale().linear(0.92, 0).raw().toBuffer();
const cloudLayer = await sharp({create: {...SIZE, channels: 3, background: '#ffffff'}})
  .joinChannel(clouds, {raw: {...SIZE, channels: 1}})
  .png()
  .toBuffer();
await sharp('raw/earth/world.topo.bathy.200412.3x5400x2700.jpg')
  .resize(SIZE.width, SIZE.height, {kernel: 'lanczos3'})
  .composite([{input: cloudLayer}])
  .webp({quality: 82})
  .toFile(`${OUT}/day.webp`);

// City lights only: crush the faint blue terrain glow so the night side reads as dark.
await sharp('raw/earth/BlackMarble_2016_01deg.jpg')
  .resize(SIZE.width, SIZE.height, {kernel: 'lanczos3'})
  .linear(1.35, -28)
  .webp({quality: 78})
  .toFile(`${OUT}/night.webp`);

console.log('wrote', `${OUT}/day.webp`, `${OUT}/night.webp`);
