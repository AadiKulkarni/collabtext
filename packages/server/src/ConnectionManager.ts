/**
 * ConnectionManager — owns the raw WebSocket server and routes messages
 * into a DocumentRoom. Assigns each connection a UUID clientId so replicas
 * have unique Lamport tiebreaks without any auth system.
 */

import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { DocumentRoom } from "./DocumentRoom.js";
import type { ClientMessage } from "./protocol.js";

export class ConnectionManager {
  private readonly wss: WebSocketServer;
  private readonly room: DocumentRoom;
  private readonly socketToClient = new Map<WebSocket, string>();

  constructor(port: number, room: DocumentRoom = new DocumentRoom()) {
    this.room = room;
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (socket) => this.onConnection(socket));
  }

  getRoom(): DocumentRoom {
    return this.room;
  }

  getPort(): number {
    const address = this.wss.address();
    if (typeof address === "object" && address !== null) {
      return address.port;
    }
    throw new Error("WebSocket server has no bound port");
  }

  async close(): Promise<void> {
    for (const socket of this.socketToClient.keys()) {
      socket.terminate();
    }
    this.socketToClient.clear();
    await new Promise<void>((resolve, reject) => {
      this.wss.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private onConnection(socket: WebSocket): void {
    const clientId = randomUUID();
    this.socketToClient.set(socket, clientId);
    this.room.join(clientId, {
      send: (data) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data);
        }
      },
    });

    socket.on("message", (raw) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (!isClientMessage(parsed)) {
        return;
      }
      this.room.handleClientMessage(clientId, parsed);
    });

    const cleanup = (): void => {
      if (!this.socketToClient.has(socket)) {
        return;
      }
      this.socketToClient.delete(socket);
      this.room.leave(clientId);
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { type?: unknown };
  return record.type === "operation" || record.type === "cursor";
}
