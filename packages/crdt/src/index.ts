/**
 * @collabtext/crdt — pure CRDT core for CollabText.
 *
 * Owns the RGA (Replicated Growable Array) algorithm, identifiers, and
 * Lamport clocks. This package has zero runtime dependencies on networking
 * or UI so it can be unit-tested and reasoned about in complete isolation;
 * clients and the server import Operation types and RGA behavior from here.
 */

export type {
  DeleteOperation,
  Identifier,
  InsertOperation,
  Operation,
  RGANode,
} from "./types.js";
export { identifiersEqual, originsEqual } from "./types.js";
export { compareIdentifiers } from "./Identifier.js";
export { LogicalClock } from "./LogicalClock.js";
export { RGA } from "./RGA.js";
