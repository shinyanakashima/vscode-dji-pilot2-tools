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
    await loadKmzToWebview(document.uri.fsPath, webviewPanel.webview, this.extensionUri);
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
