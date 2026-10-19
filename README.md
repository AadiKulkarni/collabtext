# CollabText

**Live demo:** https://collabtext-kappa.vercel.app (open in two tabs)

*Free-tier server: first load may take ~30s to wake up.*

<!-- ![Demo](docs/demo.gif) -->

A from-scratch CRDT collaborative text editor: RGA algorithm, WebSocket relay,
and React client.

## Why this exists

Collaborative editors have to stay consistent under concurrent edits and network
partitions. CollabText does this with a real implementation: a pure TypeScript
RGA in `packages/crdt` (no Yjs/Automerge), a dumb relay server, and a client that
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

**Server (Render):** Web Service from this repo. Use Docker with
`packages/server/Dockerfile` and set the Docker build context to the **repo
root** (the Dockerfile copies workspace files from there). Render sets `PORT`;
the server reads it (default `8080`). Prefer the `wss://` URL Render gives you
for the client env var below.

**Client (Vercel):** Deploy from the repo root (`vercel.json` builds
`@collabtext/client...` and outputs `packages/client/dist`). Set `VITE_WS_URL`
in the Vercel project env to your Render WebSocket URL (e.g.
`wss://your-service.onrender.com`).

```bash
# Optional: local production client build against a deployed relay
VITE_WS_URL=wss://your-service.onrender.com pnpm --filter "@collabtext/client..." build
```

If the Vercel project Root Directory is `packages/client`, that package’s
`vercel.json` is used instead of the repo-root config.

## Known limitations

- **Identifier lookup is O(1)** via an `indexById` hashmap. Benchmarks on a
  12k-character document show ~**280×** faster lookups vs the previous linear
  scan — see [docs/benchmark-results.md](./docs/benchmark-results.md). The
  **next** bottleneck at larger scale is O(n) `Array.splice` + shifting the
  index map on every insert; a tree/rope sequence would be the follow-up.
- Server op log is **in-memory only** — process restart loses history.
- Single document room (no multi-doc registry or auth yet).
- Tombstones are never garbage-collected.

## License

MIT — see [LICENSE](./LICENSE).
