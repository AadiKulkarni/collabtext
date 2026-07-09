import { describe, expect, it } from "vitest";
import type { Operation } from "@collabtext/crdt";
import { DocumentRoom, type RoomSocket } from "../src/DocumentRoom.js";

function mockSocket(): RoomSocket & { messages: unknown[] } {
  const messages: unknown[] = [];
  return {
    messages,
    send(data: string) {
      messages.push(JSON.parse(data));
    },
  };
}

const sampleOp = (char: string): Operation => ({
  type: "insert",
  id: { timestamp: 1, clientId: "author" },
  char,
  leftOrigin: null,
});

describe("DocumentRoom", () => {
  it("sends the current full log to a newly joining client", () => {
    const room = new DocumentRoom();
    const early = mockSocket();
    room.join("a", early);
    room.handleOperation(sampleOp("x"), "a");

    const late = mockSocket();
    room.join("b", late);

    const hydrate = late.messages.find(
      (m) => (m as { type: string }).type === "hydrate",
    ) as { type: string; log: Operation[]; clientId: string };

    expect(hydrate).toBeDefined();
    expect(hydrate.clientId).toBe("b");
    expect(hydrate.log).toHaveLength(1);
    expect(hydrate.log[0]?.type).toBe("insert");
  });

  it("broadcasts an operation to peers but not back to the sender", () => {
    const room = new DocumentRoom();
    const a = mockSocket();
    const b = mockSocket();
    room.join("a", a);
    room.join("b", b);
    a.messages.length = 0;
    b.messages.length = 0;

    room.handleOperation(sampleOp("z"), "a");

    expect(
      a.messages.some((m) => (m as { type: string }).type === "operation"),
    ).toBe(false);
    expect(
      b.messages.some((m) => (m as { type: string }).type === "operation"),
    ).toBe(true);
  });

  it("updates presence when a client leaves", () => {
    const room = new DocumentRoom();
    const a = mockSocket();
    const b = mockSocket();
    room.join("a", a);
    room.join("b", b);
    a.messages.length = 0;

    room.leave("b");

    const presence = a.messages.find(
      (m) => (m as { type: string }).type === "presence",
    ) as { presence: string[] };
    expect(presence.presence).toEqual(["a"]);
  });

  it("relays cursor messages without appending to the log", () => {
    const room = new DocumentRoom();
    const a = mockSocket();
    const b = mockSocket();
    room.join("a", a);
    room.join("b", b);
    b.messages.length = 0;

    room.handleCursor("a", 3);

    expect(room.getLog()).toHaveLength(0);
    expect(b.messages).toContainEqual({
      type: "cursor",
      clientId: "a",
      index: 3,
    });
  });
});
