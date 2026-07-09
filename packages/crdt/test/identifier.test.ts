import { describe, expect, it } from "vitest";
import { compareIdentifiers } from "../src/Identifier.js";
import { LogicalClock } from "../src/LogicalClock.js";
import type { Identifier } from "../src/types.js";

describe("compareIdentifiers", () => {
  it("orders primarily by timestamp", () => {
    const a: Identifier = { timestamp: 1, clientId: "z" };
    const b: Identifier = { timestamp: 2, clientId: "a" };
    expect(compareIdentifiers(a, b)).toBeLessThan(0);
    expect(compareIdentifiers(b, a)).toBeGreaterThan(0);
  });

  it("uses clientId as a deterministic tiebreak", () => {
    const a: Identifier = { timestamp: 5, clientId: "alice" };
    const b: Identifier = { timestamp: 5, clientId: "bob" };
    expect(compareIdentifiers(a, b)).toBeLessThan(0);
    expect(compareIdentifiers(b, a)).toBeGreaterThan(0);
  });

  it("returns zero for identical identifiers", () => {
    const a: Identifier = { timestamp: 3, clientId: "c1" };
    const b: Identifier = { timestamp: 3, clientId: "c1" };
    expect(compareIdentifiers(a, b)).toBe(0);
  });

  it("is transitive across a chain of identifiers", () => {
    const ids: Identifier[] = [
      { timestamp: 1, clientId: "a" },
      { timestamp: 1, clientId: "b" },
      { timestamp: 2, clientId: "a" },
      { timestamp: 3, clientId: "z" },
    ];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        for (let k = j + 1; k < ids.length; k += 1) {
          const left = ids[i]!;
          const mid = ids[j]!;
          const right = ids[k]!;
          expect(compareIdentifiers(left, mid)).toBeLessThan(0);
          expect(compareIdentifiers(mid, right)).toBeLessThan(0);
          expect(compareIdentifiers(left, right)).toBeLessThan(0);
        }
      }
    }
  });
});

describe("LogicalClock", () => {
  it("tick() strictly increases", () => {
    const clock = new LogicalClock();
    const t1 = clock.tick();
    const t2 = clock.tick();
    const t3 = clock.tick();
    expect(t1).toBe(1);
    expect(t2).toBe(2);
    expect(t3).toBe(3);
    expect(t2).toBeGreaterThan(t1);
    expect(t3).toBeGreaterThan(t2);
  });

  it("observe() advances past a higher remote timestamp", () => {
    const clock = new LogicalClock();
    clock.tick(); // local = 1
    clock.observe(10);
    expect(clock.current()).toBe(11);
    const next = clock.tick();
    expect(next).toBe(12);
  });

  it("observe() still advances when remote is behind local", () => {
    const clock = new LogicalClock();
    clock.tick();
    clock.tick();
    clock.tick(); // local = 3
    clock.observe(1);
    expect(clock.current()).toBe(4);
  });
});
