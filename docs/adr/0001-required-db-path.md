# 1. DB path is a required CLI argument, no default or fallback

## Status

Accepted

## Context

`db.js` originally hardcoded the DB path as
`path.join(__dirname, "..", "db", "health_connect.db")` — a location outside
the repo that never existed, so the server could not start. `README.md`
separately documented running `viewer/server.js`, which also didn't match the
actual `server.js` location at the repo root. Both were leftover assumptions
from an earlier layout that were never reconciled with reality.

This is personal health data. A dashboard that silently falls back to a
default path, or discovers a DB via environment scanning, risks pointing at
the wrong file (an old export, a different person's data) without the
operator noticing.

## Decision

The DB path is a required positional CLI argument:

```
node server.js <path-to-health_connect.db>
```

- Missing argument → usage message on stderr, exit 1.
- Argument given but the file doesn't exist → `Database not found: <abs path>`, exit 1.
- No environment variable fallback, no default path, no implicit discovery.
- Both checks happen before `server.listen()`, so a bad invocation never
  opens a port.

`db.js` exposes `createDb(dbPath)` rather than opening a module-scope
`DatabaseSync` at import time — this keeps `db.js` ignorant of `process.argv`
and makes it possible to point at a fixture DB in tests.

## Consequences

- Every invocation is explicit about which DB it's reading — no ambiguity for personal health data.
- Tests can pass an arbitrary fixture path to `createDb()` without touching CLI parsing.
- No convenience default for the common case of a single well-known DB location — acceptable for a single-user POC.
