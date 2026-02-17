import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { getCurrentCollaborativeFileUri } from "./state";

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      try {
        require("./presence").updateLocalPresenceFromEditor();
      } catch (_) {}
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      try {
        require("./presence").updateLocalPresenceFromEditor();
      } catch (_) {}
    })
  );
}

export function deactivate(): void {
  try {
    const uri = getCurrentCollaborativeFileUri();
    if (uri) {
      require("./presence").getPresenceManager().detach();
      require("./binding").unbindDocument(uri);
    }
    require("./liveblocks").leaveCurrentRoom();
  } catch (_) {}
}
