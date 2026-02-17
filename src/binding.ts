import * as vscode from "vscode";
import * as Y from "yjs";
import { getTransactionOrigin } from "./liveblocks";

const LOCAL_ORIGIN = getTransactionOrigin();

export interface BindingTarget {
  docUri: vscode.Uri;
  document: vscode.TextDocument;
  yText: Y.Text;
}

const activeBindings = new Map<string, { dispose: () => void }>();

function docKey(uri: vscode.Uri): string {
  return uri.toString();
}

/**
 * Two-way binding: TextDocument <-> Y.Text.
 * Local edits (onDidChangeTextDocument) are applied to Y with LOCAL_ORIGIN.
 * Remote Y updates (ydoc.on('update')) are applied to the document via WorkspaceEdit.
 */
export function bindDocumentToYText(
  document: vscode.TextDocument,
  yText: Y.Text,
  ydoc: Y.Doc
): vscode.Disposable {
  const uri = document.uri;
  const key = docKey(uri);

  if (activeBindings.has(key)) {
    activeBindings.get(key)!.dispose();
  }

  let applyingRemote = false;

  const docChangeSub = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.toString() !== uri.toString()) return;
    if (applyingRemote) return;

    // Sync full document to Y so that Undo/Redo and multi-range edits (which have
    // contentChanges relative to different document states) always sync correctly.
    const newText = e.document.getText();
    ydoc.transact(() => {
      const current = yText.toString();
      if (current === newText) return;
      yText.delete(0, current.length);
      if (newText.length > 0) {
        yText.insert(0, newText);
      }
    }, LOCAL_ORIGIN);
  });

  const updateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === LOCAL_ORIGIN) return;

    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (!doc) return;

    applyingRemote = true;
    const newText = yText.toString();
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, fullRange, newText);
    vscode.workspace.applyEdit(edit).then(
      () => { applyingRemote = false; },
      () => { applyingRemote = false; }
    );
  };

  ydoc.on("update", updateHandler);

  const dispose = () => {
    docChangeSub.dispose();
    ydoc.off("update", updateHandler);
    activeBindings.delete(key);
  };

  activeBindings.set(key, { dispose });

  return { dispose };
}

/**
 * Initialize Y.Text with the document content if Y.Text is empty (e.g. first one in room).
 */
export function initializeYTextFromDocument(document: vscode.TextDocument, yText: Y.Text, ydoc: Y.Doc): void {
  const current = yText.toString();
  if (current.length > 0) return;

  const text = document.getText();
  if (text.length === 0) return;

  ydoc.transact(() => {
    yText.insert(0, text);
  }, LOCAL_ORIGIN);
}

/**
 * Ensure the document content matches Y.Text (e.g. after joining a room where content already exists).
 */
export function applyYTextToDocument(document: vscode.TextDocument, yText: Y.Text, uri: vscode.Uri): Thenable<boolean> {
  const newText = yText.toString();
  const current = document.getText();
  if (current === newText) return Promise.resolve(false);

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(current.length)
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, fullRange, newText);
  return vscode.workspace.applyEdit(edit);
}

export function unbindDocument(uri: vscode.Uri): void {
  const key = docKey(uri);
  const binding = activeBindings.get(key);
  if (binding) {
    binding.dispose();
  }
}

export function isDocumentBound(uri: vscode.Uri): boolean {
  return activeBindings.has(docKey(uri));
}
