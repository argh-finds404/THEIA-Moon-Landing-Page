import {useEffect} from 'react';
import {Header} from './components/Chrome';
import {Earthrise} from './components/Earthrise';
import {FlightRail} from './components/FlightRail';
import {Footer} from './components/Footer';
import {Ignition} from './components/Ignition';
import {Legends} from './components/Legends';
import {MissionLog} from './components/MissionLog';
import {Missions} from './components/Missions';
import {MoonSites} from './components/MoonSites';
import {Opener} from './components/Opener';
import {Orbit} from './components/Orbit';
import {Reserve} from './components/Reserve';
import {Signal} from './components/Signal';
import {Trajectory} from './components/Trajectory';
import {useReducedMotion} from './hooks/useReducedMotion';
import {startScroll} from './lib/scroll';

export default function App() {
  const reduced = useReducedMotion();
  useEffect(() => startScroll(reduced), [reduced]);

  return (
    <>
      <Opener />
      <Header />
      <FlightRail />
      <main>
        <Earthrise />
        <Ignition />
        <MissionLog />
        <Orbit />
        <Signal />
        <Trajectory />
        <Legends />
        <MoonSites />
        <Missions />
        <Reserve />
      </main>
      <Footer />
    </>
  );
}
