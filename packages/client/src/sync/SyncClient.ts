/**
 * SyncClient — WebSocket bridge between the React UI and the relay server.
 *
 * Owns a local RGA replica. Incoming hydrate/operation messages are applied
 * only through RGA.applyRemote — there is no special-case merge on reconnect.
 * While disconnected, locally generated ops sit in an outbox and flush after
 * the next hydrate so the CRDT's convergence properties do the hard work.
 */

import { RGA, type Operation } from "@collabtext/crdt";
import type {
  ClientMessage,
  ConnectionStatus,
  ServerMessage,
} from "./protocol.js";

export type DocumentListener = (text: string) => void;
export type PresenceListener = (presence: string[]) => void;
export type StatusListener = (status: ConnectionStatus) => void;
export type CursorListener = (clientId: string, index: number) => void;
export type ReadyListener = (ready: boolean) => void;

export interface SyncClientOptions {
  url: string;
  /** Injected for tests — defaults to browser/global WebSocket. */
  WebSocketImpl?: typeof WebSocket;
  /** Delay before reconnect attempts (ms). */
  reconnectDelayMs?: number;
}

export class SyncClient {
  private readonly url: string;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly reconnectDelayMs: number;

  private socket: WebSocket | null = null;
  private rga: RGA | null = null;
  private clientId: string | null = null;
  private status: ConnectionStatus = "disconnected";
  private hydrated = false;
  private readonly outbox: Operation[] = [];
  private readonly seenOpKeys = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  private readonly documentListeners = new Set<DocumentListener>();
  private readonly presenceListeners = new Set<PresenceListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly cursorListeners = new Set<CursorListener>();
  private readonly readyListeners = new Set<ReadyListener>();

  constructor(options: SyncClientOptions) {
    this.url = options.url;
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 500;
  }

  connect(): void {
    this.intentionalClose = false;
    if (
      this.socket &&
      (this.socket.readyState === this.WebSocketImpl.OPEN ||
        this.socket.readyState === this.WebSocketImpl.CONNECTING)
    ) {
      return;
    }
    this.hydrated = false;
    this.setStatus("reconnecting");
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      this.setStatus("connected");
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }
      const data = normalizeWsData(event.data);
      let message: ServerMessage;
      try {
        message = JSON.parse(data) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(message);
    });

    socket.addEventListener("close", () => {
      // Ignore stale close events from a socket we already replaced.
      if (this.socket !== socket && this.socket !== null) {
        return;
      }
      this.socket = null;
      this.hydrated = false;
      if (this.intentionalClose) {
        this.setStatus("disconnected");
        return;
      }
      this.setStatus("disconnected");
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      // The close handler schedules reconnect.
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.hydrated = false;
    this.setStatus("disconnected");
  }

  isReady(): boolean {
    return this.rga !== null;
  }

  getText(): string {
    return this.rga?.toString() ?? "";
  }

  getRga(): RGA | null {
    return this.rga;
  }

  getClientId(): string | null {
    return this.clientId;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Network a locally generated operation. The caller must already have applied
   * it to the local RGA (insert/delete return the op). Offline → outbox.
   */
  sendLocalOperation(op: Operation): void {
    this.markSeen(op);
    this.notifyDocument();
    if (this.canSend()) {
      this.send({ type: "operation", op });
      return;
    }
    this.outbox.push(op);
  }

  sendCursor(index: number): void {
    if (this.canSend()) {
      this.send({ type: "cursor", index });
    }
  }

  onDocumentChange(listener: DocumentListener): () => void {
    this.documentListeners.add(listener);
    return () => this.documentListeners.delete(listener);
  }

  onPresenceChange(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener);
    return () => this.presenceListeners.delete(listener);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onCursorChange(listener: CursorListener): () => void {
    this.cursorListeners.add(listener);
    return () => this.cursorListeners.delete(listener);
  }

  onReadyChange(listener: ReadyListener): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  private canSend(): boolean {
    return (
      this.hydrated &&
      this.socket !== null &&
      this.socket.readyState === this.WebSocketImpl.OPEN
    );
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "hydrate":
        this.applyHydrate(message.clientId, message.log, message.presence);
        break;
      case "operation":
        this.applyRemoteOperation(message.op);
        break;
      case "presence":
        this.notifyPresence(message.presence);
        break;
      case "cursor":
        if (message.clientId !== this.clientId) {
          for (const listener of this.cursorListeners) {
            listener(message.clientId, message.index);
          }
        }
        break;
    }
  }

  /**
   * First hydrate creates the RGA with the server-assigned clientId.
   * Later hydrates (reconnect) only applyRemote ops we have not seen yet,
   * then flush the outbox. No bespoke merge — CRDT convergence is the merge.
   */
  private applyHydrate(
    assignedClientId: string,
    log: Operation[],
    presence: string[],
  ): void {
    // Always track the connection's assigned id for presence/"you" UI.
    // The RGA keeps the clientId it was constructed with for op generation —
    // Identifier uniqueness only requires stability, not matching the socket id.
    this.clientId = assignedClientId;

    if (this.rga === null) {
      this.rga = new RGA(assignedClientId);
      for (const listener of this.readyListeners) {
        listener(true);
      }
    }

    for (const op of log) {
      this.applyRemoteOperation(op);
    }

    this.hydrated = true;
    this.notifyDocument();
    this.notifyPresence(presence);
    this.flushOutbox();
    this.setStatus("synced");
  }

  private applyRemoteOperation(op: Operation): void {
    if (!this.rga) {
      return;
    }
    const key = opKey(op);
    if (this.seenOpKeys.has(key)) {
      return;
    }
    this.rga.applyRemote(op);
    this.markSeen(op);
    this.notifyDocument();
  }

  private flushOutbox(): void {
    if (!this.canSend()) {
      return;
    }
    while (this.outbox.length > 0) {
      const op = this.outbox.shift();
      if (!op) {
        break;
      }
      this.send({ type: "operation", op });
    }
  }

  private send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.reconnectTimer !== null) {
      return;
    }
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private markSeen(op: Operation): void {
    this.seenOpKeys.add(opKey(op));
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private notifyDocument(): void {
    const text = this.getText();
    for (const listener of this.documentListeners) {
      listener(text);
    }
  }

  private notifyPresence(presence: string[]): void {
    for (const listener of this.presenceListeners) {
      listener(presence);
    }
  }
}

function opKey(op: Operation): string {
  return `${op.type}:${op.id.clientId}:${op.id.timestamp}`;
}

/** Normalize browser string payloads and Node `ws` Buffer payloads. */
function normalizeWsData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  // Node ws may hand us a Buffer-like value with toString.
  if (data && typeof (data as { toString?: unknown }).toString === "function") {
    return (data as { toString: (encoding?: string) => string }).toString("utf8");
  }
  return String(data);
}
