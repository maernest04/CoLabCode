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
 * - Doc → Y: one atomic Yjs transaction per change (delete all + insert all with LOCAL_ORIGIN).
 * - Y → Doc: serialized full-document replace; we ignore LOCAL_ORIGIN so we don't echo our own edits.
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

  /** When true, doc-change handler must not push to Y (we are applying remote state). */
  let applyingRemote = false;
  /** Serialize Y→doc applies so we never run two replace edits with stale ranges (avoids doubled content). */
  let remoteApplyPromise: Promise<void> = Promise.resolve();

  const docChangeSub = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.toString() !== uri.toString()) return;
    if (applyingRemote) return;

    const newText = e.document.getText();
    // Single atomic Yjs transaction: replace entire Y.Text with document snapshot.
    ydoc.transact(() => {
      const current = yText.toString();
      if (current === newText) return;
      yText.delete(0, current.length);
      if (newText.length > 0) {
        yText.insert(0, newText);
      }
    }, LOCAL_ORIGIN);
  });

  const updateHandler = (_update: Uint8Array, origin: unknown) => {
    if (origin === LOCAL_ORIGIN) return;

    applyingRemote = true;
    remoteApplyPromise = remoteApplyPromise
      .then(() => {
        const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
        if (!doc) return;

        const newText = yText.toString();
        const currentText = doc.getText();
        if (currentText === newText) return;

        const fullRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(currentText.length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, fullRange, newText);
        return vscode.workspace.applyEdit(edit);
      })
      .then(
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
 * Initialize Y.Text with the document content if Y.Text is empty (e.g. host starting room).
 * Single atomic transaction with LOCAL_ORIGIN so the update handler does not echo it back.
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
 * One-shot apply of Y.Text to document (e.g. before binding). Use only when binding is not yet active.
 * Single WorkspaceEdit replace so the document gets one consistent snapshot.
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
