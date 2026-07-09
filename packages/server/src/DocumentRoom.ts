/**
 * DocumentRoom — in-memory relay for a single collaborative document.
 *
 * WHY this class does NOT understand CRDT semantics: conflict resolution and
 * convergence live entirely in @collabtext/crdt on every client. The room only
 * (1) appends operations in receipt order for hydration of late joiners and
 * (2) broadcasts them to peers. That keeps the server out of the correctness
 * path — if the relay reorders or drops nothing permanently, clients still
 * converge because the CRDT is commutative/associative over the op set.
 *
 * Cursor messages are ephemeral: relayed live, never appended to the log.
 */

import type { Operation } from "@collabtext/crdt";
import type { ClientMessage, ServerMessage } from "./protocol.js";

/** Minimal socket surface so unit tests can inject mocks. */
export interface RoomSocket {
  send(data: string): void;
}

export class DocumentRoom {
  private readonly log: Operation[] = [];
  private readonly clients = new Map<string, RoomSocket>();

  join(clientId: string, socket: RoomSocket): void {
    this.clients.set(clientId, socket);
    this.send(socket, {
      type: "hydrate",
      clientId,
      log: [...this.log],
      presence: this.presenceList(),
    });
    this.broadcastPresence();
  }

  /**
   * Append an operation and fan it out to every peer except the sender.
   * No conflict resolution, no reordering by content — receipt order only.
   */
  handleOperation(op: Operation, fromClientId: string): void {
    this.log.push(op);
    this.broadcast(
      {
        type: "operation",
        op,
        fromClientId,
      },
      fromClientId,
    );
  }

  /** Relay a cursor position to peers; do not persist. */
  handleCursor(clientId: string, index: number): void {
    this.broadcast(
      {
        type: "cursor",
        clientId,
        index,
      },
      clientId,
    );
  }

  leave(clientId: string): void {
    this.clients.delete(clientId);
    this.broadcastPresence();
  }

  handleClientMessage(clientId: string, message: ClientMessage): void {
    if (message.type === "operation") {
      this.handleOperation(message.op, clientId);
      return;
    }
    this.handleCursor(clientId, message.index);
  }

  getLog(): readonly Operation[] {
    return this.log;
  }

  presenceList(): string[] {
    return [...this.clients.keys()].sort();
  }

  private broadcastPresence(): void {
    this.broadcast({
      type: "presence",
      presence: this.presenceList(),
    });
  }

  private broadcast(message: ServerMessage, exceptClientId?: string): void {
    const payload = JSON.stringify(message);
    for (const [id, socket] of this.clients) {
      if (exceptClientId !== undefined && id === exceptClientId) {
        continue;
      }
      socket.send(payload);
    }
  }

  private send(socket: RoomSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
  }
}
