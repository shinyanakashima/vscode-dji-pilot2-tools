import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// JSZip is loaded dynamically to avoid bundling issues in extension host
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'dji-pilot2-tools.openKmzViewer',
    async (uri?: vscode.Uri) => {
      // Resolve file URI from explorer context or active editor
      let fileUri = uri;
      if (!fileUri) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          fileUri = editor.document.uri;
        }
      }
      if (!fileUri) {
        vscode.window.showErrorMessage('No KMZ file selected.');
        return;
      }

      const filePath = fileUri.fsPath;
      if (!filePath.toLowerCase().endsWith('.kmz')) {
        vscode.window.showErrorMessage('Please select a .kmz file.');
        return;
      }

      // Read and unzip KMZ
      let kmlContent: string | null = null;
      let wpmlContent: string | null = null;

      try {
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);

        // Find template.kml and waylines.wpml inside the KMZ
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

      // Parse waypoints from template.kml
      const waypoints = parseKmlWaypoints(kmlContent);
      if (waypoints.length === 0) {
        vscode.window.showErrorMessage('No waypoints found in template.kml.');
        return;
      }

      // Create WebView panel
      const panel = vscode.window.createWebviewPanel(
        'djiKmzViewer',
        `KMZ: ${path.basename(filePath)}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = buildWebviewHtml(waypoints, path.basename(filePath), wpmlContent !== null);
    }
  );

  context.subscriptions.push(disposable);
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DJI Pilot 2 KMZ Viewer</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #ccc; }
    #header { padding: 8px 12px; background: #252526; border-bottom: 1px solid #3c3c3c; display: flex; align-items: center; gap: 12px; }
    #header h1 { font-size: 13px; font-weight: 600; color: #e8e8e8; }
    #header .meta { font-size: 12px; color: #888; }
    #map { height: calc(100vh - 80px); }
    #table-container { height: 80px; overflow-y: auto; background: #252526; border-top: 1px solid #3c3c3c; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #2d2d2d; color: #bbb; padding: 4px 8px; text-align: left; position: sticky; top: 0; }
    td { padding: 3px 8px; border-bottom: 1px solid #2d2d2d; color: #ccc; }
    tr:hover td { background: #2a2d2e; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px; }
    .badge-kmz { background: #0e7a0d; color: #fff; }
    .badge-wpml { background: #0061a4; color: #fff; }
  </style>
</head>
<body>
  <div id="header">
    <h1>${filename}</h1>
    <span class="badge badge-kmz">KMZ</span>
    ${hasWpml ? '<span class="badge badge-wpml">WPML</span>' : ''}
    <span class="meta">${waypoints.length} waypoints</span>
  </div>
  <div id="map"></div>
  <div id="table-container">
    <table>
      <thead><tr><th>#</th><th>Latitude</th><th>Longitude</th><th>Altitude (m)</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <script>
    const waypoints = ${waypointsJson};
    const map = L.map('map').setView([${center.lat}, ${center.lon}], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 20
    }).addTo(map);

    // Draw flight path
    const latlngs = waypoints.map(w => [w.lat, w.lon]);
    L.polyline(latlngs, { color: '#00aaff', weight: 2, opacity: 0.8 }).addTo(map);

    // Draw waypoint markers
    const tbody = document.getElementById('tbody');
    waypoints.forEach((w, i) => {
      const isFirst = i === 0;
      const isLast = i === waypoints.length - 1;
      const color = isFirst ? '#00cc44' : isLast ? '#ff4444' : '#00aaff';

      const icon = L.divIcon({
        html: \`<div style="background:\${color};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5)">\${w.index}</div>\`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      L.marker([w.lat, w.lon], { icon })
        .bindPopup(\`<b>WP \${w.index}</b><br>Lat: \${w.lat.toFixed(7)}<br>Lon: \${w.lon.toFixed(7)}<br>Alt: \${w.alt.toFixed(1)} m\`)
        .addTo(map);

      const tr = document.createElement('tr');
      tr.innerHTML = \`<td>\${w.index}</td><td>\${w.lat.toFixed(7)}</td><td>\${w.lon.toFixed(7)}</td><td>\${w.alt.toFixed(1)}</td>\`;
      tbody.appendChild(tr);
    });

    // Fit map to all waypoints
    map.fitBounds(latlngs, { padding: [20, 20] });
  </script>
</body>
</html>`;
}

export function deactivate() {}
