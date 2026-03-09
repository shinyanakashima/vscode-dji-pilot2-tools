# DJI Pilot 2 Tools for VS Code

![Version](https://img.shields.io/visual-studio-marketplace/v/shinyanakashima.vscode-dji-pilot2-tools)
![Installs](https://img.shields.io/visual-studio-marketplace/i/shinyanakashima.vscode-dji-pilot2-tools)
![License](https://img.shields.io/github/license/shinyanakashima/vscode-dji-pilot2-tools)

Visualize and inspect **DJI Pilot 2 KMZ mission files** directly in Visual Studio Code.
Interactive 3D mission viewer powered by **MapLibre GL JS** and **deck.gl**.

DJI Pilot 2 の **KMZ ミッションファイルを VSCode 上で可視化・解析する開発支援ツール**です。
MapLibre GL JS と deck.gl を使用した **インタラクティブ 3D ミッションビューア**を提供します。

![KMZ Viewer](https://raw.githubusercontent.com/shinyanakashima/vscode-dji-pilot2-tools/main/capture.png)

---

# ✈️ Features

## KMZ Mission Viewer

Visualize DJI Pilot 2 `.kmz` mission files as an interactive **3D map inside VS Code**.

DJI Pilot 2 の `.kmz` ミッションファイルを **VSCode 内で 3D マップ表示**できます。

### Capabilities

* Open `.kmz` files directly with **Custom Editor integration**
* 3D waypoint visualization using **MapLibre GL JS + deck.gl**
* Waypoints plotted in **actual altitude (MSL)**
* **Vertical drop lines** to ground
* **3D flight path rendering** with direction arrows
* **Start / End labels** and waypoint numbers
* Base map switching

  * GSI Aerial Photo
  * GSI Standard Map
  * OpenStreetMap
* Toggle **3D visualization ON / OFF**
* Click waypoint → highlight corresponding row in attribute table
* View **all waypoint coordinates and altitude**
* Detect bundled `waylines.wpml` file with **WPML badge**
* Supports DJI Pilot 2 KMZ structure
  (`template.kml + waylines.wpml`)

---

# 🚀 Usage

### Open KMZ Viewer

1. Double-click a `.kmz` file in the VS Code Explorer
2. Or right-click → **DJI Pilot 2: Open KMZ Viewer**

VSCode 内のエクスプローラーで `.kmz` を開くだけで
3D ミッションビューアが起動します。

---

# 📦 Supported Formats

| Format               | Status                        |
| -------------------- | ----------------------------- |
| `.kmz` (DJI Pilot 2) | Supported                     |
| `template.kml`       | Waypoint extraction supported |
| `waylines.wpml`      | Planned                       |

---

# 🛠 Development

### Requirements

* Node.js 20+
* VS Code 1.85+

### Setup

```bash
npm install
npm run compile
```

Launch Extension Development Host:

Press **F5** in VS Code.

---

# 📄 License

MIT
