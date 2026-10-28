/**
 * Every word on the page. THEIA is a concept brand — names, dates and
 * missions are illustrative placeholders, and the page says so.
 */

export const brand = {
  name: 'Theia',
  wordmark: 'THEIA',
  email: 'crew@theia.space',
};

export const nav = [
  {label: 'Ignition', href: '#ignition'},
  {label: 'Log', href: '#log'},
  {label: 'Orbit', href: '#orbit'},
  {label: 'Trajectory', href: '#trajectory'},
  {label: 'Legends', href: '#legends'},
  {label: 'Missions', href: '#missions'},
  {label: 'Reserve', href: '#reserve'},
];

/** The eight named phases, indexed 0 = new … 4 = full (see lib/astro). */
export const phases = [
  'New',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
];

/** The loader: the Moon waxes as the Earthrise loads, then opens onto it. */
export const opener = {
  loading: 'Loading the Earthrise',
  skip: 'Tap or press any key to skip',
};

export const hero = {
  title: 'EARTHRISE',
  kicker: 'A concept for lunar expeditions',
  /**
   * Near the eastern limb the Earth sits on the horizon, and libration rocks
   * it above and below over the month — one of the few places on the Moon
   * where the Earth really rises.
   */
  site: 'Mare Marginis · 13.3°N 86.1°E',
  elevLabel: 'Above horizon · time-lapse',
  prompt: 'Scroll to clear the dust',
};

/** Launch chapter. Vehicle figures are illustrative, and labelled so on the page. */
export const ignition = {
  eyebrow: 'Launch sequence',
  heading: 'Ten seconds of fire to leave the cradle.',
  note: 'Illustrative telemetry',
  stages: [
    {
      title: 'Load and hold',
      body: 'Liquid oxygen and methane chill the engines to flight temperature. The access arm swings away.',
    },
    {
      title: 'Ignition and liftoff',
      body: 'Nine engines light, thrust builds against the clamps, and the clamps let go.',
    },
    {
      title: 'Staging',
      body: 'Past max-Q the booster shuts down and falls away. The upper stage lights on its own.',
    },
  ],
};

/** One lunar month around the Earth. Every readout here is computed. */
export const orbit = {
  eyebrow: 'Orbit',
  heading: 'From the Moon, the Earth has phases too.',
  body: 'Sunlight sweeps across the Earth as the month turns. When the Moon is full, the Earth is new — a dark globe strung with city lights, ringed by sunrise burning in its atmosphere. From Base Tranquillity it hangs about 66° up the sky all month and never sets; only its phase changes.',
  day: 'Day',
  of: 'of 29.5',
  moonFromEarth: 'Moon from Earth',
  earthFromBase: 'Earth from the base',
  distance: 'Distance',
  delay: 'Signal delay',
  drag: 'Drag to turn the Earth',
  note: 'Not to scale; the Earth’s spin is sped up. Phases, distance and delay are computed for each day of the month. Maps: NASA Blue Marble, Black Marble, LRO.',
  sceneLabel: 'The Earth seen from near the Moon. As you scroll, the Sun moves behind the Earth: its lit crescent thins until it is a dark globe of city lights ringed by glowing atmosphere, then the Sun breaks out on the other side. The Moon, lit by the same Sun, hangs nearby.',
  fallbackAlt: 'The Earth setting behind the Moon, photographed by the Artemis II crew in April 2026.',
};

/**
 * Signal: talk to the crew. The delay is real (tonight's Earth–Moon light
 * time); the crew's answers are scripted, and the page says so.
 */
export const signal = {
  eyebrow: 'Signal',
  heading: 'Say something to the Moon.',
  body: (km: string, s: string) => `Tonight the Moon is ${km} km away. Light needs ${s} seconds to cross that — so does every word you send, and every word that comes back.`,
  earth: 'Houston',
  earthWhere: 'Earth',
  earthStation: 'Goldstone Deep Space Station',
  earthTerminal: '1550 nm Optical Uplink',
  moon: 'Theia crew',
  moonWhere: 'Moon',
  moonStation: 'Tranquillity Base Terminal',
  moonTerminal: 'Lunar Transceiver Array',
  carrierSpeed: 'Speed of light c = 299,792 km/s',
  conceptBadge: 'Relativistic Light-Lag Physics',
  conceptExplanation: 'Radio & laser signals travel at 299,792 km/s. Across cislunar space, every photon requires real travel time to arrive.',
  chips: ['Ping', 'Good morning, Theia', 'How’s the view?'],
  label: 'Message to the crew',
  placeholder: 'Type a message',
  send: 'Send',
  distance: 'Distance',
  oneWay: 'One way',
  roundTrip: 'Round trip',
  link: 'Laser link',
  lag: (s: string) => `Hears Houston ${s} s late`,
  inFlight: 'In flight',
  delivered: (s: string) => `Reached the Moon, +${s} s`,
  answered: (s: string) => `Answer reached you, +${s} s`,
  heard: (s: string) => `Heard ${s} s after you sent it`,
  replyOut: 'Reply on its way to Earth',
  replyIn: 'Reply reached Houston',
  emptyEarth: 'Nothing sent yet. Pick a line below or type your own.',
  emptyMoon: 'Listening.',
  note: 'The crew’s answers are scripted. The delay is not: it’s computed for tonight’s Earth–Moon distance.',
  replies: {
    ping: 'Pong. Theia reads you five by five.',
    greeting: 'Good morning, Houston. The Earth is beautiful from here.',
    view: 'The Earth is hanging over the ridge, blue and white. Unreal.',
    question: 'Stand by, Houston — we’ll come back to you on that.',
    other: 'Copy, Houston.',
  },
};

export const intro = {
  eyebrow: 'Mission log',
  heading: 'The first holiday that leaves the planet.',
  body: 'Four days out, a week on the surface, and one view nobody has ever forgotten. This is the trip, frame by frame.',
};

export const log = [
  {tag: 'T−0', title: 'Launch', body: 'Nine minutes of thunder, then silence and the curve of the Earth.', image: '/media/cards/m1-launch.webp'},
  {tag: 'Day 3', title: 'Lunar orbit', body: 'The far side scrolls past the window. Your hand on the glass.', image: '/media/cards/m2-orbit.webp'},
  {tag: 'Day 4', title: 'Base Tranquillity', body: 'Pressurised domes, a hot meal, and a skylight pointed home.', image: '/media/cards/m3-base.webp'},
  {tag: 'Day 5', title: 'First steps', body: 'Footprints that will outlast every building you have ever seen.', image: '/media/cards/m4-walk.webp'},
];

/** Legs of the Earth → Moon trajectory, in drawing order. */
export const trajectory = {
  eyebrow: 'Trajectory',
  heading: '384,400 km, drawn as you scroll.',
  legs: [
    {day: 'Day 0', title: 'Parking orbit', body: 'Two laps of the Earth while the crew and craft are checked.'},
    {day: 'Day 0', title: 'Trans-lunar injection', body: 'A six-minute burn and you are on your way. No turning back for three days.'},
    {day: 'Day 3', title: 'Lunar orbit insertion', body: 'The engine fires behind the Moon, out of contact with Earth. Then: capture.'},
    {day: 'Day 4', title: 'Descent', body: 'Twelve minutes from orbit to the dust of Tranquillity.'},
  ],
};

/**
 * Real missions that made it, in order. Unlike the rest of the page these
 * are not illustrative: every date, figure and credit is sourced (NASA,
 * LROC, ISRO, CNSA mission records). Photographs are NASA (public domain);
 * orbital frames are LRO, credit NASA/GSFC/Arizona State University.
 */
export const legends = {
  eyebrow: 'Legends',
  heading: 'Before you, they went.',
  body: 'Eight missions that turned the Moon from a light in the sky into a place. Open one to see what they saw.',
  hint: 'Drag, scroll sideways or use the arrows',
  back: 'Back to orbit',
  prev: 'Previous mission',
  next: 'Next mission',
  nextUp: 'Next',
  open: 'Open mission',
  film: 'Film',
  orbital: 'Seen from orbit',
  when: 'When',
  crew: 'Crew',
  craft: 'Spacecraft',
  where: 'Where',
  credit: 'Credit',
  playFilm: 'Play film',
  pauseFilm: 'Pause film',
  items: [
    {
      id: 'apollo8',
      name: 'Apollo 8',
      year: 1968,
      agency: 'NASA, USA',
      first: 'First people to orbit the Moon',
      when: '21–27 December 1968',
      who: 'Frank Borman, Jim Lovell, Bill Anders',
      crewed: true,
      where: 'Lunar orbit, about 110 km up',
      story:
        'On Christmas Eve, on their fourth orbit, the crew rolled the spacecraft and saw the Earth come up over the lunar horizon. Bill Anders asked for a roll of colour film and took the photograph that named this site.',
      stats: [
        ['Lunar orbits', '10'],
        ['Altitude', '≈110 km'],
        ['Mission', '6 d 3 h'],
      ],
      video: '/media/legends/apollo8-earthrise.mp4',
      poster: '/media/legends/apollo8-earthrise.webp',
      filmNote: 'The Earthrise recreated from LRO data, at 8× speed',
      credit:
        'Photo: NASA / Bill Anders, AS08-14-2383. Film: NASA Goddard Scientific Visualization Studio, the Earthrise recreated from LRO data, shown at 8× speed.',
    },
    {
      id: 'apollo11',
      name: 'Apollo 11',
      year: 1969,
      agency: 'NASA, USA',
      first: 'First people to walk on the Moon',
      when: '16–24 July 1969',
      who: 'Neil Armstrong, Buzz Aldrin, Michael Collins',
      crewed: true,
      where: 'Sea of Tranquility, 0.67°N 23.47°E',
      story:
        'Armstrong took manual control to fly Eagle past a boulder field and set down with less than a minute of fuel to spare. Six and a half hours later he stepped out; Aldrin followed, and Armstrong took this picture of him.',
      stats: [
        ['Moonwalk', '2 h 31 min'],
        ['Samples', '21.5 kg'],
        ['Mission', '8 d 3 h'],
      ],
      credit: 'Photo: NASA / Neil Armstrong, AS11-40-5903.',
    },
    {
      id: 'lunokhod1',
      name: 'Lunokhod 1',
      year: 1970,
      agency: 'Luna 17, USSR',
      first: 'First rover on another world',
      when: 'Landed 17 November 1970',
      who: 'Driven from Earth by a five-person crew',
      crewed: false,
      where: 'Sea of Rains, 38.24°N 35.00°W',
      story:
        'The eight-wheeled rover rolled down the Luna 17 lander’s ramps and was steered from Crimea, one command at a time, across a round-trip radio delay. It drove until September 1971. About forty years later NASA’s orbiter photographed the lander — with the rover’s tracks still looping around it.',
      stats: [
        ['Driven', '10.5 km'],
        ['Lunar days', '11'],
        ['TV images', '20,000+'],
      ],
      orbital: 'The Luna 17 lander and Lunokhod’s tracks, from NASA’s Lunar Reconnaissance Orbiter.',
      credit: 'NASA/GSFC/Arizona State University, LROC NAC M175502049R.',
    },
    {
      id: 'apollo15',
      name: 'Apollo 15',
      year: 1971,
      agency: 'NASA, USA',
      first: 'First car on the Moon',
      when: '26 July – 7 August 1971',
      who: 'David Scott, James Irwin, Alfred Worden',
      crewed: true,
      where: 'Hadley–Apennine, 26.13°N 3.63°E',
      story:
        'Apollo 15 unfolded the first Lunar Roving Vehicle and drove it to the edge of Hadley Rille and the foot of the Apennine mountains. Among the rock it brought home was the Genesis Rock, a piece of the Moon’s early crust.',
      stats: [
        ['Driven', '27.8 km'],
        ['Moonwalks', '18 h 35 min'],
        ['Samples', '77 kg'],
      ],
      credit: 'Photo: NASA / David Scott, AS15-86-11603. James Irwin at the rover, Mount Hadley behind.',
    },
    {
      id: 'apollo17',
      name: 'Apollo 17',
      year: 1972,
      agency: 'NASA, USA',
      first: 'The last time people walked on the Moon',
      when: '7–19 December 1972',
      who: 'Gene Cernan, Harrison Schmitt, Ronald Evans',
      crewed: true,
      where: 'Taurus–Littrow, 20.19°N 30.77°E',
      story:
        'Harrison Schmitt, a geologist, was the only professional scientist to walk on the Moon; here he stands beside a split boulder on the third moonwalk. On 14 December 1972 Cernan climbed in last. Nobody has stood on the Moon since.',
      stats: [
        ['On the surface', '75 h'],
        ['Moonwalks', '22 h 4 min'],
        ['Samples', '110.5 kg'],
      ],
      credit: 'Photo: NASA / Gene Cernan, AS17-140-21496.',
    },
    {
      id: 'change4',
      name: 'Chang’e 4',
      year: 2019,
      agency: 'CNSA, China',
      first: 'First landing on the far side',
      when: 'Landed 3 January 2019',
      who: 'Lander and the Yutu-2 rover',
      crewed: false,
      where: 'Von Kármán crater, 45.44°S 177.60°E',
      story:
        'The far side never faces Earth, so no radio can reach it directly. China first parked a relay satellite, Queqiao, beyond the Moon, then set the lander down inside Von Kármán crater. Its rover, Yutu-2, became the longest-lived rover on the Moon.',
      stats: [
        ['Crater', '186 km wide'],
        ['Relay', 'Earth–Moon L2'],
        ['Rover', 'Yutu-2'],
      ],
      orbital: 'The Chang’e 4 lander, between the arrows, from NASA’s Lunar Reconnaissance Orbiter on 1 February 2019.',
      credit: 'NASA/GSFC/Arizona State University, LROC NAC M1303570617.',
    },
    {
      id: 'chandrayaan3',
      name: 'Chandrayaan-3',
      year: 2023,
      agency: 'ISRO, India',
      first: 'First landing near the south pole',
      when: 'Landed 23 August 2023',
      who: 'Vikram lander and the Pragyan rover',
      crewed: false,
      where: '69.37°S 32.32°E, about 600 km from the pole',
      story:
        'Four years after Chandrayaan-2’s lander was lost, ISRO came back and touched down farther south than anyone before, making India the fourth nation to land on the Moon. Pragyan rolled out and confirmed sulphur in the soil.',
      stats: [
        ['From the pole', '≈600 km'],
        ['Rover drive', '100+ m'],
        ['Lander hop', '≈40 cm'],
      ],
      orbital: 'Vikram, at the centre of the box, from NASA’s Lunar Reconnaissance Orbiter on 27 August 2023.',
      credit: 'NASA/GSFC/Arizona State University, LROC NAC M1447750764.',
    },
    {
      id: 'artemis2',
      name: 'Artemis II',
      year: 2026,
      agency: 'NASA with CSA',
      first: 'The farthest anyone has travelled',
      when: '1–10 April 2026',
      who: 'Reid Wiseman, Victor Glover, Christina Koch, Jeremy Hansen',
      crewed: true,
      where: 'Around the Moon, 6 April 2026',
      story:
        'The first crew to leave Earth orbit since 1972 looped behind the far side and went farther from home than anyone in history, passing Apollo 13’s record. Christina Koch and Jeremy Hansen became the first woman and the first Canadian to travel to the Moon.',
      stats: [
        ['From Earth', '406,771 km'],
        ['Above the Moon', '6,545 km'],
        ['Mission', '9 days'],
      ],
      video: '/media/legends/artemis2-flyby.mp4',
      poster: '/media/legends/artemis2-flyby.webp',
      filmNote: 'Orion’s solar-array camera, flight day 6',
      videoFocus: '78% 50%',
      credit: 'Photo: NASA, art002e021278 — Earthset, taken by the crew during the flyby. Film: NASA, Orion solar-array camera, flight day 6.',
    },
  ],
};

/** Every landing from Legends, pinned on a 3D Moon at its real coordinates. */
export const sites = {
  eyebrow: 'Landing sites',
  heading: 'Every landing, on one Moon.',
  body: 'The six landings from Legends, pinned where they touched down. The near side always faces Earth; turn the Moon round to find Chang’e 4, the first landing on the far side.',
  drag: 'Drag to turn the Moon',
  facing: 'Facing',
  nearSide: 'Near side',
  farSide: 'Far side',
  concept: 'This page',
  marginis: {
    name: 'Mare Marginis',
    agency: 'THEIA concept site',
    first: 'Where this page’s Earthrise is set. Right at the edge of the near side, the Earth sits on the horizon and the Moon’s libration lifts it up and lets it down again.',
    where: 'Sea of the Edge, 13.3°N 86.1°E',
  },
  note: 'Moon: NASA LRO — LROC colour and LOLA relief, raised 2.2× and lit from a fixed angle so the craters read.',
  label: 'The Moon, with each landing site marked. Drag or use the arrow keys to turn it; pick a site from the list to fly to it.',
};

export const missions = {
  eyebrow: 'Missions',
  heading: 'Three ways to leave.',
  note: 'Concept missions — durations illustrative.',
  items: [
    {name: 'Orbiter', days: 6, lines: ['Two lunar orbits', 'Far-side flyover', 'Earthrise from orbit'], cta: 'Join the Orbiter list'},
    {name: 'Lander', days: 10, lines: ['Four nights at Base Tranquillity', 'Two surface EVAs', 'Rover run to the limb for Earthrise'], cta: 'Join the Lander list', featured: true},
    {name: 'Resident', days: 28, lines: ['A full lunar day and night', 'Rover traverse to the highlands', 'Science crew rotation'], cta: 'Join the Resident list'},
  ],
};

export const reserve = {
  eyebrow: 'Reserve',
  heading: 'Put your name on the manifest.',
  body: 'No payment, no commitment. Put your name down and we engrave your flight plaque as you type — it’s yours to keep either way.',
  /** Illustrative launch window for the countdown (the Apollo 11 anniversary). */
  window: '2031-07-20T20:17:00Z',
  windowLabel: 'Next launch window (concept)',
  nameHint: 'Engraved on your plaque',
};

/** The mission plaque under the reservation form. Generative art, not data. */
export const plaque = {
  placeholder: 'Your name',
  empty: 'Type your name in the form — it’s engraved around the rim as you type.',
  engraved: (name: string) => `Engraved for ${name}. The ring of ticks is your name in binary; the curve is the lunar month against your days aboard.`,
  play: 'Hear your orbit',
  playing: 'Playing…',
  download: 'Save plaque',
  chordHint: 'Plays the lunar month and your mission length as a chord — only when you press it. The plaque is drawn in your browser.',
  alt: (name: string, mission: string) => `Mission plaque for ${name}, ${mission} mission: a gold-rimmed black disc with the name in binary around the edge and an orbital curve in the centre.`,
};

export const footer = {
  from: (n: number) => (n === 0 ? 'From the Moon tonight' : n === 1 ? 'From the Moon tomorrow night' : `From the Moon in ${n} nights`),
  earthIs: (pct: number) => `The Earth is ${pct} percent lit.`,
  phase: 'Phase',
  distance: 'Distance',
  light: 'Light time',
  overhead: 'Moon overhead',
  spin: 'The globe turns 1,200× faster than real time, under a terminator that stays put; drag to turn it.',
  globeLabel: (pct: number, phase: string) => `The Earth seen from the Moon, ${pct} percent lit (${phase.toLowerCase()}), turning slowly. Night side shows city lights.`,
  scrub: 'Try another night',
  daysAhead: (n: number) => (n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : `In ${n} days`),
  approx: 'Computed in your browser from mean lunar elements. Approximate.',
  chapters: 'Chapters',
  missions: 'Missions',
  contact: 'Write to the crew',
  contactBody: 'Questions about the concept, or the view.',
  back: 'Back to the surface',
  disclaimer: 'THEIA is a design concept. There are no seats, launches or payments. Imagery was generated for this concept.',
};
