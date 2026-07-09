import { describe, expect, it } from "vitest";
import { identifierKey, RGA } from "../src/RGA.js";

describe("RGA index map", () => {
  it("keeps indexById consistent with array positions after inserts", () => {
    const doc = new RGA("a");
    const ids = [];
    let prev = null as ReturnType<typeof doc.insert>["id"] | null;
    for (const char of "hello") {
      const op = doc.insert(prev, char);
      ids.push(op.id);
      prev = op.id;
    }

    const nodes = doc.getNodes();
    expect(nodes).toHaveLength(5);
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]!;
      expect(doc.lookupIndex(node.id)).toBe(i);
      expect(identifierKey(node.id)).toContain(node.id.clientId);
    }
  });

  it("still finds tombstoned nodes by id (anchors remain addressable)", () => {
    const doc = new RGA("a");
    const a = doc.insert(null, "a");
    const b = doc.insert(a.id, "b");
    const c = doc.insert(b.id, "c");
    doc.delete(b.id);

    expect(doc.toString()).toBe("ac");
    expect(doc.lookupIndex(b.id)).toBe(1);
    expect(doc.lookupIndex(a.id)).toBe(0);
    expect(doc.lookupIndex(c.id)).toBe(2);
  });

  it("lookup stays correct when inserting in the middle", () => {
    const doc = new RGA("a");
    const a = doc.insert(null, "a");
    const c = doc.insert(a.id, "c");
    const b = doc.insert(a.id, "b"); // between a and c after walk-right

    expect(doc.lookupIndex(a.id)).toBe(0);
    expect(doc.lookupIndex(b.id)).toBeGreaterThanOrEqual(0);
    expect(doc.lookupIndex(c.id)).toBeGreaterThanOrEqual(0);
    // Every node index must match getNodes() position.
    doc.getNodes().forEach((node, i) => {
      expect(doc.lookupIndex(node.id)).toBe(i);
    });
  });
});
