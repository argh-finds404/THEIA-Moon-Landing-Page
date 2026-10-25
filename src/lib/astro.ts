/**
 * Just enough astronomy to keep the page honest: Moon phase and Earth–Moon
 * distance from mean lunar elements (Meeus, ch. 47, leading terms only).
 * Good to roughly half a day in phase and ~1,000 km in distance — the page
 * labels these readouts "approx."
 */

export const SYNODIC_DAYS = 29.530588853;
export const ANOMALISTIC_DAYS = 27.554549886;
export const MEAN_DISTANCE_KM = 384400;
export const ECCENTRICITY = 0.0549;
const C_KM_S = 299792.458;
const J2000 = Date.UTC(2000, 0, 1, 12);
const RAD = Math.PI / 180;

/** Fraction of a disc lit, given the Sun–body–observer phase angle. */
export const litFraction = (phaseAngle: number) => (1 + Math.cos(phaseAngle)) / 2;

export const lightSeconds = (km: number) => km / C_KM_S;

/** Index 0–7 into the eight named phases, 0 = new, 4 = full. */
export const phaseIndex = (age: number) => Math.round((age / SYNODIC_DAYS) * 8) % 8;

/** Distance on an ellipse of the Moon's mean shape, `days` after perigee. */
export function orbitDistance(daysFromPerigee: number) {
  const M = (2 * Math.PI * daysFromPerigee) / ANOMALISTIC_DAYS;
  // One Newton step on Kepler's equation is plenty at e = 0.055.
  let E = M + ECCENTRICITY * Math.sin(M);
  E -= (E - ECCENTRICITY * Math.sin(E) - M) / (1 - ECCENTRICITY * Math.cos(E));
  return MEAN_DISTANCE_KM * (1 - ECCENTRICITY * Math.cos(E));
}

export interface MoonState {
  /** Days since new moon. */
  age: number;
  /** Fraction of the Moon lit, seen from Earth. */
  moonLit: number;
  /** Fraction of the Earth lit, seen from the Moon — the complement. */
  earthLit: number;
  waxing: boolean;
  km: number;
  seconds: number;
}

export function moonAt(date: Date): MoonState {
  const d = (date.getTime() - J2000) / 86400000;
  const D = ((297.8502 + 12.1907491 * d) % 360) * RAD; // mean elongation
  const Mp = ((134.9634 + 13.0649929 * d) % 360) * RAD; // Moon's mean anomaly
  const km = 385001 - 20905 * Math.cos(Mp) - 3699 * Math.cos(2 * D - Mp) - 2956 * Math.cos(2 * D);
  const elong = ((D % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const moonLit = (1 - Math.cos(elong)) / 2;
  return {
    age: (elong / (2 * Math.PI)) * SYNODIC_DAYS,
    moonLit,
    earthLit: 1 - moonLit,
    waxing: elong < Math.PI,
    km,
    seconds: lightSeconds(km),
  };
}

/**
 * The point on Earth with the Moon directly overhead — the middle of the
 * face the Moon sees. Mean elements plus the largest longitude term and
 * Greenwich mean sidereal time: good to a degree or two.
 */
export function subLunarPoint(date: Date) {
  const d = (date.getTime() - J2000) / 86400000;
  const L = (218.3165 + 13.17639648 * d) * RAD;
  const Mp = (134.9634 + 13.0649929 * d) * RAD;
  const F = (93.272 + 13.2293502 * d) * RAD;
  const lambda = L + 6.289 * RAD * Math.sin(Mp);
  const beta = 5.128 * RAD * Math.sin(F);
  const eps = 23.4393 * RAD;
  const ra = Math.atan2(Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lambda));
  const dec = Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda));
  const gmst = (280.46061837 + 360.98564736629 * d) * RAD;
  const lon = ((((ra - gmst) / RAD + 180) % 360) + 360) % 360 - 180;
  return {lat: dec / RAD, lon};
}

/**
 * SVG path of the lit part of a disc. `lit` is 0–1; `rightLit` puts the
 * bright limb on the right (a waxing Moon, seen from the north).
 */
export function phasePath(cx: number, cy: number, r: number, lit: number, rightLit = true) {
  const w = r * Math.abs(1 - 2 * lit);
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;
  const limb = rightLit ? 1 : 0;
  // Crescent: the terminator bows toward the lit limb; gibbous: away from it.
  const term = (lit < 0.5) === rightLit ? 0 : 1;
  return `M${top} A${r} ${r} 0 0 ${limb} ${bottom} A${w.toFixed(3)} ${r} 0 0 ${term} ${top} Z`;
}
