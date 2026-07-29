// Minimal local dashboard server for a Health Connect export DB.
//
// Zero runtime dependencies: node:http for routing, node:sqlite (via db.js)
// for querying. Node 22's node:sqlite is experimental and prints a warning on
// import — suppress it by running with --disable-warning=ExperimentalWarning
// (see README).
//
// Binds to 127.0.0.1 only and opens the DB read-only: this is personal health
// data and never needs to leave the machine.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// The DB path is a required CLI argument rather than a hardcoded/default
// location — see docs/adr/0001-required-db-path.md. Resolved and checked
// before the server ever binds a port, so a bad invocation fails fast.
const dbPathArg = process.argv[2];
if (!dbPathArg) {
  console.error("Usage: node server.js <path-to-health_connect.db>");
  process.exit(1);
}
const DB_PATH = path.resolve(dbPathArg);
if (!existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  process.exit(1);
}

const { stepsPerDay, sleepPerNight, heartRatePerDay } = createDb(DB_PATH);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = path.normalize(path.join(PUBLIC_DIR, decoded));

  // Reject any path that escapes public/ (e.g. "..%2f..%2fdb/health_connect.db").
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(resolved);
    const ext = path.extname(resolved);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(body);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404).end("Not found");
    } else {
      throw err;
    }
  }
}

function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const server = createServer((req, res) => {
  Promise.resolve()
    .then(() => {
      if (req.url === "/api/steps") {
        sendJson(res, stepsPerDay());
        return;
      }
      if (req.url === "/api/sleep") {
        sendJson(res, sleepPerNight());
        return;
      }
      if (req.url === "/api/heart-rate") {
        sendJson(res, heartRatePerDay());
        return;
      }
      return serveStatic(req, res);
    })
    .catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Health Connect viewer running at http://127.0.0.1:${PORT}`);
});
