/**
 * Total-order comparison for RGA identifiers.
 *
 * WHY a total order: when two replicas concurrently insert after the same
 * leftOrigin, each must decide which character sits left of the other. A
 * deterministic total order on identifiers makes that decision identical on
 * every replica without further coordination — that is the CRDT convergence
 * property for concurrent inserts.
 *
 * WHY clientId as tiebreak: Lamport timestamps alone can collide (two clients
 * independently tick to the same number). clientId only needs to be unique per
 * client and compared consistently; it does not need semantic meaning. String
 * lexicographic order is enough and stable across languages/runtimes.
 */

import type { Identifier } from "./types.js";

/**
 * Returns negative if a < b, positive if a > b, zero if equal.
 * Order: timestamp ascending, then clientId ascending.
 */
export function compareIdentifiers(a: Identifier, b: Identifier): number {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  if (a.clientId < b.clientId) {
    return -1;
  }
  if (a.clientId > b.clientId) {
    return 1;
  }
  return 0;
}
