import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// JSZip is loaded dynamically to avoid bundling issues in extension host
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

async function loadKmzToWebview(filePath: string, webview: vscode.Webview): Promise<void> {
  let kmlContent: string | null = null;
  let wpmlContent: string | null = null;

  try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
      if (name.endsWith('template.kml')) {
        kmlContent = await file.async('string');
      } else if (name.endsWith('waylines.wpml')) {
        wpmlContent = await file.async('string');
      }
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to read KMZ file: ${err}`);
    return;
  }

  if (!kmlContent) {
    vscode.window.showErrorMessage('template.kml not found in KMZ.');
    return;
  }

  const waypoints = parseKmlWaypoints(kmlContent);
  if (waypoints.length === 0) {
    vscode.window.showErrorMessage('No waypoints found in template.kml.');
    return;
  }

  webview.html = buildWebviewHtml(waypoints, path.basename(filePath), wpmlContent !== null);
}

class KmzEditorProvider implements vscode.CustomReadonlyEditorProvider {
  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    await loadKmzToWebview(document.uri.fsPath, webviewPanel.webview);
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Register as default editor for .kmz files (double-click to open)
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'dji-pilot2-tools.kmzViewer',
      new KmzEditorProvider(),
      { webviewOptions: { enableScripts: true } }
    )
  );

  // Keep right-click command as fallback
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'dji-pilot2-tools.openKmzViewer',
      async (uri?: vscode.Uri) => {
        let fileUri = uri;
        if (!fileUri) {
          const editor = vscode.window.activeTextEditor;
          if (editor) { fileUri = editor.document.uri; }
        }
        if (!fileUri) {
          vscode.window.showErrorMessage('No KMZ file selected.');
          return;
        }
        if (!fileUri.fsPath.toLowerCase().endsWith('.kmz')) {
          vscode.window.showErrorMessage('Please select a .kmz file.');
          return;
        }
        const panel = vscode.window.createWebviewPanel(
          'djiKmzViewer',
          `KMZ: ${path.basename(fileUri.fsPath)}`,
          vscode.ViewColumn.One,
          { enableScripts: true }
        );
        await loadKmzToWebview(fileUri.fsPath, panel.webview);
      }
    )
  );
}

interface Waypoint {
  index: number;
  lon: number;
  lat: number;
  alt: number;
}

function parseKmlWaypoints(kml: string): Waypoint[] {
  const waypoints: Waypoint[] = [];
  // Match <Placemark> blocks
  const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/g;
  const coordRegex = /<coordinates>\s*([\d.,-]+)\s*<\/coordinates>/;
  const indexRegex = /<wpml:index>(\d+)<\/wpml:index>/;

  let match: RegExpExecArray | null;
  let autoIndex = 1;

  while ((match = placemarkRegex.exec(kml)) !== null) {
    const block = match[0];
    const coordMatch = coordRegex.exec(block);
    if (!coordMatch) { continue; }

    const parts = coordMatch[1].split(',');
    if (parts.length < 3) { continue; }

    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    const alt = parseFloat(parts[2]);

    const indexMatch = indexRegex.exec(block);
    const index = indexMatch ? parseInt(indexMatch[1]) : autoIndex;
    autoIndex++;

    waypoints.push({ index, lon, lat, alt });
  }

  // Sort by index
  waypoints.sort((a, b) => a.index - b.index);
  return waypoints;
}

function buildWebviewHtml(waypoints: Waypoint[], filename: string, hasWpml: boolean): string {
  const center = waypoints[Math.floor(waypoints.length / 2)];
  const waypointsJson = JSON.stringify(waypoints);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DJI Pilot 2 KMZ Viewer</title>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/deck.gl@9/dist.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #ccc; }
    #header { padding: 8px 12px; background: #252526; border-bottom: 1px solid #3c3c3c; display: flex; align-items: center; gap: 12px; }
    #header h1 { font-size: 13px; font-weight: 600; color: #e8e8e8; }
    #header .meta { font-size: 12px; color: #888; }
    #map-wrap { position: relative; height: calc(100vh - 80px); }
    #map { width: 100%; height: 100%; }
    #basemap-switcher { position: absolute; top: 8px; right: 8px; z-index: 10; display: flex; flex-direction: column; gap: 4px; }
    #basemap-switcher button { padding: 4px 10px; font-size: 11px; background: #252526cc; color: #ccc; border: 1px solid #555; border-radius: 3px; cursor: pointer; }
    #basemap-switcher button.active { background: #0061a4; color: #fff; border-color: #0061a4; }
    #basemap-switcher button:hover:not(.active) { background: #2d2d2d; }
    #basemap-switcher .separator { height: 1px; background: #555; margin: 2px 0; }
    #table-container { height: 80px; overflow-y: auto; background: #252526; border-top: 1px solid #3c3c3c; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #2d2d2d; color: #bbb; padding: 4px 8px; text-align: left; position: sticky; top: 0; }
    td { padding: 3px 8px; border-bottom: 1px solid #2d2d2d; color: #ccc; }
    tr:hover td { background: #2a2d2e; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px; }
    .badge-kmz { background: #0e7a0d; color: #fff; }
    .badge-wpml { background: #0061a4; color: #fff; }
    .maplibregl-popup-content { background: #252526; color: #ccc; font-size: 12px; border-radius: 4px; }
    .maplibregl-popup-tip { border-top-color: #252526 !important; border-bottom-color: #252526 !important; }
  </style>
</head>
<body>
  <div id="header">
    <h1>${filename}</h1>
    <span class="badge badge-kmz">KMZ</span>
    ${hasWpml ? '<span class="badge badge-wpml">WPML</span>' : ''}
    <span class="meta">${waypoints.length} waypoints</span>
  </div>
  <div id="map-wrap">
    <div id="map"></div>
    <div id="basemap-switcher">
      <button class="active" data-key="seamless" onclick="switchBasemap('seamless')">地理院 航空写真</button>
      <button data-key="std" onclick="switchBasemap('std')">地理院 標準地図</button>
      <button data-key="osm" onclick="switchBasemap('osm')">OpenStreetMap</button>
      <div class="separator"></div>
      <button id="btn-3d" class="active" onclick="toggle3D()">3D 表示 ON</button>
    </div>
  </div>
  <div id="table-container">
    <table>
      <thead><tr><th>#</th><th>Latitude</th><th>Longitude</th><th>Altitude (m)</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <script>
    const waypoints = ${waypointsJson};

    const BASEMAPS = {
      seamless: { tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'], attribution: '© 国土地理院' },
      std:      { tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],          attribution: '© 国土地理院' },
      osm:      { tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],                    attribution: '© OpenStreetMap contributors' }
    };

    function makeStyle(key) {
      const bm = BASEMAPS[key];
      return {
        version: 8,
        sources: { basemap: { type: 'raster', tiles: bm.tiles, tileSize: 256, attribution: bm.attribution } },
        layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }]
      };
    }

    const map = new maplibregl.Map({
      container: 'map',
      style: makeStyle('seamless'),
      center: [${center.lon}, ${center.lat}],
      zoom: 15
    });

    let currentBasemap = 'seamless';
    let is3D = true;
    let deckOverlay = null;
    let currentPopup = null;

    function getWpColor(i) {
      if (i === 0) return [0, 204, 68];
      if (i === waypoints.length - 1) return [255, 68, 68];
      return [0, 170, 255];
    }

    function buildDeckLayers() {
      const getZ = w => is3D ? w.alt : 0;
      const wpData = waypoints.map((w, i) => ({ ...w, color: getWpColor(i) }));
      return [
        // Ground shadow path (faint, always at z=0)
        new deck.PathLayer({
          id: 'ground-path',
          data: [{ path: waypoints.map(w => [w.lon, w.lat, 0]) }],
          getPath: d => d.path,
          getColor: [0, 170, 255, 60],
          getWidth: 2,
          widthMinPixels: 1
        }),
        // Vertical drop lines: ground → waypoint altitude (3D only)
        new deck.LineLayer({
          id: 'drop-lines',
          data: is3D ? waypoints : [],
          getSourcePosition: w => [w.lon, w.lat, 0],
          getTargetPosition: w => [w.lon, w.lat, w.alt],
          getColor: [200, 200, 200, 120],
          getWidth: 1,
          widthMinPixels: 1
        }),
        // 3D flight path at altitude
        new deck.PathLayer({
          id: 'flight-path',
          data: [{ path: waypoints.map(w => [w.lon, w.lat, getZ(w)]) }],
          getPath: d => d.path,
          getColor: [0, 170, 255],
          getWidth: 3,
          widthMinPixels: 2
        }),
        // Waypoint spheres at altitude
        new deck.ScatterplotLayer({
          id: 'waypoints',
          data: wpData,
          getPosition: w => [w.lon, w.lat, getZ(w)],
          getFillColor: w => w.color,
          getLineColor: [255, 255, 255],
          stroked: true,
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          getRadius: 4,
          radiusMinPixels: 4,
          pickable: true,
          onClick: ({ object }) => {
            if (!object) { return; }
            if (currentPopup) { currentPopup.remove(); }
            currentPopup = new maplibregl.Popup({ closeButton: true })
              .setLngLat([object.lon, object.lat])
              .setHTML(\`<b>WP \${object.index}</b><br>Lat: \${object.lat.toFixed(7)}<br>Lon: \${object.lon.toFixed(7)}<br>Alt: \${object.alt.toFixed(1)} m\`)
              .addTo(map);
          },
          onHover: ({ object }) => { map.getCanvas().style.cursor = object ? 'pointer' : ''; }
        }),
        // Direction arrows at midpoint of each segment
        new deck.TextLayer({
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
          getPosition: d => d.pos,
          getText: () => '▶',
          getAngle: d => d.angleDeg,
          getSize: 11,
          getColor: [0, 200, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          fontSettings: { sdf: true },
          outlineWidth: 2,
          outlineColor: [0, 0, 0, 150]
        }),
        // Index labels floating above each sphere
        new deck.TextLayer({
          id: 'labels',
          data: waypoints,
          getPosition: w => [w.lon, w.lat, getZ(w) + (is3D ? 8 : 2)],
          getText: w => String(w.index),
          getSize: 13,
          getColor: [255, 255, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          fontWeight: 'bold',
          fontSettings: { sdf: true },
          outlineWidth: 3,
          outlineColor: [0, 0, 0, 200]
        })
      ];
    }

    map.on('load', () => {
      deckOverlay = new deck.MapboxOverlay({ layers: buildDeckLayers() });
      map.addControl(deckOverlay);
      map.addControl(new maplibregl.NavigationControl());
      const coords = waypoints.map(w => [w.lon, w.lat]);
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 40 });
      map.easeTo({ pitch: 60, bearing: -20, duration: 800 });
    });

    function toggle3D() {
      is3D = !is3D;
      map.easeTo({ pitch: is3D ? 60 : 0, bearing: is3D ? -20 : 0, duration: 500 });
      if (deckOverlay) { deckOverlay.setProps({ layers: buildDeckLayers() }); }
      const btn = document.getElementById('btn-3d');
      btn.classList.toggle('active', is3D);
      btn.textContent = is3D ? '3D 表示 ON' : '3D 表示 OFF';
    }

    function switchBasemap(key) {
      if (key === currentBasemap) { return; }
      currentBasemap = key;
      document.querySelectorAll('#basemap-switcher button[data-key]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.key === key);
      });
      map.setStyle(makeStyle(key));
      map.once('style.load', () => {
        if (deckOverlay) { deckOverlay.setProps({ layers: buildDeckLayers() }); }
      });
    }

    // Build table
    const tbody = document.getElementById('tbody');
    waypoints.forEach(w => {
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td>\${w.index}</td><td>\${w.lat.toFixed(7)}</td><td>\${w.lon.toFixed(7)}</td><td>\${w.alt.toFixed(1)}</td>\`;
      tbody.appendChild(tr);
    });
  </script>
</body>
</html>`;
}

export function deactivate() {}
