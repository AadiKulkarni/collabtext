/**
 * Integration test: real WebSocket server + two SyncClient instances.
 * Simulates B going offline (disconnect without auto-reconnect), both sides
 * editing, then B reconnecting — asserts CRDT convergence of final strings.
 *
 * @vitest-environment node
 */

import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ConnectionManager } from "../../server/src/ConnectionManager.js";
import { SyncClient } from "../src/sync/SyncClient.js";

function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 5000,
  intervalMs = 20,
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`waitFor timed out: ${label}`));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function createClient(url: string, reconnectDelayMs: number): SyncClient {
  return new SyncClient({
    url,
    WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    reconnectDelayMs,
  });
}

describe("offline reconnect integration", () => {
  let manager: ConnectionManager | null = null;
  const clients: SyncClient[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }
    if (manager) {
      await manager.close();
      manager = null;
    }
  }, 10_000);

  it("converges after B disconnects, both edit, then B reconnects", async () => {
    manager = new ConnectionManager(0);
    const url = `ws://127.0.0.1:${manager.getPort()}`;

    const clientA = createClient(url, 50);
    const clientB = createClient(url, 60_000);
    clients.push(clientA, clientB);

    clientA.connect();
    clientB.connect();

    await waitFor(
      () =>
        clientA.isReady() &&
        clientB.isReady() &&
        clientA.getStatus() === "synced" &&
        clientB.getStatus() === "synced",
      `both synced (A=${clientA.getStatus()} B=${clientB.getStatus()})`,
    );

    const rgaA = clientA.getRga();
    const rgaB = clientB.getRga();
    expect(rgaA).not.toBeNull();
    expect(rgaB).not.toBeNull();

    const start = rgaA!.insert(null, "S");
    clientA.sendLocalOperation(start);
    await waitFor(() => clientB.getText() === "S", `B sees S (got "${clientB.getText()}")`);

    clientB.disconnect();
    await waitFor(
      () => clientB.getStatus() === "disconnected",
      `B disconnected (got ${clientB.getStatus()})`,
    );

    const a1 = rgaA!.insert(start.id, "A");
    clientA.sendLocalOperation(a1);
    const b1 = rgaB!.insert(start.id, "B");
    clientB.sendLocalOperation(b1);

    expect(clientA.getText()).toContain("A");
    expect(clientB.getText()).toContain("B");

    clientB.connect();
    await waitFor(
      () => clientB.getStatus() === "synced",
      `B re-synced (got ${clientB.getStatus()})`,
    );
    await waitFor(
      () => clientA.getText() === clientB.getText(),
      `converge A="${clientA.getText()}" B="${clientB.getText()}"`,
    );

    expect(clientA.getText()).toBe(clientB.getText());
    expect(clientA.getText()).toContain("S");
    expect(clientA.getText()).toContain("A");
    expect(clientA.getText()).toContain("B");
  }, 20_000);
});
