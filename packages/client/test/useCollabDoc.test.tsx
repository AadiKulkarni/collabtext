import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RGA, type Operation } from "@collabtext/crdt";
import { useCollabDoc } from "../src/hooks/useCollabDoc.js";
import type { SyncClient } from "../src/sync/SyncClient.js";

afterEach(() => {
  cleanup();
});

function Harness({ client }: { client: SyncClient }) {
  const { text, ready, handleTextChange } = useCollabDoc({
    url: "ws://test",
    client,
    autoConnect: false,
  });

  return (
    <div>
      <div data-testid="ready">{ready ? "yes" : "no"}</div>
      <textarea
        data-testid="doc"
        value={text}
        onChange={(e) =>
          handleTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }
      />
    </div>
  );
}

function createMockClient(): SyncClient & {
  emitDocument: (text: string) => void;
  emitReady: () => void;
  sent: Operation[];
} {
  const rga = new RGA("test-client");
  const documentListeners = new Set<(text: string) => void>();
  const readyListeners = new Set<(ready: boolean) => void>();
  const sent: Operation[] = [];

  const client = {
    sent,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isReady: () => true,
    getText: () => rga.toString(),
    getRga: () => rga,
    getClientId: () => "test-client",
    getStatus: () => "synced" as const,
    sendLocalOperation: (op: Operation) => {
      sent.push(op);
      for (const listener of documentListeners) {
        listener(rga.toString());
      }
    },
    sendCursor: vi.fn(),
    onDocumentChange: (listener: (text: string) => void) => {
      documentListeners.add(listener);
      return () => documentListeners.delete(listener);
    },
    onPresenceChange: () => () => undefined,
    onStatusChange: () => () => undefined,
    onCursorChange: () => () => undefined,
    onReadyChange: (listener: (ready: boolean) => void) => {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    emitDocument(text: string) {
      for (const listener of documentListeners) {
        listener(text);
      }
    },
    emitReady() {
      for (const listener of readyListeners) {
        listener(true);
      }
    },
  };

  return client as unknown as SyncClient & {
    emitDocument: (text: string) => void;
    emitReady: () => void;
    sent: Operation[];
  };
}

describe("useCollabDoc", () => {
  it("local keystrokes update the document via RGA insert", async () => {
    const user = userEvent.setup();
    const client = createMockClient();
    render(<Harness client={client} />);

    const doc = screen.getByTestId("doc");
    await user.type(doc, "hi");

    await waitFor(() => {
      expect(doc).toHaveValue("hi");
    });
    expect(client.sent.length).toBeGreaterThan(0);
    expect(client.sent.every((op) => op.type === "insert")).toBe(true);
  });

  it("an incoming remote operation updates the rendered document", async () => {
    const client = createMockClient();
    render(<Harness client={client} />);

    client.emitDocument("remote");

    await waitFor(() => {
      expect(screen.getByTestId("doc")).toHaveValue("remote");
    });
  });
});
