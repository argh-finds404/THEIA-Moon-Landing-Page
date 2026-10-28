import Lenis from 'lenis';

/**
 * One rAF loop for the whole page. Lenis advances first, then every
 * scroll-driven component reads its own rect and writes styles directly —
 * nothing here goes through React state, so scrolling never re-renders.
 */

type Tick = (time: number) => void;

const subscribers = new Set<Tick>();
let lenis: Lenis | null = null;
let isLocked = false;

/**
 * Scroll locks are keyed, so independent holders (the preloader, a modal
 * drawer) never release each other's lock. Scroll runs only when none remain.
 */
const locks = new Set<string>();

export function setScrollLocked(locked: boolean, key = 'preloader') {
  if (locked) locks.add(key);
  else locks.delete(key);
  isLocked = locks.size > 0;
  if (lenis) {
    if (isLocked) {
      lenis.stop();
    } else {
      lenis.start();
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.style.overflow = !lenis && isLocked ? 'hidden' : '';
  }
}

export function startScroll(reducedMotion: boolean): () => void {
  if (!reducedMotion) {
    lenis = new Lenis({lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9});
    if (isLocked) {
      lenis.stop();
    }
  } else if (isLocked && typeof document !== 'undefined') {
    document.documentElement.style.overflow = 'hidden';
  }

  let raf = 0;
  const loop = (time: number) => {
    raf = requestAnimationFrame(loop);
    try {
      lenis?.raf(time);
    } catch (err) {
      console.error('Lenis scroll error:', err);
    }
    subscribers.forEach((fn) => {
      try {
        fn(time);
      } catch (err) {
        console.error('onFrame subscriber error:', err);
      }
    });
  };
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    lenis?.destroy();
    lenis = null;
    if (typeof document !== 'undefined') {
      document.documentElement.style.overflow = '';
    }
  };
}

export function onFrame(fn: Tick): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Smooth-scrolls to an in-page hash like `#missions`, or to the top for `#top`. */
export function scrollToHash(hash: string) {
  const target = hash === '#top' ? 0 : document.querySelector<HTMLElement>(hash);
  if (target === null) return;
  if (lenis) {
    // Scale with distance: short hops stay snappy, long jumps across many
    // pinned chapters get time to read as travel instead of a smear.
    const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
    const screens = Math.abs(top - window.scrollY) / Math.max(1, window.innerHeight);
    const duration = Math.min(2.6, 0.9 + screens * 0.09);
    lenis.scrollTo(target, {duration, easing: (t) => 1 - Math.pow(1 - t, 4)});
  } else if (typeof target === 'number') {
    window.scrollTo({top: target});
  } else {
    target.scrollIntoView();
  }
  history.replaceState(null, '', hash === '#top' ? ' ' : hash);
}
