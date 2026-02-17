# Collab Code

Google Docs–style real-time collaboration on a single code file in VS Code or Cursor. See who's in the room and where their cursor is (presence + gutter).

---

## Quick start

1. **Open this folder** in Cursor or VS Code (**File → Open Folder** → select this project).
2. **Add your Liveblocks key** (one-time setup):
   - Copy `.vscode/settings.json.example` → `.vscode/settings.json`
   - Get your **public** key from [Liveblocks](https://dashboard.liveblocks.io) (create a project, copy the Public key)
   - In `.vscode/settings.json`, replace `pk_your_liveblocks_public_key` with your real key
   - Commit `settings.json` so collaborators use the same key (public keys are safe to commit)
3. **Build & run**: **Terminal → Run Task → npm: compile** (or `npm run compile`), then press **F5**.
4. In the **new window** that opens: open a file → **Command Palette** (`Cmd+Shift+P`) → **Collab Code: Start collaboration** → share the room ID with others.

---

## Setup (one key for the whole project)

Only **one person** needs a Liveblocks account. Everyone else just clones the repo—they don’t need to add any key.

| Step | What to do |
|------|------------|
| 1 | Get your **public** key from [Liveblocks](https://dashboard.liveblocks.io) (create a project → copy Public key). |
| 2 | In this repo: copy `.vscode/settings.json.example` to `.vscode/settings.json`. |
| 3 | In `.vscode/settings.json`, replace `pk_your_liveblocks_public_key` with your real key. |
| 4 | Commit `.vscode/settings.json`. Anyone who clones the repo will use that key automatically. |

**Optional** (per user, in their own settings): `collabCode.displayName`, `collabCode.cursorColor`.

---

## Project structure

```
CoLabCode/
├── src/                    # Extension source (TypeScript)
│   ├── extension.ts        # Entry point: activates commands, wires editor events to presence
│   ├── commands.ts         # Start / Join / Leave / Copy link; room ID handling and API key checks
│   ├── state.ts            # In-memory state: current room ID and collaborative file URI
│   ├── liveblocks.ts       # Liveblocks client, room join/leave, Yjs provider and shared Y.Doc
│   ├── binding.ts          # Two-way sync: VS Code TextDocument ↔ Y.Text (doc ↔ Liveblocks)
│   └── presence.ts         # Presence UI: status bar (“who’s here”), gutter cursors, selection highlights
├── out/                    # Compiled JS (from npm run compile); do not edit
├── .vscode/
│   ├── settings.json.example   # Template for Liveblocks public key
│   ├── settings.json           # Your key (create from example; safe to commit)
│   ├── launch.json             # F5 runs Extension Development Host
│   └── tasks.json              # npm: compile task
├── package.json            # Extension manifest, scripts, dependencies (Liveblocks, Yjs)
├── build.mjs               # Build script (esbuild) — compiles src/*.ts → out/*.js
└── collab-code-0.1.0.vsix  # Packaged extension (after npm run package)
```

| Layer | Role |
|-------|------|
| **extension.ts** | Registers commands and hooks editor selection/active-editor changes to presence. On deactivate: leaves room, unbinds document, detaches presence. |
| **commands.ts** | Implements the four commands; reads workspace config (API key, display name, cursor color); creates/joins Liveblocks room and binds the open file. |
| **state.ts** | Holds `currentRoomId` and `currentFileUri` so the rest of the extension knows which room and file are active. |
| **liveblocks.ts** | Liveblocks client + room lifecycle; provides the Yjs document that syncs with the room. Defines `CollabPresence` (cursor, selection, name, color). |
| **binding.ts** | Binds a `TextDocument` to a `Y.Text`: local edits go to Yjs (then Liveblocks); remote updates from Yjs are applied to the document (with local-origin filtering to avoid echo). |
| **presence.ts** | Subscribes to others’ presence; updates status bar; draws gutter decorations and selection ranges for other users’ cursors. |

---

## Running the extension

### Option A – Development (F5)

1. Open this project folder in Cursor or VS Code.
2. Ensure `.vscode/settings.json` exists with your real `pk_...` key (see [Setup](#setup-one-key-for-the-whole-project)).
3. **Terminal → Run Task → npm: compile** (or `npm run compile`).
4. Press **F5**. A new window opens with the extension loaded.
5. In **that new window**: open a file → **Collab Code: Start collaboration** (or **Join with code**).

### Option B – Install from VSIX (when F5 / Extension Host doesn’t work)

1. In this project: `npm run compile` then `npx @vscode/vsce package`.
2. In Cursor: **Cmd+Shift+P** → **Extensions: Install from VSIX** → select the `.vsix` from this project.
3. Reload the window. Open any folder that has `.vscode/settings.json` with your Liveblocks key and use **Collab Code: Start collaboration** there.

---

## Commands

| Command | What it does |
|--------|----------------|
| **Collab Code: Start collaboration** | Start a session; copies room ID to clipboard. Share that ID so others can join. |
| **Collab Code: Join with code** | Paste a room ID to join an existing session. |
| **Collab Code: Leave collaboration** | Leave the current session. |
| **Collab Code: Copy share link** | Copy a shareable link for the current room. |
---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| **F5 does nothing / new window never opens** | Use [Option B](#option-b--install-from-vsix-when-f5--extension-host-doesnt-work) and install from the `.vsix` file. |
| **"Set your Liveblocks public API key"** | Create `.vscode/settings.json` from `.vscode/settings.json.example` and put your real `pk_...` key in it. |
| **Commands not found** | Run the commands in the **new** window (Extension Development Host), not the window where you pressed F5. |