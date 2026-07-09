import { describe, expect, it } from "vitest";
import { RGA } from "../src/RGA.js";
import type { Operation } from "../src/types.js";

function applyAll(rga: RGA, ops: Operation[]): void {
  for (const op of ops) {
    rga.applyRemote(op);
  }
}

describe("RGA basic local editing", () => {
  it("inserts characters in order", () => {
    const doc = new RGA("a");
    const h = doc.insert(null, "h");
    const e = doc.insert(h.id, "e");
    doc.insert(e.id, "y");
    expect(doc.toString()).toBe("hey");
  });

  it("delete tombstones without removing the node", () => {
    const doc = new RGA("a");
    const a = doc.insert(null, "a");
    const b = doc.insert(a.id, "b");
    doc.insert(b.id, "c");
    doc.delete(b.id);
    expect(doc.toString()).toBe("ac");
    expect(doc.getNodes()).toHaveLength(3);
    expect(doc.getNodes().filter((n) => n.deleted)).toHaveLength(1);
  });

  it("applyRemote reuses the same placement as local insert", () => {
    const a = new RGA("a");
    const b = new RGA("b");
    const op = a.insert(null, "x");
    b.applyRemote(op);
    expect(a.toString()).toBe("x");
    expect(b.toString()).toBe("x");
  });
});

describe("RGA convergence — fixed order permutations", () => {
  it("two replicas converge when the same ops arrive in different orders", () => {
    const author = new RGA("author");
    const ops: Operation[] = [];
    const first = author.insert(null, "A");
    ops.push(first);
    const second = author.insert(first.id, "B");
    ops.push(second);
    const third = author.insert(second.id, "C");
    ops.push(third);
    ops.push(author.delete(second.id));

    const r1 = new RGA("r1");
    const r2 = new RGA("r2");
    applyAll(r1, ops);
    applyAll(r2, [...ops].reverse());

    expect(r1.toString()).toBe(r2.toString());
    expect(r1.toString()).toBe("AC");
  });
});
