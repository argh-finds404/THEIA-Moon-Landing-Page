# THEIA — rules for AI agents

THEIA is a concept site for a fictional lunar-expedition brand: Vite 6 + React 19 + TypeScript, Tailwind v4 (tokens live in the `@theme` block of `src/index.css`; there is no tailwind.config), Lenis for smooth scroll. Every word of copy lives in `src/content.ts`.

## The three load-bearing ideas — never break them

1. **One rAF loop.** `src/lib/scroll.ts` advances Lenis, then calls every `onFrame(fn)` subscriber. Scroll-driven code subscribes with `onFrame`, reads its own position, and writes styles / `textContent` straight through refs. No `useState`, `useReducer` or context updates while scrolling. (The one existing exception is `Trajectory`'s `setLeg`, which only fires when the leg index changes — keep it that way.) Never add a second rAF loop, a scroll listener, GSAP, Motion, ScrollTrigger or any other animation library.
2. **The hero is layers, not video.** Six layers cut from one render, pinned and moved at different rates (`Earthrise.tsx`). Depth comes from layers sliding past each other. No film, no WebGL — unless a task explicitly asks for an opt-in experiment, and then the DOM layers stay as the fallback.
3. **Things are drawn from scroll progress, not timers.** `Trajectory.tsx` inks its legs and moves the capsule as pure functions of `pinProgress`; `Ignition.tsx` places every smoke puff from it, so scrolling back un-billows the smoke. Only ambient life (flame flicker, venting, water shimmer, the Earth's spin in Orbit, the Moon's idle turn in Landing sites) ticks with time, and it stops under reduced motion.

## Conventions

- **Pinned chapter recipe.** A tall `<section style={{height: `${SECTION_VH}svh`}}>` with a `sticky top-0 h-screen-s overflow-hidden` child. In `useEffect`, `return onFrame(...)`. Inside: get `{p, rect, vh}` from `pinProgress(root)`; return early if `rect.bottom < 0 || rect.top > vh`; return early if `Math.abs(p - lastP) < 0.00005`; shape `p` with `range`, `lerp`, `easeOutCubic` from `src/lib/math.ts`; write to refs. Budget: one idea per chapter, at most ~300svh each — the pinned sections already add up to ~18 screens of scroll (Earthrise 410, Ignition 340, Log 340, Orbit 300, Trajectory 380).
- **One element, one transform writer.** If a second effect (pointer parallax, tilt, shake) must move something scroll already transforms, put it on a wrapper element. Never write `style.transform` from two places on the same node.
- **Static sections** use `useReveals` + `data-reveal` for their entrance, not scroll maths.
- **Copy** goes in `src/content.ts`. Components import it; they don't hard-code sentences.
- **Facts stay true.** A number shown as physics (distance, light lag, Earth elevation, phase, temperature) is computed or sourced, or it is labelled illustrative. The concept-brand disclaimers stay on the page.
- **Dependencies.** No new runtime dependency without asking first. Dev-only tooling for scripts (e.g. `sharp`) is fine.
- **Accessibility.** Keep every `aria-label`, `aria-hidden` and `alt`. Decorative layers are `aria-hidden`. Every new motion has a reduced-motion branch (`useReducedMotion` in JS, `motion-reduce:` or the media query in CSS) and a static fallback. Keyboard and screen-reader paths keep working. Sound is opt-in and off by default.
- **Type and colour.** Michroma (display, always tracked out), Manrope (text), IBM Plex Mono (telemetry). Colours come from the `@theme` tokens: `void`, `void-2`, `regolith`, `dust`, `earth`, `sunlit`, and `ember` — only for things that burn. Keep the Google Fonts `<link>`s in `index.html` as they are.

## Assets

- Hero layers: `public/layers/{d,m}/<name>.webp`, names `sky, earth, moonscape, frame, astronaut, ground`. `d` = 2400×1357, `m` = 1280×724 — both are landscape. All layers share one crop (`object-cover`, `object-[58%_50%]` on phones), which is what keeps them registered. **Never resize or re-crop one layer on its own.** On a phone only the ~43–69% band of the width is visible, so keep the subject there.
- `src/lib/earth.ts` records where the Earth disc sits inside its layer (`LAYER = {cx: 0.657, cy: 0.498, d: 0.401}`); `Trajectory` and the footer draw the disc through `earthBox()`. If `earth.webp` is regenerated, re-measure its alpha bounding box and update `LAYER`.
- The opener (`Opener.tsx`) waits only for the layers the first frame shows (`sky`, `earth`, `moonscape`) plus fonts. If the hero's first frame changes, update that list.
- Moon phase, Earth–Moon distance and light time come from `src/lib/astro.ts`. Use it rather than hard-coding a number shown as physics.
- **Legends** (`Legends.tsx`) is the one section of real history: every date, figure and credit in `content.legends` is sourced, not illustrative — keep it that way, and keep each item's credit line. Stills are built from masters in `raw/legends/` with `node scripts/build-legends.mjs` (crops live in that script); the script's header lists every source and how the two clips were cut. Use only public-domain or credit-only media (NASA, LROC); never hotlink.
- **Legends motion.** The strip is an inertial, looping track whose position and breathing (card scale from track and page speed) run in the shared `onFrame` loop and write styles directly — no state. Its one-shot sequences (the deal when it first enters view, the open/close morph into the dossier) use the browser's Web Animations API (`element.animate`), which is native, not an animation library. Keep one writer per property per element: `<li>` = track offset, its wrapper = breathing scale, `.legend-deal` = sequences, `.legend-stage` = CSS hover. If you regenerate a Legends still, update its crop numbers in `CROP` (the build script prints them) or the morph will jump.
- **Footer globe** (`EarthGlobe.tsx`) draws the Earth per pixel on a 2D canvas from `public/media/earth/{day,night}.webp` (NASA Blue Marble with clouds, Black Marble city lights), built by `node scripts/build-earth.mjs` from masters in `raw/earth/`. Lit fraction, lit side and the starting face (`subLunarPoint` in `astro.ts`) are computed; only the spin is sped up, and the copy says so.
- **Signal** (`Signal.tsx`, after Orbit): Houston and the crew side by side with the laser link between. Each message is held for the one-way light time from `moonAt()` before the crew side shows it, and the answer for as long again. The delay is real; the replies are scripted and the page says so. No windows, no network.
- **Mission plaque** (`MissionPlaque.tsx`) lives in Reserve beside the form and is engraved live from it — name in binary round the rim, a harmonograph of the lunar month against the mission's days. Mission is a radio group (`#reserve input[name="mission"]`); Missions' cards click it. Sound only on click; PNG export is client-side.
- **Real sky.** The starfield behind the hero's exit and the Orbit scene is NASA's Deep Star Map 2020 (the Milky Way's core), cut by `node scripts/build-stars.mjs` into `public/media/space/stars-{d,m}.webp`; the script header says where the master comes from. The hero ends by tilting up into it: the painted sky dissolves in place (sliding it would show its edge) and the foreground layers fall away. Don't bring back a flat black exit.
- **WebGL scenes.** Orbit and Landing sites are WebGL2 (`src/lib/gl.ts`: one full-screen triangle, one fragment shader, no library), drawn from the shared `onFrame` loop only while on screen and only when something changed, within a pixel budget. Each keeps a static fallback for when WebGL2 is missing: Orbit shows NASA's Artemis II photo (its readouts still run), Landing sites shows `moon-poster.webp` with working pins. Their maps (`public/media/space/`) come from NASA masters in `raw/` via `node scripts/build-space.mjs`, whose header lists every source.
- **Orbit** (`Orbit.tsx`): the Earth seen from out by the Moon while scroll swings the Sun round through the month. The Sun, both bodies' lighting and every readout come from one elongation angle; sizes aren't to scale and the spin is sped up, and the note says so.
- **Landing sites** (`MoonSites.tsx`, after Legends): every landing from `content.legends` pinned on the Moon at its touchdown coordinates (`COORDS`), plus the concept site Mare Marginis where the hero is set. The pins are DOM buttons placed from the same view rotation as the shader; the list is the keyboard and screen-reader path. `moon-poster.webp` is rendered by the build script with the same view, light and shading as the shader — change one, change both, or the swap from poster to live Moon will jump.

## Production

- `vite.config.ts` injects a Content-Security-Policy meta tag into the build only (dev needs React refresh's inline script). The site loads only its own bundle and media plus Google Fonts. Adding a third-party script, font, image or API means updating that policy — and sending it as an HTTP header too if the host allows.
- Builds ship without source maps.

## Secrets

- No keys, tokens or credentials in the repo — not in code, not in comments. They live in `secrets/` or `.env*` files, which `.gitignore` excludes (`.env.example` documents names without values). `.cursor/` is ignored too; its `mcp.json` holds a local API key.
- Nothing in the browser bundle may need a secret: Vite exposes `VITE_*` variables to every visitor, so never put a key behind that prefix.
- New or changed images: raw masters live in `raw/` (git-ignored). Build with `node scripts/build-layers.mjs raw/<set> [--out dir] [--alpha-from public/layers] [--size WxH]`. A variant that must line up with an existing layer reuses that layer's alpha via `--alpha-from`.
- Never hotlink images or scripts. Don't commit a hero layer over ~600 KB without saying why. Load anything below the fold lazily.
- Never ask an image model to draw text. Labels are HTML.

## Definition of done — check before saying "done"

1. `npm run lint` and `npm run build` are clean.
2. No sideways scroll at 390, 768, 1280 and 1920 px wide.
3. Scroll slowly from top to bottom: nothing pops in late or flickers, and the React Profiler shows no commits while scrolling.
4. The dust clears before the Earth starts to rise, and the reel's centre frame is always the one in focus.
5. With `prefers-reduced-motion: reduce` the page still reads and works.
