import { describe, expect, it } from "vitest";
import { compareIdentifiers } from "../src/Identifier.js";
import { RGA } from "../src/RGA.js";

describe("RGA concurrent inserts", () => {
  it("two concurrent inserts at the same leftOrigin resolve to identical order", () => {
    const a = new RGA("alice");
    const b = new RGA("bob");

    // Shared prefix so both insert after the same origin.
    const originOp = a.insert(null, "X");
    b.applyRemote(originOp);

    // Concurrent inserts after X — neither has seen the other's op yet.
    const opA = a.insert(originOp.id, "A");
    const opB = b.insert(originOp.id, "B");

    a.applyRemote(opB);
    b.applyRemote(opA);

    expect(a.toString()).toBe(b.toString());

    // Explicit order check: higher Identifier sits to the left among siblings.
    const expected =
      compareIdentifiers(opA.id, opB.id) > 0 ? "XAB" : "XBA";
    expect(a.toString()).toBe(expected);
    expect(b.toString()).toBe(expected);
  });
});

describe("RGA concurrent delete + insert on same anchor", () => {
  it("converges when one replica deletes the leftOrigin another inserts after", () => {
    const a = new RGA("alice");
    const b = new RGA("bob");

    const originOp = a.insert(null, "X");
    b.applyRemote(originOp);

    // A deletes X; B concurrently inserts after X.
    const deleteOp = a.delete(originOp.id);
    const insertOp = b.insert(originOp.id, "Y");

    a.applyRemote(insertOp);
    b.applyRemote(deleteOp);

    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toBe("Y");
    // Tombstone for X must still exist as the insert's anchor.
    expect(a.getNodes().some((n) => n.deleted && n.char === "X")).toBe(true);
  });
});
