import React, { useEffect, useRef } from 'react';
import { Waypoint } from '../types';

interface Props {
  waypoints: Waypoint[];
  highlightedIndex: number | null;
}

export default function WaypointTable({ waypoints, highlightedIndex }: Props) {
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (highlightedIndex == null) { return; }
    rowRefs.current.get(highlightedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  return (
    <div id="table-container">
      <table>
        <thead>
          <tr><th>#</th><th>Latitude</th><th>Longitude</th><th>Altitude (m)</th></tr>
        </thead>
        <tbody>
          {waypoints.map(w => (
            <tr
              key={w.index}
              ref={el => { if (el) { rowRefs.current.set(w.index, el); } }}
              className={highlightedIndex === w.index ? 'highlight' : undefined}
            >
              <td>{w.index}</td>
              <td>{w.lat.toFixed(7)}</td>
              <td>{w.lon.toFixed(7)}</td>
              <td>{w.alt.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
