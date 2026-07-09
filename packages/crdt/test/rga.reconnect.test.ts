import { describe, expect, it } from "vitest";
import { RGA } from "../src/RGA.js";
import type { Operation } from "../src/types.js";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

describe("RGA reconnect / offline queue simulation", () => {
  it("converges after A was offline generating ops while B also edited", () => {
    const a = new RGA("alice");
    const b = new RGA("bob");

    // Shared starting point delivered to both.
    const shared: Operation[] = [];
    const first = a.insert(null, "S");
    shared.push(first);
    b.applyRemote(first);

    // A goes offline: queue local ops instead of delivering to B.
    const aQueue: Operation[] = [];
    const a1 = a.insert(first.id, "A");
    aQueue.push(a1);
    const a2 = a.insert(a1.id, "a");
    aQueue.push(a2);

    // B keeps editing while A is offline.
    const bMissed: Operation[] = [];
    const b1 = b.insert(first.id, "B");
    bMissed.push(b1);
    const b2 = b.insert(b1.id, "b");
    bMissed.push(b2);

    // Reconnect: deliver B's missed ops to A (shuffled) and A's queue to B.
    for (const op of shuffle(bMissed)) {
      a.applyRemote(op);
    }
    for (const op of shuffle(aQueue)) {
      b.applyRemote(op);
    }

    expect(a.toString()).toBe(b.toString());
    // Both characters from each side must be present.
    expect(a.toString()).toContain("A");
    expect(a.toString()).toContain("a");
    expect(a.toString()).toContain("B");
    expect(a.toString()).toContain("b");
    expect(a.toString()).toContain("S");
  });
});
