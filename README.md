# Collab Code

Google Docs–style real-time collaboration on a single code file in VS Code or Cursor. See who's here and where they are (presence + gutter).

## One key in the project (shared with collaborators)

**You** add your Liveblocks public key to **this project** once. When your friend clones the repo and opens the project, the extension uses that same key—your friend does **not** need to create a Liveblocks account or add any key.

1. Get your **public** key from [Liveblocks](https://dashboard.liveblocks.io) (create a project, copy the Public key).
2. In this repo, copy the example and add your key:
   - Copy `.vscode/settings.json.example` to `.vscode/settings.json`.
   - Replace `pk_your_liveblocks_public_key` with your real public key.
3. Commit `.vscode/settings.json`. The repo now contains that key (public keys are safe to commit).
4. Anyone who clones the repo and opens this folder will use that key automatically.

Optional (per user, in their own settings if they want): `collabCode.displayName`, `collabCode.cursorColor`.

## Run the extension

1. Open this project folder in Cursor (or VS Code): **File → Open Folder** → select `Google Doc for Coding`.
2. Make sure the key is set: you need **`.vscode/settings.json`** (copy from `.vscode/settings.json.example`) with your real `pk_...` value. Without it, "Start collaboration" will say to set the API key.
3. Build: **Terminal → Run Task → npm: compile** (or run `npm run compile` in the terminal).
4. Run: press **F5**. A new window opens with the extension loaded. In that window, open a file and run **Collab Code: Start collaboration** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

**Won't work?**
- **F5 does nothing / new window never appears**: Cursor sometimes fails to open the Extension Development Host. Try **Option B** below.
- **"Set your Liveblocks public API key"**: Create `.vscode/settings.json` from the example and put your real `pk_...` key in it.
- **Commands not found**: Run in the **new** window that opened (Extension Development Host), not the window where you pressed F5.

**Option B – Install and use without F5 (works when Cursor’s Extension Host is broken)**  
1. In a terminal in this project: `npm run compile` then `npx @vscode/vsce package`.  
2. In Cursor: **Ctrl+Shift+P** / **Cmd+Shift+P** → **Extensions: Install from VSIX** → choose the `.vsix` file from this project.  
3. Reload the window. The extension is now installed. Open any folder that has `.vscode/settings.json` with your Liveblocks key and use **Collab Code: Start collaboration** there.

## Usage

- **Start collaboration**: Open a file → Command Palette → **Collab Code: Start collaboration** → share the copied room ID.
- **Join**: Open a file → **Collab Code: Join with code** → paste the room ID.
- **Leave**: **Collab Code: Leave collaboration**. **Copy link**: **Collab Code: Copy share link**.

## How it works

Sync and presence use Liveblocks + Yjs. The extension binds the native editor to the shared document and shows who's here (status bar) and where they are (gutter).
# CoLabCode
