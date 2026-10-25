/**
 * Where the Earth disc sits inside the hero's earth layer, as fractions of
 * the layer's width (cx, d) and height (cy) — measured from its alpha
 * bounding box. If `earth.webp` is regenerated, re-measure and update this.
 */
export const LAYER = {cx: 0.657, cy: 0.498, d: 0.401};

/** The layer's aspect ratio (height / width); both cuts share it. */
export const LAYER_ASPECT = 1357 / 2400;

/**
 * Placement for drawing the layer so its Earth disc lands on a circle of
 * radius `r` centred at (x, y). Returns the image box to draw.
 */
export function earthBox(x: number, y: number, r: number) {
  const w = (r * 2) / LAYER.d;
  const h = w * LAYER_ASPECT;
  return {x: x - LAYER.cx * w, y: y - LAYER.cy * h, w, h};
}
