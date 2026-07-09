# CollabText

A from-scratch CRDT collaborative text editor — RGA algorithm, WebSocket relay,
and React client — built as a systems/algorithms portfolio project.

![Demo placeholder](docs/demo.gif)

> Add `docs/demo.gif` after recording the two-tab sync → concurrent edit →
> offline/reconnect sequence.

## Why this exists

Interviewers ask how collaborative editors stay consistent under concurrency and
partitions. CollabText answers with a real implementation: a pure TypeScript RGA
in `packages/crdt` (no Yjs/Automerge), a dumb relay server, and a client that
trusts CRDT convergence on reconnect instead of special-case merge code.

## Features

- Character-level collaborative editing via a hand-rolled RGA CRDT
- Lamport clocks + total-order identifiers for concurrent insert resolution
- Tombstone deletes so concurrent insert-after-deleted-anchor still converges
- WebSocket hydrate + broadcast relay (no server-side conflict resolution)
- Offline outbox + reconnect that only calls `applyRemote`
- Presence list and ephemeral live cursors
- Property-based convergence tests (`fast-check`) plus a real-socket integration test

## Architecture

| Package | Role |
|---------|------|
| `@collabtext/crdt` | RGA, identifiers, Lamport clock — zero networking/UI deps |
| `@collabtext/server` | WebSocket `DocumentRoom` relay + append-only op log |
| `@collabtext/client` | Vite/React editor, `SyncClient`, `useCollabDoc` |

See [DESIGN.md](./DESIGN.md) for the algorithm walkthrough and tradeoffs.

## Quick start

Requirements: Node 20+, pnpm 9+.

```bash
pnpm install
pnpm --filter @collabtext/server dev   # ws://localhost:8080
pnpm --filter @collabtext/client dev   # http://localhost:5173
```

Open two browser tabs against the Vite URL and type — both should sync live.

Optional: set `VITE_WS_URL` (see `packages/client/.env.example`) when the
relay is not on localhost.

## Scripts

```bash
pnpm test    # all workspaces
pnpm lint
pnpm build
pnpm bench   # RGA lookup microbenchmark → docs/benchmark-results.md
```

## Tests worth reading

- `packages/crdt/test/rga.convergence.test.ts` — randomized ops + shuffled delivery
- `packages/crdt/test/rga.concurrent.test.ts` — same-position inserts + delete/insert
- `packages/crdt/test/rga.reconnect.test.ts` — offline queue simulation
- `packages/client/test/reconnect.integration.test.ts` — real `ws` server + clients
- `packages/server/test/DocumentRoom.test.ts` — hydrate / broadcast / presence mocks

## Deploy

**Server (Fly.io / Render):** `packages/server/Dockerfile` builds the relay.
Set `PORT` (default `8080`).

**Client (Vercel / Netlify):** build `packages/client` with Vite. Set
`VITE_WS_URL` to your deployed `wss://` relay URL at build time.

```bash
# example client production build
VITE_WS_URL=wss://your-server.example.com pnpm --filter @collabtext/client build
```

## Known limitations

- **Identifier lookup is O(1)** via an `indexById` hashmap (Phase 5). Benchmarks
  on a 12k-character document show ~**280×** faster lookups vs the previous
  linear scan — see [docs/benchmark-results.md](./docs/benchmark-results.md).
  The **next** bottleneck at larger scale is O(n) `Array.splice` + shifting the
  index map on every insert; a tree/rope sequence would be the follow-up.
- Server op log is **in-memory only** — process restart loses history.
- Single document room (no multi-doc registry or auth yet).
- Tombstones are never garbage-collected.

## License

MIT — see [LICENSE](./LICENSE).
