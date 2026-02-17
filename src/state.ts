import * as vscode from "vscode";

let currentRoomId: string | null = null;
let currentFileUri: vscode.Uri | null = null;

export function setCurrentRoomId(id: string | null): void {
  currentRoomId = id;
}

export function getCurrentRoomId(): string | null {
  return currentRoomId;
}

export function setCurrentFileUri(uri: vscode.Uri | null): void {
  currentFileUri = uri;
}

export function getCurrentCollaborativeFileUri(): vscode.Uri | null {
  return currentFileUri;
}
