# vscode-dji-pilot2-tools

DJI Pilot 2 ミッションファイルの開発支援ツール VSCode 拡張機能です。

## 機能

### KMZ ビューア

DJI Pilot 2 のミッションファイル（.kmz）を VSCode 上でインタラクティブマップ表示します。

- ウェイポイントを OpenStreetMap 上にプロット（Leaflet.js 使用）
- フライトパスをポリラインで描画
- 全ウェイポイントの座標・高度をテーブル表示
- 離陸地点・着陸地点を色分けで強調表示
- DJI Pilot 2 KMZ フォーマット（`template.kml` + `waylines.wpml`）に対応

**使い方:**
- エクスプローラーで `.kmz` ファイルを右クリック → **「DJI Pilot 2: Open KMZ Viewer」**
- またはコマンドパレット（`Ctrl+Shift+P`）から実行

## 対応フォーマット

| フォーマット | 状態 |
|---|---|
| `.kmz`（DJI Pilot 2） | 対応済み |
| `template.kml` | 対応済み（ウェイポイント座標抽出） |
| `waylines.wpml` | 実装予定 |

## 姉妹プロジェクト

| リポジトリ | 説明 |
|---|---|
| [streamlit-DJI-pilot2-waypoints](https://github.com/shinyanakashima/streamlit-DJI-pilot2-waypoints) | Streamlit Web アプリ（GeoJSON → KMZ 変換） |
| [qgis-DJI-pilot2-waypoints](https://github.com/shinyanakashima/qgis-DJI-pilot2-waypoints) | QGIS プラグイン版 |

## 開発

### 前提環境
- Node.js 20+
- VSCode 1.85+

### セットアップ
```bash
npm install
npm run compile
```

VSCode で `F5` を押すと Extension Development Host が起動します。

## ライセンス

MIT
