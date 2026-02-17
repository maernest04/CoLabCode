import * as vscode from "vscode";
import type { Room } from "@liveblocks/client";
import { updatePresence, type CollabPresence } from "./liveblocks";
import { getCurrentCollaborativeFileUri } from "./state";

const PRESENCE_COLORS = [
  "#e53935", "#d81b60", "#8e24aa", "#5e35b1", "#3949ab",
  "#1e88e5", "#039be5", "#00acc1", "#00897b", "#43a047",
  "#7cb342", "#c0ca33", "#fdd835", "#ffb300", "#fb8c00",
  "#f4511e",
];

function colorForConnectionId(connectionId: number): string {
  return PRESENCE_COLORS[Math.abs(connectionId) % PRESENCE_COLORS.length];
}

let statusBarItem: vscode.StatusBarItem | null = null;
let room: Room | null = null;
let docUri: vscode.Uri | null = null;
let othersUnsubscribe: (() => void) | null = null;
let presenceInterval: ReturnType<typeof setInterval> | null = null;
let editorSubscriptions: vscode.Disposable[] = [];
let gutterDecorationTypes: Map<number, vscode.TextEditorDecorationType> = new Map();
let selectionDecorationTypes: Map<number, vscode.TextEditorDecorationType> = new Map();

interface OtherPresence {
  presence: Partial<CollabPresence>;
  connectionId: number;
}

function getStatusBarItem(): vscode.StatusBarItem {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  }
  return statusBarItem;
}

function updateStatusBar(others: OtherPresence[]): void {
  const item = getStatusBarItem();
  const names = others.map((o) => (o.presence.name || "Anonymous")).filter(Boolean);
  if (names.length === 0) {
    item.text = "Collab Code: Just you";
  } else {
    item.text = `Collab Code: ${names.join(", ")} (${names.length + 1})`;
  }
  item.show();
}

function ensureGutterDecorationType(connectionId: number, color: string): vscode.TextEditorDecorationType {
  let type = gutterDecorationTypes.get(connectionId);
  if (!type) {
    type = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: `${color}18`,
      borderWidth: "0 0 0 3px",
      borderColor: color,
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    gutterDecorationTypes.set(connectionId, type);
  }
  return type;
}

function ensureSelectionDecorationType(connectionId: number, color: string): vscode.TextEditorDecorationType {
  let type = selectionDecorationTypes.get(connectionId);
  if (!type) {
    type = vscode.window.createTextEditorDecorationType({
      backgroundColor: `${color}30`,
      borderRadius: "2px",
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
    selectionDecorationTypes.set(connectionId, type);
  }
  return type;
}

function applyDecorations(editor: vscode.TextEditor, others: OtherPresence[]): void {
  if (!docUri || editor.document.uri.toString() !== docUri.toString()) return;

  const gutterOptions: Map<number, vscode.DecorationOptions[]> = new Map();
  const selectionRanges: Map<number, vscode.Range[]> = new Map();

  for (const { presence, connectionId } of others) {
    const color = presence.color || colorForConnectionId(connectionId);

    if (presence.cursor != null) {
      const line = Math.max(0, Math.min(presence.cursor.line, editor.document.lineCount - 1));
      const range = new vscode.Range(line, 0, line, 0);
      const name = presence.name || "Anonymous";
      ensureGutterDecorationType(connectionId, color);
      if (!gutterOptions.has(connectionId)) gutterOptions.set(connectionId, []);
      gutterOptions.get(connectionId)!.push({ range, hoverMessage: new vscode.MarkdownString(`**${name}**`) });
    }

    if (presence.selection && presence.selection.anchor && presence.selection.active) {
      try {
        const anchor = new vscode.Position(presence.selection.anchor.line, presence.selection.anchor.character);
        const active = new vscode.Position(presence.selection.active.line, presence.selection.active.character);
        const range = new vscode.Range(anchor, active);
        ensureSelectionDecorationType(connectionId, color);
        if (!selectionRanges.has(connectionId)) selectionRanges.set(connectionId, []);
        selectionRanges.get(connectionId)!.push(range);
      } catch {
        // ignore invalid positions
      }
    }
  }

  const usedGutterIds = new Set(gutterOptions.keys());
  const usedSelectionIds = new Set(selectionRanges.keys());
  gutterDecorationTypes.forEach((type, cid) => {
    editor.setDecorations(type, usedGutterIds.has(cid) ? (gutterOptions.get(cid) || []) : []);
  });
  selectionDecorationTypes.forEach((type, cid) => {
    editor.setDecorations(type, usedSelectionIds.has(cid) ? (selectionRanges.get(cid) || []) : []);
  });
}

function refreshDecorations(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !docUri) return;
  if (editor.document.uri.toString() !== docUri.toString()) return;
  const others = lastOthers;
  if (others.length === 0) {
    gutterDecorationTypes.forEach((t) => t.dispose());
    gutterDecorationTypes.clear();
    selectionDecorationTypes.forEach((t) => t.dispose());
    selectionDecorationTypes.clear();
    return;
  }
  applyDecorations(editor, others);
}

let lastOthers: OtherPresence[] = [];

export function getPresenceManager(): {
  attach: (r: Room, uri: vscode.Uri) => void;
  detach: () => void;
  updateLocalCursor: (line: number, character: number, selection?: { anchor: { line: number; character: number }; active: { line: number; character: number } }) => void;
} {
  function detachImpl(): void {
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }
    if (othersUnsubscribe) {
      othersUnsubscribe();
      othersUnsubscribe = null;
    }
    room = null;
    docUri = null;
    lastOthers = [];
    gutterDecorationTypes.forEach((t) => t.dispose());
    gutterDecorationTypes.clear();
    selectionDecorationTypes.forEach((t) => t.dispose());
    selectionDecorationTypes.clear();
    editorSubscriptions.forEach((d) => d.dispose());
    editorSubscriptions = [];
    if (statusBarItem) {
      statusBarItem.hide();
    }
  }

  return {
    attach(r: Room, uri: vscode.Uri) {
      detachImpl();
      room = r;
      docUri = uri;

      othersUnsubscribe = r.subscribe("others", (others) => {
        const list: OtherPresence[] = others.map((o: { presence: Partial<CollabPresence>; connectionId: number }) => ({
          presence: (o.presence || {}) as Partial<CollabPresence>,
          connectionId: o.connectionId,
        }));
        lastOthers = list;
        updateStatusBar(list);
        refreshDecorations();
      });

      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && docUri && editor.document.uri.toString() === docUri.toString()) {
          refreshDecorations();
        }
      });

      updateLocalPresenceFromEditor();
      presenceInterval = setInterval(updateLocalPresenceFromEditor, 1500);

      updateStatusBar(lastOthers);
      refreshDecorations();
    },

    detach: detachImpl,

    updateLocalCursor(line: number, character: number, selection?: { anchor: { line: number; character: number }; active: { line: number; character: number } }) {
      const presence: Partial<CollabPresence> = { cursor: { line, character } };
      if (selection) presence.selection = selection;
      updatePresence(presence);
    },
  };
}

export function updateLocalPresenceFromEditor(): void {
  const uri = getCurrentCollaborativeFileUri();
  if (!uri) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.toString() !== uri.toString()) return;
  const pos = editor.selection.active;
  const presence: Partial<CollabPresence> = {
    cursor: { line: pos.line, character: pos.character },
  };
  if (!editor.selection.isEmpty) {
    presence.selection = {
      anchor: { line: editor.selection.anchor.line, character: editor.selection.anchor.character },
      active: { line: editor.selection.active.line, character: editor.selection.active.character },
    };
  }
  updatePresence(presence);
}
