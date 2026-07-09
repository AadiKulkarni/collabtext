# CollabText Design Document

## Problem

Real-time collaborative text editing requires concurrent inserts and deletes from
multiple clients to converge to the same document without a central lock.
Network partitions, reordering, and offline editing are expected — not edge cases.

## Why CRDT over Operational Transform

Operational Transformation (OT) transforms incoming ops against a server's
canonical history. Correctness depends on the server applying the right
transform functions; offline/multi-hop scenarios get complex quickly.

A Conflict-free Replicated Data Type (CRDT) makes every replica apply the same
deterministic merge rules. The server can be a dumb relay. That matches this
project's architecture: `packages/server` stores and broadcasts an append-only
operation log; `packages/crdt` is the sole source of conflict resolution.

## Why RGA specifically

Among sequence CRDTs:

- **Logoot / LSEQ** allocate dense fractional positions; identifier size can grow
  under pathological insert patterns.
- **Treedoc / WOOT** use tree or tombstone-heavy structures with heavier metadata.
- **RGA (Replicated Growable Array)** attaches each character to a unique
  Identifier and a `leftOrigin` (the node it was inserted after). Concurrent
  inserts after the same origin are ordered by comparing Identifiers. Deletes
  are tombstones so anchors remain stable.

RGA is a strong interview story: the walk-right insertion rule is short enough
to explain on a whiteboard, and tombstones make the concurrent-delete-vs-insert
case intuitive.

## Algorithm walkthrough

### Identifiers and Lamport clocks

Each operation gets an `Identifier = { timestamp, clientId }`.

- `timestamp` comes from a **Lamport clock** (`LogicalClock.tick` /
  `observe`), not `Date.now()`. Wall clocks are not causal; Lamport clocks
  guarantee that if A causally preceded B, then `timestamp(A) < timestamp(B)`.
- `clientId` breaks ties when two clients independently reach the same logical
  time. Lexicographic order is enough — uniqueness and consistency matter, not
  meaning.

`compareIdentifiers` defines a total order: timestamp first, then clientId.
That total order is what makes concurrent-insert resolution deterministic.

### Insert

`RGA.insert(afterId, char)`:

1. Tick the local Lamport clock to mint a new Identifier.
2. Create a node `{ id, char, deleted: false, leftOrigin: afterId }`.
3. Find the index just after `leftOrigin` (or `0` if null).
4. **Walk right** while the next node's id is *greater* than the new id —
   those greater siblings stay to the left.
5. Splice the node in and return an `InsertOperation` for broadcast.

### Delete

`RGA.delete(targetId)` marks `deleted = true` and returns a `DeleteOperation`.
The node is **not** removed. Tombstones keep `leftOrigin` anchors valid when
another replica concurrently inserts after a character that was deleted.

### Remote apply

`applyRemote(op)` calls `clock.observe(op.id.timestamp)` then the **same**
`applyInsert` / `applyDelete` helpers used locally. One code path prevents
"local vs remote" divergence bugs. Ops whose anchors are not yet present are
buffered and flushed when dependencies arrive (out-of-order delivery).

### Concrete concurrent-insert example

Shared document contains `X` with id `Xid`.

- Alice inserts `A` after `Xid` → id `{t:5, clientId:"alice"}`
- Bob inserts `B` after `Xid` → id `{t:5, clientId:"bob"}`

Neither has seen the other's op yet. After exchange:

- Both start after `X` and walk right past any node with a greater id.
- `"bob" > "alice"` lexicographically, so Bob's id is greater → `B` sits left
  of `A`.
- Final visible string on both replicas: `XBA`.

### Correctness argument (convergence)

For a fixed set of operations, every replica that applies the full set ends up
with the same sequence because:

1. Each character node has a unique Identifier.
2. Insertion position is a pure function of `{leftOrigin, id}` and the set of
   already-present nodes, using a total order on ids.
3. Deletes only flip a tombstone bit; they do not remove anchors.
4. Pending-op buffering makes delivery order irrelevant once the full set is in.

Property-based tests in `packages/crdt/test/rga.convergence.test.ts` shuffle
delivery order across three replicas and assert identical `toString()` results.

## Architecture

```
Browser (React)                    Node relay
┌─────────────────────┐            ┌──────────────────────┐
│ Editor / useCollabDoc│  WebSocket │ ConnectionManager    │
│ SyncClient           │◄─────────►│ DocumentRoom         │
│ local RGA            │  ops +    │ append-only op log   │
│ outbox on offline    │  cursors  │ presence + cursor fanout │
└─────────┬───────────┘            └──────────────────────┘
          │
          ▼
   @collabtext/crdt (pure)
```

Cursor messages are ephemeral (not logged). Document ops are logged for hydrate
on join/reconnect. Reconnect applies unseen log ops via `applyRemote`, then
flushes the local outbox — no bespoke merge.

## Phase 5 optimization (completed)

`RGA` now maintains an `indexById: Map<string, number>` so `leftOrigin` /
delete-target resolution is **O(1)** instead of an O(n) array scan. On insert,
indices at or after the splice point are incremented so the map stays accurate;
tombstones keep their map entries because they remain valid anchors.

Measured on a 12,000-character document: hashmap lookups are ~280× faster than
the linear baseline. Full numbers: [docs/benchmark-results.md](./docs/benchmark-results.md).

## What I'd change for production

1. **Sequence structure** — lookup is fixed; remaining per-insert cost is O(n)
   `Array.splice` plus shifting the index map. A tree/rope keyed by Identifier
   order would make placement and index maintenance logarithmic at 100k+ chars.
2. **In-memory-only server log** — add periodic snapshots (e.g. Postgres) plus
   WAL-style replay so restarts do not lose history.
3. **Single-document room** — introduce a `DocumentRoom` registry keyed by
   document id, with authz on join.
4. **Tombstone GC** — after all replicas acknowledge a causal cutoff, compact
   deleted nodes (requires version vectors / causal stability).
5. **Auth and rate limits** on the WebSocket layer before public deployment.
