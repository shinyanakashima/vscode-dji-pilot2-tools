import React, { useState } from 'react';
import { Waypoint } from './types';
import Header from './components/Header';
import MapView from './components/MapView';
import WaypointTable from './components/WaypointTable';

interface Props {
  waypoints: Waypoint[];
  filename: string;
  hasWpml: boolean;
}

export default function App({ waypoints, filename, hasWpml }: Props) {
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  return (
    <>
      <Header filename={filename} count={waypoints.length} hasWpml={hasWpml} />
      <MapView waypoints={waypoints} onWaypointClick={setHighlightedIndex} />
      <WaypointTable waypoints={waypoints} highlightedIndex={highlightedIndex} />
    </>
  );
}
