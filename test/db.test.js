// Tests for db.js's stepsPerDay() query.
//
// Uses a temp fixture DB rather than the (nonexistent, gitignored) real
// health_connect.db, since createDb() takes the path explicitly — see
// docs/adr/0001-required-db-path.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDb } from "../db.js";

/**
 * Builds a throwaway steps_record_table with TEXT columns (matching the
 * real importer's schema) so tests exercise the same cast logic as prod.
 *
 * @return {string} Absolute path to the fixture DB file.
 */
function makeFixtureDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "health-connect-test-"));
  const dbPath = path.join(dir, "fixture.db");
  const setup = new DatabaseSync(dbPath);
  setup.exec(`
    create table steps_record_table (
      local_date text,
      count text
    )
  `);
  // Two rows on the same day (local_date=19000, i.e. 2022-01-08) must sum.
  setup.prepare("insert into steps_record_table (local_date, count) values (?, ?)").run("19000", "1000");
  setup.prepare("insert into steps_record_table (local_date, count) values (?, ?)").run("19000", "500");
  // A different day stays separate.
  setup.prepare("insert into steps_record_table (local_date, count) values (?, ?)").run("19001", "2000");
  setup.close();
  return dbPath;
}

test("stepsPerDay sums same-day rows and converts epoch-days to YYYY-MM-DD", () => {
  const dbPath = makeFixtureDb();
  const { stepsPerDay } = createDb(dbPath);

  // node:sqlite returns null-prototype row objects; spread into plain
  // objects so deepEqual compares by shape, not prototype.
  const rows = stepsPerDay().map((row) => ({ ...row }));

  assert.deepEqual(rows, [
    { day: "2022-01-08", steps: 1500 },
    { day: "2022-01-09", steps: 2000 },
  ]);

  rmSync(path.dirname(dbPath), { recursive: true, force: true });
});
