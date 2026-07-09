/**
 * Core RGA (Replicated Growable Array) structure for CollabText.
 *
 * WHY tombstones (`deleted: true`) instead of physical removal: a concurrent
 * insert may still name a deleted node as its `leftOrigin`. If we removed that
 * node from the sequence, replicas that apply the delete before vs after the
 * insert would place the new character differently (or fail to find the
 * anchor). Keeping the tombstone preserves a stable insertion anchor so every
 * replica converges to the same order. Visible text simply skips tombstones.
 *
 * Storage is a plain array with linear scans — intentionally O(n) for clarity.
 * A hashmap index is an optional later optimization, not required for correctness.
 */

import { compareIdentifiers } from "./Identifier.js";
import { LogicalClock } from "./LogicalClock.js";
import type {
  DeleteOperation,
  Identifier,
  InsertOperation,
  Operation,
  RGANode,
} from "./types.js";
import { identifiersEqual } from "./types.js";

export class RGA {
  private readonly clientId: string;
  private readonly clock: LogicalClock;
  private readonly nodes: RGANode[] = [];
  /** Ops whose leftOrigin/target is not present yet (out-of-order delivery). */
  private readonly pending: Operation[] = [];

  constructor(clientId: string, clock: LogicalClock = new LogicalClock()) {
    this.clientId = clientId;
    this.clock = clock;
  }

  getClientId(): string {
    return this.clientId;
  }

  /**
   * Local insert after `afterId` (null = beginning of the document).
   * Returns the operation that must be broadcast to other replicas.
   */
  insert(afterId: Identifier | null, char: string): InsertOperation {
    if (char.length !== 1) {
      throw new Error("RGA.insert expects a single character");
    }
    const id: Identifier = {
      timestamp: this.clock.tick(),
      clientId: this.clientId,
    };
    const op: InsertOperation = {
      type: "insert",
      id,
      char,
      leftOrigin: afterId,
    };
    this.applyInsert(op);
    return op;
  }

  /**
   * Local delete: tombstone the node, never splice it out.
   * Returns the operation that must be broadcast to other replicas.
   */
  delete(targetId: Identifier): DeleteOperation {
    const id: Identifier = {
      timestamp: this.clock.tick(),
      clientId: this.clientId,
    };
    const op: DeleteOperation = {
      type: "delete",
      id,
      targetId,
    };
    this.applyDelete(op);
    return op;
  }

  /**
   * Apply an operation that originated on another replica.
   *
   * Observes the remote Lamport timestamp first, then reuses the same
   * insert/delete helpers as local methods so there is one code path for
   * placement and tombstoning (critical for convergence).
   */
  applyRemote(op: Operation): void {
    this.clock.observe(op.id.timestamp);
    if (op.type === "insert") {
      this.applyInsert(op);
    } else {
      this.applyDelete(op);
    }
  }

  /** Visible document text: non-deleted characters in sequence order. */
  toString(): string {
    let result = "";
    for (const node of this.nodes) {
      if (!node.deleted) {
        result += node.char;
      }
    }
    return result;
  }

  /** All nodes including tombstones (for tests / debugging). */
  getNodes(): readonly RGANode[] {
    return this.nodes;
  }

  /**
   * Identifier of the visible character immediately before a caret index,
   * or null when inserting at the start of the document.
   *
   * Caret index is in visible-character space (tombstones do not count).
   */
  leftOriginAtVisibleIndex(visibleIndex: number): Identifier | null {
    if (visibleIndex <= 0) {
      return null;
    }
    let seen = 0;
    for (const node of this.nodes) {
      if (node.deleted) {
        continue;
      }
      seen += 1;
      if (seen === visibleIndex) {
        return node.id;
      }
    }
    // Past end: insert after the last visible character.
    return this.lastVisibleId();
  }

  /**
   * Identifier of the visible character that backspace at `visibleIndex`
   * should delete (the character immediately before the caret), or null.
   */
  targetIdBeforeVisibleIndex(visibleIndex: number): Identifier | null {
    if (visibleIndex <= 0) {
      return null;
    }
    let seen = 0;
    for (const node of this.nodes) {
      if (node.deleted) {
        continue;
      }
      seen += 1;
      if (seen === visibleIndex) {
        return node.id;
      }
    }
    return null;
  }

  private lastVisibleId(): Identifier | null {
    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      const node = this.nodes[i];
      if (node && !node.deleted) {
        return node.id;
      }
    }
    return null;
  }

  private findIndex(id: Identifier): number {
    for (let i = 0; i < this.nodes.length; i += 1) {
      const node = this.nodes[i];
      if (node && identifiersEqual(node.id, id)) {
        return i;
      }
    }
    return -1;
  }

  private hasNode(id: Identifier): boolean {
    return this.findIndex(id) !== -1;
  }

  /**
   * Shared insert path for local and remote operations.
   *
   * Walk-right rule (classic RGA): after the `leftOrigin` slot, skip every
   * following node whose Identifier is *greater* than the new node's id.
   * Higher ids therefore sit to the left of lower ids among concurrent
   * inserts at the same position. We compare against *any* subsequent node
   * (not only same-leftOrigin siblings) so causal chains that grew under a
   * concurrent peer still end up in the same absolute order on every replica.
   */
  private applyInsert(op: InsertOperation): void {
    if (this.hasNode(op.id)) {
      return;
    }

    if (op.leftOrigin !== null && !this.hasNode(op.leftOrigin)) {
      this.pending.push(op);
      return;
    }

    this.insertNode({
      id: op.id,
      char: op.char,
      deleted: false,
      leftOrigin: op.leftOrigin,
    });
    this.flushPending();
  }

  private insertNode(node: RGANode): void {
    let index = 0;
    if (node.leftOrigin !== null) {
      index = this.findIndex(node.leftOrigin) + 1;
    }

    while (index < this.nodes.length) {
      const existing = this.nodes[index];
      if (!existing) {
        break;
      }
      // Greater ids stay to the left → walk past them.
      if (compareIdentifiers(existing.id, node.id) > 0) {
        index += 1;
        continue;
      }
      break;
    }

    this.nodes.splice(index, 0, node);
  }

  private applyDelete(op: DeleteOperation): void {
    const index = this.findIndex(op.targetId);
    if (index === -1) {
      this.pending.push(op);
      return;
    }
    const node = this.nodes[index];
    if (node) {
      node.deleted = true;
    }
    this.flushPending();
  }

  /**
   * Retry buffered ops now that more anchors may exist.
   * Uses insertNode/tombstone directly (not applyInsert/applyDelete) to avoid
   * re-entrant flushPending calls while iterating the pending queue.
   */
  private flushPending(): void {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let i = 0; i < this.pending.length; ) {
        const op = this.pending[i];
        if (!op) {
          i += 1;
          continue;
        }
        if (op.type === "insert") {
          const ready = op.leftOrigin === null || this.hasNode(op.leftOrigin);
          if (ready) {
            this.pending.splice(i, 1);
            if (!this.hasNode(op.id)) {
              this.insertNode({
                id: op.id,
                char: op.char,
                deleted: false,
                leftOrigin: op.leftOrigin,
              });
              progressed = true;
            }
            continue;
          }
        } else if (this.hasNode(op.targetId)) {
          this.pending.splice(i, 1);
          const index = this.findIndex(op.targetId);
          const node = this.nodes[index];
          if (node) {
            node.deleted = true;
          }
          progressed = true;
          continue;
        }
        i += 1;
      }
    }
  }
}
