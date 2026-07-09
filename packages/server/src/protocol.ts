/**
 * Wire protocol messages exchanged between CollabText clients and the server.
 *
 * Kept in the server package (and mirrored by the client) so the relay stays
 * a thin transport layer — it never interprets CRDT semantics.
 */

import type { Operation } from "@collabtext/crdt";

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "synced";

export interface HydrateMessage {
  type: "hydrate";
  clientId: string;
  log: Operation[];
  presence: string[];
}

export interface OperationMessage {
  type: "operation";
  op: Operation;
  fromClientId: string;
}

export interface PresenceMessage {
  type: "presence";
  presence: string[];
}

/** Ephemeral cursor update — not stored in the operation log. */
export interface CursorMessage {
  type: "cursor";
  clientId: string;
  index: number;
}

export type ServerMessage =
  | HydrateMessage
  | OperationMessage
  | PresenceMessage
  | CursorMessage;

export type ClientMessage =
  | { type: "operation"; op: Operation }
  | { type: "cursor"; index: number };
