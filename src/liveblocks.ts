import { createClient, Room } from "@liveblocks/client";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import * as Y from "yjs";

// Extension runs in Node (VS Code extension host). Liveblocks needs WebSocket.
const WebSocketPolyfill = typeof globalThis.WebSocket !== "undefined" ? globalThis.WebSocket : require("ws");

const TRANSACTION_ORIGIN = Symbol("vscode-local");

export type CollabPresence = {
  cursor?: { line: number; character: number };
  selection?: { anchor: { line: number; character: number }; active: { line: number; character: number } };
  name?: string;
  color?: string;
};

let liveblocksClient: ReturnType<typeof createClient> | null = null;
let currentRoom: Room | null = null;
let leaveRoom: (() => void) | null = null;
let yProvider: ReturnType<typeof getYjsProviderForRoom> | null = null;

export function getLiveblocksClient(publicApiKey: string): ReturnType<typeof createClient> {
  if (!liveblocksClient) {
    liveblocksClient = createClient({
      publicApiKey,
      throttle: 50,
      polyfills: {
        WebSocket: WebSocketPolyfill as typeof WebSocket,
      },
    } as Parameters<typeof createClient>[0]);
  }
  return liveblocksClient;
}

export function getTransactionOrigin(): symbol {
  return TRANSACTION_ORIGIN;
}

export interface RoomSession {
  roomId: string;
  room: Room;
  leave: () => void;
  yDoc: Y.Doc;
  yText: Y.Text;
  yProvider: ReturnType<typeof getYjsProviderForRoom>;
}

export function enterRoom(
  roomId: string,
  publicApiKey: string,
  initialPresence: Partial<CollabPresence>
): RoomSession {
  if (currentRoom && leaveRoom) {
    leaveRoom();
    currentRoom = null;
    leaveRoom = null;
    yProvider = null;
  }

  const client = getLiveblocksClient(publicApiKey);
  const { room, leave } = client.enterRoom(roomId, {
    initialPresence: initialPresence as never,
  });

  currentRoom = room;
  leaveRoom = leave;
  yProvider = getYjsProviderForRoom(room);
  const yDoc = yProvider.getYDoc();
  const yText = yDoc.getText("content");

  return {
    roomId,
    room,
    leave,
    yDoc,
    yText,
    yProvider,
  };
}

export function getCurrentRoom(): Room | null {
  return currentRoom;
}

export function getCurrentYProvider(): ReturnType<typeof getYjsProviderForRoom> | null {
  return yProvider;
}

export function leaveCurrentRoom(): void {
  if (leaveRoom) {
    leaveRoom();
    leaveRoom = null;
  }
  currentRoom = null;
  yProvider = null;
}

export function updatePresence(presence: Partial<CollabPresence>): void {
  if (currentRoom) {
    currentRoom.updatePresence(presence as never);
  }
}

export function subscribeToPresence(callback: (others: ReadonlyArray<{ presence: Partial<CollabPresence>; connectionId: number }>) => void): () => void {
  if (!currentRoom) return () => {};
  return currentRoom.subscribe("others", (others) => {
    callback(
      others.map((o) => ({
        presence: (o.presence || {}) as Partial<CollabPresence>,
        connectionId: o.connectionId,
      }))
    );
  });
}
