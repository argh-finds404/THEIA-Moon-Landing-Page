#!/usr/bin/env node
/**
 * Favicons from public/favicon.svg (the header's crescent, with the Earth
 * rising in its hollow):
 *
 *   node scripts/build-favicon.mjs
 *
 * Writes favicon-32.png (browsers without SVG icons) and
 * apple-touch-icon.png (180 px, full-bleed: iOS rounds the corners itself).
 */
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';

const svg = await readFile('public/favicon.svg', 'utf8');
await sharp(Buffer.from(svg), {density: 384}).resize(32, 32).png().toFile('public/favicon-32.png');
const square = svg.replace(/rx="[\d.]+"/, 'rx="0"');
await sharp(Buffer.from(square), {density: 768}).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('wrote favicons');
