/**
 * Shared wire protocol types for the CollabText client.
 * Mirrors packages/server/src/protocol.ts so the client does not import
 * server runtime code — only the message shapes.
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
