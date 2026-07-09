/**
 * @collabtext/server — WebSocket relay for CollabText.
 *
 * Accepts client connections, stores an append-only operation log for
 * hydration, and broadcasts operations to peers. Conflict resolution is
 * intentionally NOT done here; every client applies the same CRDT logic
 * from @collabtext/crdt so the server stays a dumb, resilient relay.
 */

import { ConnectionManager } from "./ConnectionManager.js";

const port = Number(process.env.PORT ?? 8080);

const manager = new ConnectionManager(port);
console.log(`CollabText server listening on ws://localhost:${manager.getPort()}`);

export { ConnectionManager } from "./ConnectionManager.js";
export { DocumentRoom } from "./DocumentRoom.js";
export type { RoomSocket } from "./DocumentRoom.js";
export type {
  ClientMessage,
  ConnectionStatus,
  CursorMessage,
  HydrateMessage,
  OperationMessage,
  PresenceMessage,
  ServerMessage,
} from "./protocol.js";
