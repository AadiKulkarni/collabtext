import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RGA } from "../src/RGA.js";
import type { Identifier, Operation } from "../src/types.js";

function shuffleInPlace<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}

/**
 * Generate a sequence of operations by driving a single authoring RGA,
 * then deliver that same op list to N replicas in independently shuffled
 * orders. Convergence means every replica's toString() matches.
 */
function generateOps(seedClient: string, length: number, random: () => number): Operation[] {
  const author = new RGA(seedClient);
  const ops: Operation[] = [];
  const liveIds: Identifier[] = [];

  for (let i = 0; i < length; i += 1) {
    const doDelete = liveIds.length > 0 && random() < 0.3;
    if (doDelete) {
      const idx = Math.floor(random() * liveIds.length);
      const target = liveIds[idx]!;
      liveIds.splice(idx, 1);
      ops.push(author.delete(target));
    } else {
      const after =
        liveIds.length === 0 || random() < 0.2
          ? null
          : liveIds[Math.floor(random() * liveIds.length)]!;
      const char = String.fromCharCode(97 + Math.floor(random() * 26));
      const op = author.insert(after, char);
      ops.push(op);
      liveIds.push(op.id);
    }
  }
  return ops;
}

describe("RGA convergence — property-based", () => {
  it("three replicas converge under randomized ops and delivery orders", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.nat(), (opCount, seed) => {
        // Deterministic PRNG from the fast-check seed so failures reproduce.
        let state = seed >>> 0;
        const random = (): number => {
          state = (Math.imul(1664525, state) + 1013904223) >>> 0;
          return state / 0x100000000;
        };

        const ops = generateOps("author", opCount, random);
        const replicas = [new RGA("r0"), new RGA("r1"), new RGA("r2")];

        for (const replica of replicas) {
          const delivery = [...ops];
          shuffleInPlace(delivery, random);
          for (const op of delivery) {
            replica.applyRemote(op);
          }
        }

        const texts = replicas.map((r) => r.toString());
        expect(texts[0]).toBe(texts[1]);
        expect(texts[1]).toBe(texts[2]);
      }),
      { numRuns: 50 },
    );
  });
});
