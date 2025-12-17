# vscode-dji-pilot2-tools — Project Context

## Overview

VSCode extension providing developer tools for DJI Pilot 2 mission files.
Primary audience: developers working with DJI Pilot 2 KMZ/WPML mission formats.

### Sister Projects
| Repository | Role |
|---|---|
| `streamlit-DJI-pilot2-waypoints` | Streamlit web app (GeoJSON to KMZ conversion) |
| `qgis-DJI-pilot2-waypoints` | QGIS plugin version |
| `vscode-dji-pilot2-tools` | **This project** VSCode extension for viewing/debugging DJI mission files |

## File Structure

```
src/
  extension.ts       — Main extension entry point (command registration + KMZ viewer logic)
.vscode/
  launch.json        — Launch config for Extension Development Host (F5)
package.json         — Extension manifest (contributes, activationEvents, dependencies)
tsconfig.json        — TypeScript compiler config
```

## Architecture

- **Activation**: Command-based (`onCommand:dji-pilot2-tools.openKmzViewer`)
- **KMZ parsing**: JSZip to unzip → extract `template.kml` → regex-parse `<Placemark>` coordinates
- **Visualization**: VSCode WebviewPanel + Leaflet.js (CDN) + OpenStreetMap tiles
- **Context menu**: Right-click `.kmz` files in Explorer → "DJI Pilot 2: Open KMZ Viewer"

## DJI KMZ Format Notes

- KMZ is a ZIP archive containing `wpmz/template.kml` and `wpmz/waylines.wpml`
- `template.kml`: coordinates as `lon,lat,alt`, waypoint index is **1-based** (`<wpml:index>`)
- `waylines.wpml`: flight parameters (speed, action, etc.), index is **0-based**
- Minimum 2 waypoints, maximum 1000

## Development Workflow

```bash
npm install          # Install dependencies (jszip, @types/vscode, typescript)
npm run compile      # Compile TypeScript → out/
npm run watch        # Watch mode
# Press F5 in VSCode to launch Extension Development Host
```

## Planned Features

- [ ] WPML viewer (flight parameters: speed, gimbal angle, actions)
- [ ] Side-by-side KML + WPML diff view
- [ ] Waypoint count / distance / flight time summary
- [ ] Export waypoints to GeoJSON / CSV
