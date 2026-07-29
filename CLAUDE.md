# Health Connect Viewer — AI Agent Instructions

## Project Overview

Health Connect Viewer is a minimal local dashboard over a Health Connect
export (`health_connect.db`). It has zero runtime dependencies — only Node's
built-in `node:http` and `node:sqlite` — and is designed so this personal
health data never has to leave the machine: the DB is opened read-only and
the server binds to `127.0.0.1` only.

See [docs/GLOSSARY.md](docs/GLOSSARY.md) for the project's domain vocabulary
(Health Connect record tables, `local_date` as epoch days, etc.) and
[docs/adr/](docs/adr/) for the reasoning behind non-obvious decisions.

---

## Constitution Principles (Non-Negotiable)

1. **Performance-Focused** — minimize CPU and memory usage without sacrificing correctness.
2. **Test-Driven Development** — write the failing test first, using `node:test` (`node --test`), before writing implementation code. All new features and bug fixes require tests.
3. **Prefer Node Built-ins Over Dependencies** — this project has zero runtime dependencies by design. Reach for `node:*` modules first. If a dependency genuinely can't be avoided, check its docs via Context7 MCP before introducing it.
4. **WHY-Focused Doc Comments** — mandatory on every new or modified function/class/logical block where the reason isn't obvious from the code itself (see below).

---

## Documentation

- **`docs/adr/`** — architecture decision records for non-obvious choices (e.g. why the DB path is a required CLI argument, why statements are re-prepared per call). Numbered, one decision per file.
- **`docs/GLOSSARY.md`** — domain vocabulary for Health Connect's data model.
- Doc comments should link to the relevant ADR or doc by repo-relative path when one exists (see below).

---

## Doc Comments (Mandatory Where Non-Obvious)

Every new or modified function, method, or logical block whose purpose or
constraints aren't obvious from its name and code **must** have a comment
explaining **WHY**, not how. Trivial functions (e.g. a one-line HTML escaper)
don't need one.

- Plain prose is fine — no XML tags or fixed section headers required.
- Use JSDoc `@param`/`@return` for exported functions and anything crossing a
  module boundary (this is plain JS, so editors and tooling read these).
- When a decision has a larger writeup, link it by repo-relative path, e.g.
  `// see docs/adr/0001-required-db-path.md`.
- Note side effects (I/O, mutations, process exit) inline where they aren't
  obvious from the function name.

Worked example already in the codebase — `db.js`'s comment on why the
prepared statement isn't cached at module scope (a `node:sqlite` 22.14 bug)
is exactly the kind of thing that must be documented: non-obvious, costly to
rediscover, invisible from the code alone.

Rules:
- Comments must be in **English**.
- When editing existing code, read and preserve existing doc comments; update them only if behavior changes.
- Do **not** remove existing doc comments unless they are being replaced.

---

## Stack

- **Runtime**: Node.js 22, ESM (`"type": "module"` semantics via `.js` files using `import`/`export`).
- **HTTP**: `node:http` directly — no framework.
- **DB**: `node:sqlite` (`DatabaseSync`), experimental in Node 22 — run with `--disable-warning=ExperimentalWarning`. Always opened `{ readOnly: true }`.
- **Frontend**: vanilla HTML/CSS/JS, no framework, no bundler, no build step. Charts are hand-rolled SVG (no charting library).
- **Testing**: `node:test` + `node --test`, no test framework dependency.
- **Dependencies**: none. `package.json` exists only for `start`/`test` scripts (`type: module`, `engines.node`) — no runtime or dev dependencies. Keep it that way.

---

## Architecture & Folder Conventions

- **`server.js`** — HTTP layer only: routing, static file serving from `public/` (with a path-escape guard), JSON responses. Binds `127.0.0.1` only.
- **`db.js`** — all SQL lives here. Exposes query functions; nothing outside `db.js` should touch `node:sqlite` directly.
- **`public/`** — static frontend: `index.html`, `app.js` (fetch + render), `style.css`. No framework.
- **`test/`** — `node:test` files, one per module under test.
- **`docs/adr/`, `docs/GLOSSARY.md`** — see Documentation above.

**Extension pattern**: adding a new dashboard panel means adding a query
function to `db.js`, a route in `server.js`, and render code in
`public/app.js` — the DB access and HTTP layer are already split for that.

---

## Invariants

These constraints must survive any edit:

- The DB is always opened with `{ readOnly: true }` — never write to it.
- The server binds to `127.0.0.1` only — never `0.0.0.0` or unspecified.
- `serveStatic` in `server.js` must keep rejecting any resolved path outside `public/`.
- Health Connect table columns are stored as `TEXT` — cast before arithmetic. `local_date` is epoch **days**, not epoch seconds or a date string.

---

## Development Rules

- Language: **JavaScript (ESM) only** — no TypeScript, no other languages, no build step.
- Do not add features beyond what is explicitly requested.
- Do not add error handling for scenarios that cannot happen.
- Use Context7 MCP to check docs before introducing any new dependency.
- Do not skip pre-commit hooks or bypass signing.
- **Git write operations are handled by the user** — do not run `git add`, `git commit`, or `git push`. Only use git for reads (`git status`, `git log`, `git diff`). The user stages and commits manually.
