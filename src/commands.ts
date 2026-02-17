import * as vscode from "vscode";
import { setCurrentRoomId, setCurrentFileUri, getCurrentRoomId, getCurrentCollaborativeFileUri } from "./state";

function getLiveblocks() { return require("./liveblocks"); }
function getBinding() { return require("./binding"); }
function getPresence() { return require("./presence"); }

function getApiKey(): string | undefined {
  const key = vscode.workspace.getConfiguration("collabCode").get<string>("liveblocksPublicKey");
  if (!key || key.trim() === "") return undefined;
  return key.trim();
}

function getDisplayName(): string {
  const name = vscode.workspace.getConfiguration("collabCode").get<string>("displayName");
  return (name && name.trim() !== "") ? name.trim() : "Anonymous";
}

function getCursorColor(): string | undefined {
  const color = vscode.workspace.getConfiguration("collabCode").get<string>("cursorColor");
  return (color && color.trim() !== "") ? color.trim() : undefined;
}

function generateRoomId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Wait for the Yjs provider to sync from the server (so joiner gets host's content before we apply). */
function waitForYjsSync(yProvider: { synced?: boolean; once?: (event: string, fn: (synced: boolean) => void) => void }, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (yProvider.synced) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, timeoutMs);
    if (yProvider.once) {
      yProvider.once("sync", (synced: boolean) => {
        if (synced) done();
      });
    } else {
      done();
    }
  });
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("collabCode.startCollaboration", async () => {
      try { await runStartCollaboration(); }
      catch (err) {
        await vscode.window.showErrorMessage(`Collab Code: ${err instanceof Error ? err.message : String(err)}`);
        console.error("[Collab Code] startCollaboration failed:", err);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("collabCode.joinCollaboration", async () => {
      try { await runJoinCollaboration(); }
      catch (err) {
        await vscode.window.showErrorMessage(`Collab Code: ${err instanceof Error ? err.message : String(err)}`);
        console.error("[Collab Code] joinCollaboration failed:", err);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("collabCode.leaveCollaboration", async () => {
      try { await runLeaveCollaboration(); }
      catch (err) {
        await vscode.window.showErrorMessage(`Collab Code: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("collabCode.copyShareLink", async () => {
      try { await runCopyShareLink(); }
      catch (err) {
        await vscode.window.showErrorMessage(`Collab Code: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
}

async function runStartCollaboration(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    await vscode.window.showErrorMessage("Collab Code: Set your Liveblocks public API key in settings (collabCode.liveblocksPublicKey).");
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.window.showWarningMessage("Collab Code: Open a file to collaborate on.");
    return;
  }
  const document = editor.document;
  if (document.uri.scheme !== "file") {
    await vscode.window.showWarningMessage("Collab Code: Only file-based documents are supported.");
    return;
  }
  const roomId = generateRoomId();
  setCurrentRoomId(roomId);
  setCurrentFileUri(document.uri);
  const presence: Record<string, unknown> = {
    name: getDisplayName(),
    color: getCursorColor(),
    cursor: { line: editor.selection.active.line, character: editor.selection.active.character },
  };
  if (!editor.selection.isEmpty) {
    presence.selection = {
      anchor: { line: editor.selection.anchor.line, character: editor.selection.anchor.character },
      active: { line: editor.selection.active.line, character: editor.selection.active.character },
    };
  }
  const liveblocks = getLiveblocks();
  const binding = getBinding();
  const session = liveblocks.enterRoom(roomId, apiKey, presence);
  const { yDoc, yText } = session;
  binding.initializeYTextFromDocument(document, yText, yDoc);
  binding.bindDocumentToYText(document, yText, yDoc);
  getPresence().getPresenceManager().attach(session.room, document.uri);
  await vscode.env.clipboard.writeText(roomId);
  await vscode.window.showInformationMessage(`Collab Code: Collaboration started. Room ID copied: ${roomId} — share this so others can join.`);
  vscode.window.setStatusBarMessage(`Collab Code: ${roomId} – sharing`, 5000);
}

async function runJoinCollaboration(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    await vscode.window.showErrorMessage("Collab Code: Set your Liveblocks public API key in settings (collabCode.liveblocksPublicKey).");
    return;
  }
  const codeOrRoomId = await vscode.window.showInputBox({
    prompt: "Enter the room ID from the host (they can copy it via Collab Code: Copy share link)",
    placeHolder: "e.g. abc12xyz",
    validateInput: (v) => (v.trim() ? null : "Enter the room ID"),
  });
  if (!codeOrRoomId || !codeOrRoomId.trim()) return;
  const roomId = codeOrRoomId.trim();
  const presence: Record<string, unknown> = { name: getDisplayName(), color: getCursorColor() };
  const liveblocks = getLiveblocks();
  const binding = getBinding();
  const session = liveblocks.enterRoom(roomId, apiKey, presence);
  setCurrentRoomId(roomId);
  const { yDoc, yText, yProvider } = session;

  await waitForYjsSync(yProvider);
  const sharedContent = yText.toString();

  const untitledUri = vscode.Uri.parse(`untitled:Collab-${roomId}.txt`);
  const document = await vscode.workspace.openTextDocument(untitledUri);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(untitledUri, new vscode.Position(0, 0), sharedContent);
  await vscode.workspace.applyEdit(edit);

  await vscode.window.showTextDocument(document);
  setCurrentFileUri(document.uri);
  binding.bindDocumentToYText(document, yText, yDoc);
  getPresence().getPresenceManager().attach(session.room, document.uri);
  await vscode.window.showInformationMessage("Collab Code: Joined. Shared document opened in a new tab.");
}

async function runLeaveCollaboration(): Promise<void> {
  const liveblocks = getLiveblocks();
  const room = liveblocks.getCurrentRoom();
  if (!room) {
    await vscode.window.showInformationMessage("Collab Code: Not in a collaboration session.");
    return;
  }
  const fileUri = getCurrentCollaborativeFileUri();
  if (fileUri) {
    getBinding().unbindDocument(fileUri);
    getPresence().getPresenceManager().detach();
    setCurrentFileUri(null);
  }
  setCurrentRoomId(null);
  liveblocks.leaveCurrentRoom();
  await vscode.window.showInformationMessage("Collab Code: Left collaboration.");
}

async function runCopyShareLink(): Promise<void> {
  const room = getLiveblocks().getCurrentRoom();
  const currentRoomId = getCurrentRoomId();
  if (room || currentRoomId) {
    const id = currentRoomId ?? room!.id;
    await vscode.env.clipboard.writeText(id);
    await vscode.window.showInformationMessage(`Collab Code: Room ID copied: ${id}`);
  } else {
    await vscode.window.showWarningMessage("Collab Code: Not in a session. Start collaboration first.");
  }
}
