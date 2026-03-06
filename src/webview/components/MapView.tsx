import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import * as DeckGL from 'deck.gl';
import { Waypoint } from '../types';

type BasemapKey = 'seamless' | 'std' | 'osm';

const BASEMAPS: Record<BasemapKey, { tiles: string[]; attribution: string }> = {
  seamless: { tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'], attribution: '© 国土地理院' },
  std:      { tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],          attribution: '© 国土地理院' },
  osm:      { tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],                    attribution: '© OpenStreetMap contributors' },
};

function makeStyle(key: BasemapKey) {
  const bm = BASEMAPS[key];
  return {
    version: 8,
    sources: { basemap: { type: 'raster', tiles: bm.tiles, tileSize: 256, attribution: bm.attribution } },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

function getWpColor(i: number, total: number): [number, number, number] {
  if (i === 0) { return [0, 204, 68]; }
  if (i === total - 1) { return [255, 68, 68]; }
  return [0, 170, 255];
}

interface Props {
  waypoints: Waypoint[];
  onWaypointClick: (index: number | null) => void;
}

export default function MapView({ waypoints, onWaypointClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const is3DRef = useRef(true);
  const [is3D, setIs3D] = useState(true);
  const [basemap, setBasemap] = useState<BasemapKey>('seamless');

  function buildLayers(is3D: boolean) {
    const getZ = (w: Waypoint) => is3D ? w.alt : 0;
    const wpData = waypoints.map((w, i) => ({ ...w, color: getWpColor(i, waypoints.length) }));

    return [
      new DeckGL.PathLayer({
        id: 'ground-path',
        data: [{ path: waypoints.map(w => [w.lon, w.lat, 0]) }],
        getPath: (d: any) => d.path,
        getColor: [0, 170, 255, 60],
        getWidth: 2,
        widthMinPixels: 1,
      }),
      new DeckGL.LineLayer({
        id: 'drop-lines',
        data: is3D ? waypoints : [],
        getSourcePosition: (w: Waypoint) => [w.lon, w.lat, 0],
        getTargetPosition: (w: Waypoint) => [w.lon, w.lat, w.alt],
        getColor: [200, 200, 200, 120],
        getWidth: 1,
        widthMinPixels: 1,
      }),
      new DeckGL.PathLayer({
        id: 'flight-path',
        data: [{ path: waypoints.map(w => [w.lon, w.lat, getZ(w)]) }],
        getPath: (d: any) => d.path,
        getColor: [0, 170, 255],
        getWidth: 3,
        widthMinPixels: 2,
      }),
      new DeckGL.ScatterplotLayer({
        id: 'waypoints',
        data: wpData,
        getPosition: (w: any) => [w.lon, w.lat, getZ(w)],
        getFillColor: (w: any) => w.color,
        getLineColor: [255, 255, 255],
        stroked: true,
        getLineWidth: 2,
        lineWidthMinPixels: 1,
        getRadius: 4,
        radiusMinPixels: 4,
        pickable: true,
        onClick: ({ object }: any) => { onWaypointClick(object ? object.index : null); },
        onHover: ({ object }: any) => {
          if (mapRef.current) { mapRef.current.getCanvas().style.cursor = object ? 'pointer' : ''; }
        },
      }),
      new DeckGL.TextLayer({
        id: 'arrows',
        data: (() => {
          const arr = [];
          for (let i = 0; i < waypoints.length - 1; i++) {
            const a = waypoints[i], b = waypoints[i + 1];
            const midLat = (a.lat + b.lat) / 2;
            const cosLat = Math.cos(midLat * Math.PI / 180);
            const angleDeg = Math.atan2(b.lat - a.lat, (b.lon - a.lon) * cosLat) * (180 / Math.PI);
            arr.push({ pos: [(a.lon + b.lon) / 2, midLat, (getZ(a) + getZ(b)) / 2], angleDeg });
          }
          return arr;
        })(),
        getPosition: (d: any) => d.pos,
        getText: () => '▶',
        getAngle: (d: any) => d.angleDeg,
        getSize: 11,
        getColor: [0, 200, 255],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontSettings: { sdf: true },
        outlineWidth: 2,
        outlineColor: [0, 0, 0, 150],
      }),
      new DeckGL.TextLayer({
        id: 'labels',
        data: waypoints,
        getPosition: (w: Waypoint) => [w.lon, w.lat, getZ(w) + (is3D ? 8 : 2)],
        getText: (w: Waypoint, { index }: { index: number }) =>
          index === 0 ? 'Start' : index === waypoints.length - 1 ? `End(${w.index})` : String(w.index),
        getSize: 13,
        getColor: [255, 255, 255],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        fontWeight: 'bold',
        fontSettings: { sdf: true },
        outlineWidth: 3,
        outlineColor: [0, 0, 0, 200],
      }),
    ];
  }

  useEffect(() => {
    const center = waypoints[Math.floor(waypoints.length / 2)];
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: makeStyle('seamless'),
      center: [center.lon, center.lat],
      zoom: 15,
      pitch: 0,
      bearing: 0,
    });
    mapRef.current = map;

    map.on('load', () => {
      // 初期ロードは最小限のレイヤーで 2D のみ
      // 3D レイヤーは後から追加
      const minimalLayers = [
        new DeckGL.PathLayer({
          id: 'ground-path',
          data: [{ path: waypoints.map(w => [w.lon, w.lat, 0]) }],
          getPath: (d: any) => d.path,
          getColor: [0, 170, 255, 60],
          getWidth: 2,
          widthMinPixels: 1,
        }),
        new DeckGL.ScatterplotLayer({
          id: 'waypoints',
          data: waypoints.map((w, i) => ({ ...w, color: getWpColor(i, waypoints.length) })),
          getPosition: (w: any) => [w.lon, w.lat, 0],
          getFillColor: (w: any) => w.color,
          getLineColor: [255, 255, 255],
          stroked: true,
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          getRadius: 4,
          radiusMinPixels: 4,
          pickable: true,
          onClick: ({ object }: any) => { onWaypointClick(object ? object.index : null); },
          onHover: ({ object }: any) => {
            if (mapRef.current) { mapRef.current.getCanvas().style.cursor = object ? 'pointer' : ''; }
          },
        }),
      ];

      const overlay = new MapboxOverlay({ layers: minimalLayers });
      overlayRef.current = overlay;
      map.addControl(overlay);
      map.addControl(new maplibregl.NavigationControl());

      const coords = waypoints.map(w => [w.lon, w.lat]);
      const bounds = coords.reduce(
        (b: any, c: any) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 40 });

      // 3D レイヤーを 500ms 後に遅延ロード
      setTimeout(() => {
        overlayRef.current?.setProps({ layers: buildLayers(is3DRef.current) });
        if (is3DRef.current) {
          map.easeTo({ pitch: 60, bearing: -20, duration: 800 });
        }
      }, 500);
    });

    return () => map.remove();
  }, []);

  const toggle3D = () => {
    const next = !is3DRef.current;
    is3DRef.current = next;
    setIs3D(next);
    mapRef.current?.easeTo({ pitch: next ? 60 : 0, bearing: next ? -20 : 0, duration: 500 });
    overlayRef.current?.setProps({ layers: buildLayers(next) });
  };

  const switchBasemap = (key: BasemapKey) => {
    setBasemap(key);
    mapRef.current?.setStyle(makeStyle(key));
    mapRef.current?.once('style.load', () => {
      overlayRef.current?.setProps({ layers: buildLayers(is3DRef.current) });
    });
  };

  const BASEMAP_LABELS: Record<BasemapKey, string> = {
    seamless: '地理院 航空写真',
    std: '地理院 標準地図',
    osm: 'OpenStreetMap',
  };

  return (
    <div id="map-wrap">
      <div ref={containerRef} id="map" />
      <div id="basemap-switcher">
        {(Object.keys(BASEMAPS) as BasemapKey[]).map(key => (
          <button
            key={key}
            data-key={key}
            className={basemap === key ? 'active' : undefined}
            onClick={() => switchBasemap(key)}
          >
            {BASEMAP_LABELS[key]}
          </button>
        ))}
        <div className="separator" />
        <button id="btn-3d" className={is3D ? 'active' : undefined} onClick={toggle3D}>
          3D 表示 {is3D ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
