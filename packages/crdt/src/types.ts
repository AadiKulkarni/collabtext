/**
 * @collabtext/crdt — shared foundational types for the RGA CRDT.
 *
 * These types are the only contract other packages need from the CRDT core:
 * identifiers for total order, nodes for the local document structure, and
 * operations for the append-only log that replicas exchange. Keeping them
 * free of networking/UI concerns lets the algorithm stay independently testable.
 */

/**
 * Uniquely identifies a character node (and, for deletes, the delete op itself).
 *
 * `timestamp` comes from a Lamport clock so causality is encoded in the number;
 * `clientId` breaks ties when two clients tick to the same logical time.
 */
export interface Identifier {
  timestamp: number;
  clientId: string;
}

/**
 * One element in the RGA sequence.
 *
 * `leftOrigin` is the node this character was inserted after at creation time.
 * Concurrent inserts that share the same `leftOrigin` are ordered by comparing
 * their `id`s — that total order is what makes every replica agree.
 *
 * `deleted` is a tombstone flag: the node stays in the array so later inserts
 * that still point at it as `leftOrigin` have a stable anchor.
 */
export interface RGANode {
  id: Identifier;
  char: string;
  deleted: boolean;
  leftOrigin: Identifier | null;
}

/**
 * An insert that creates a new character node.
 * Carries everything a remote replica needs to place the character identically.
 */
export interface InsertOperation {
  type: "insert";
  id: Identifier;
  char: string;
  leftOrigin: Identifier | null;
}

/**
 * A delete that tombstones an existing character node.
 *
 * `id` is the Lamport identity of *this delete* (used to advance remote clocks).
 * `targetId` is the character node being marked deleted — never physically removed.
 */
export interface DeleteOperation {
  type: "delete";
  id: Identifier;
  targetId: Identifier;
}

/** Union of all operations that travel over the wire / operation log. */
export type Operation = InsertOperation | DeleteOperation;

/** True when two identifiers refer to the same logical entity. */
export function identifiersEqual(a: Identifier, b: Identifier): boolean {
  return a.timestamp === b.timestamp && a.clientId === b.clientId;
}

/** True when two nullable origins are the same anchor (including both null). */
export function originsEqual(
  a: Identifier | null,
  b: Identifier | null,
): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return identifiersEqual(a, b);
}
