# ADR-0003: Cache query results in-process, keyed by endpoint

## Context

The SQLite database is a static, read-only export of Health Connect data (`health_connect.db`).
Queries over deduplicated series tables (such as sleep stages and heart rate series) incur a cost of ~230 ms due to `DISTINCT` logic over large tables. Computing these on every page reload causes unnecessary latency.

## Decision

Query results are memoized in-memory in `db.js` using a `memoize` wrapper around query functions.
Because the database file is open read-only and static for the server lifecycle, query results cannot go stale.

We cache **computed array results**, not prepared statement objects (`DatabaseSync.prototype.prepare()`), because prepared statements retained across tick boundaries hit a `node:sqlite` bug where statements are unexpectedly finalized.

## Consequences

- Dashboard API responses for `/api/sleep`, `/api/heart-rate`, `/api/body`, and `/api/exercise` after first run return instantly (<1 ms).
- Reduces CPU load on dashboard page reloads.
