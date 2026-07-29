# Health Connect Viewer (POC)

A minimal local dashboard over a Health Connect export DB. Zero runtime
dependencies — just Node's built-in `node:http` and `node:sqlite`.

## Run

```sh
npm start -- path/to/health_connect.db
```

(equivalent to `node --disable-warning=ExperimentalWarning server.js path/to/health_connect.db`)

Then open <http://localhost:3000>.

The DB path is a required argument — the server refuses to start without one
or if the path doesn't exist (see `docs/adr/0001-required-db-path.md`).

`node:sqlite` is an experimental API in Node 22; the flag above just silences
the startup warning it prints. Override the port with `PORT=4000 node ...`.

The database is opened **read-only** and the server binds to `127.0.0.1`
only — it never writes to the DB and isn't reachable from the network.

## Current scope

One panel: steps per day, from `steps_record_table`. Adding another panel
means adding a query to `db.js` and a route in `server.js` — the DB access
and HTTP layer are already split for that.
