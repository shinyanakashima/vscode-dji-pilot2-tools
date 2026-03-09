import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// extension host でのバンドル問題を避けるため、JSZip は動的に読み込む
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

const VIEWER_HTML_TEMPLATE_PATH = path.join(__dirname, '..', 'media', 'viewer.html');
let viewerHtmlTemplateCache: string | null = null;

function getViewerHtmlTemplate(): string {
  if (viewerHtmlTemplateCache === null) {
    viewerHtmlTemplateCache = fs.readFileSync(VIEWER_HTML_TEMPLATE_PATH, 'utf-8');
  }
  return viewerHtmlTemplateCache;
}

function toSafeInlineJson(value: unknown): string {
  // インライン script 文脈で </script> が誤って閉じられるのを防ぐ
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStatusHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #ccc; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: min(760px, 95vw); background: #252526; border: 1px solid #3c3c3c; border-radius: 8px; padding: 16px; }
    h1 { margin: 0 0 8px; font-size: 16px; color: #e8e8e8; }
    p { margin: 0; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  </div>
</body>
</html>`;
}

async function loadKmzToWebview(filePath: string, webview: vscode.Webview, extensionUri: vscode.Uri): Promise<void> {
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
    webview.html = buildStatusHtml('Failed to load KMZ', `Failed to read KMZ file:\n${String(err)}`);
    return;
  }

  if (!kmlContent) {
    vscode.window.showErrorMessage('template.kml not found in KMZ.');
    webview.html = buildStatusHtml('template.kml not found', 'template.kml is missing in this KMZ file. Please check that this is a DJI Pilot 2 mission file.');
    return;
  }

  const waypoints = parseKmlWaypoints(kmlContent);
  if (waypoints.length === 0) {
    vscode.window.showErrorMessage('No waypoints found in template.kml.');
    webview.html = buildStatusHtml('No waypoints found', 'Could not extract waypoints from template.kml. Please check the file format and content.');
    return;
  }

  webview.html = buildWebviewHtml(waypoints, path.basename(filePath), wpmlContent !== null, extensionUri, webview);
}

class KmzEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewPanel.webview.html = buildStatusHtml('Loading KMZ...', 'Please wait.');
    void loadKmzToWebview(document.uri.fsPath, webviewPanel.webview, this.extensionUri);
  }
}

export function activate(context: vscode.ExtensionContext) {
  // .kmz ファイルの既定エディタとして登録（ダブルクリックで開く）
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'dji-pilot2-tools.kmzViewer',
      new KmzEditorProvider(context.extensionUri)
    )
  );

  // 右クリックメニューから開く場合のコマンドも登録
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
          {
            enableScripts: true,
            localResourceRoots: [context.extensionUri]
          }
        );
        panel.webview.html = buildStatusHtml('Loading KMZ...', 'Please wait.');
        await loadKmzToWebview(fileUri.fsPath, panel.webview, context.extensionUri);
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

// KML の内容から waypointを抽出する
function parseKmlWaypoints(kml: string): Waypoint[] {
  const waypoints: Waypoint[] = [];
  // waypointとなる `<Placemark>` を抽出し、座標と index を取り出す
  const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/g;
  const coordRegex = /<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/;
  const indexRegex = /<(?:wpml:)?index>(\d+)<\/(?:wpml:)?index>/;

  let match: RegExpExecArray | null;
  let autoIndex = 1;

  while ((match = placemarkRegex.exec(kml)) !== null) {
    const block = match[0];
    const coordMatch = coordRegex.exec(block);
    if (!coordMatch) { continue; }

    const firstCoord = coordMatch[1].trim().split(/\s+/)[0];
    const parts = firstCoord.split(',');
    if (parts.length < 3) { continue; }

    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    const alt = parseFloat(parts[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(alt)) { continue; }

    const indexMatch = indexRegex.exec(block);
    const index = indexMatch ? parseInt(indexMatch[1]) : autoIndex;
    autoIndex++;

    waypoints.push({ index, lon, lat, alt });
  }

  // `<Placemark>` を見つけた順に一旦 `waypoints` に追加するが、waypoint の論理的な順序（`wpml:index`）が保証されないため、
  // indexでsortして正しい順序に並び替える。これにより、`wpml:index` が存在しない場合でも、ファイル内の順序で waypoint を表示できる
  waypoints.sort((a, b) => a.index - b.index);
  return waypoints;
}

// KML から抽出した waypoint データを元に、Webview に表示する HTML を生成する
function buildWebviewHtml(waypoints: Waypoint[], filename: string, hasWpml: boolean, extensionUri: vscode.Uri, webview: vscode.Webview): string {
  const htmlTemplate = getViewerHtmlTemplate();
  const initialData = {
    waypoints,
    filename,
    hasWpml,
  };
  const bundleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'bundle.js'));
  const replacements: Record<string, string> = {
    '__INITIAL_DATA_JSON__': toSafeInlineJson(initialData),
    '__BUNDLE_URI__': bundleUri.toString(),
  };

  return htmlTemplate.replace(/__INITIAL_DATA_JSON__|__BUNDLE_URI__/g, (placeholder) => replacements[placeholder] ?? placeholder);
}

export function deactivate() {}
