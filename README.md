# vscode-dji-pilot2-tools

VSCode extension providing developer tools for DJI Pilot 2 mission files.

## Features

### KMZ Viewer
View DJI Pilot 2 mission files (.kmz) directly in VSCode with an interactive map.

- Displays waypoints on an OpenStreetMap base layer (via Leaflet.js)
- Shows flight path as a polyline
- Lists all waypoints with coordinates and altitude in a table
- Highlights start/end waypoints with distinct colors
- Supports DJI Pilot 2 KMZ format (`template.kml` + `waylines.wpml`)

**Usage:**
- Right-click a `.kmz` file in the Explorer and select **"DJI Pilot 2: Open KMZ Viewer"**
- Or run the command from the Command Palette (`Ctrl+Shift+P`)

## Supported Formats

| Format | Status |
|---|---|
| `.kmz` (DJI Pilot 2) | Supported |
| `template.kml` | Supported (waypoint extraction) |
| `waylines.wpml` | Planned |

## Related Projects

| Repository | Description |
|---|---|
| [streamlit-DJI-pilot2-waypoints](https://github.com/shinysb/streamlit-DJI-pilot2-waypoints) | Streamlit web app (GeoJSON to KMZ conversion) |
| [qgis-DJI-pilot2-waypoints](https://github.com/shinysb/qgis-DJI-pilot2-waypoints) | QGIS plugin version |

## Development

### Prerequisites
- Node.js 20+
- VSCode 1.85+

### Setup
```bash
npm install
npm run compile
```

Press `F5` in VSCode to launch the Extension Development Host.

## License

MIT
