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

/**
 * Builds a throwaway sleep_session_record_table + sleep_stages_table with a
 * *non-uniform* duplication factor across sessions (3x, 1x, 2x) — the real
 * export re-appends series rows with a factor that decays per session (see
 * docs/adr/0002-dedupe-series-tables-with-distinct.md), so a fixture with a
 * uniform factor wouldn't catch a dedup key that's wrong in a way a uniform
 * multiplier happens to cancel out.
 *
 * No `row_id` column: some real exports have one (mirroring the session's
 * SQLite rowid), some don't, but `parent_key` always references the rowid
 * itself — see docs/adr/0002-dedupe-series-tables-with-distinct.md. This
 * fixture's `local_date`-only table matches the exports that lack it, so the
 * test only passes if sleepPerNight() joins on rowid rather than assuming a
 * `row_id` column exists.
 *
 * @return {string} Absolute path to the fixture DB file.
 */
function makeSleepFixtureDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "health-connect-test-"));
  const dbPath = path.join(dir, "fixture.db");
  const setup = new DatabaseSync(dbPath);
  setup.exec(`
    create table sleep_session_record_table (
      local_date text
    );
    create table sleep_stages_table (
      parent_key text,
      stage_start_time text,
      stage_end_time text,
      stage_type text
    )
  `);
  const insertSession = setup.prepare("insert into sleep_session_record_table (local_date) values (?)");
  const insertStage = setup.prepare(
    "insert into sleep_stages_table (parent_key, stage_start_time, stage_end_time, stage_type) values (?, ?, ?, ?)"
  );

  // Session 1 (rowid 1), night of 2022-01-08 (local_date=19000): 20 min
  // light + 10 min deep, each row re-appended 3x (dedup factor 3).
  insertSession.run("19000");
  for (let i = 0; i < 3; i++) {
    insertStage.run("1", "1000000000000", "1000001200000", "4");
    insertStage.run("1", "2000000000000", "2000000600000", "5");
  }

  // Session 2 (rowid 2), same night, a second session: 15 min REM, not
  // duplicated (dedup factor 1) — exercises multiple sessions aggregating
  // into one night.
  insertSession.run("19000");
  insertStage.run("2", "3000000000000", "3000000900000", "6");

  // Session 3 (rowid 3), night of 2022-01-09 (local_date=19001): 5 min
  // awake, duplicated 2x (dedup factor 2, different from session 1's factor).
  insertSession.run("19001");
  insertStage.run("3", "4000000000000", "4000000300000", "1");
  insertStage.run("3", "4000000000000", "4000000300000", "1");

  setup.close();
  return dbPath;
}

test("sleepPerNight deduplicates re-appended stage rows and sums minutes per stage type per night", () => {
  const dbPath = makeSleepFixtureDb();
  const { sleepPerNight } = createDb(dbPath);

  const rows = sleepPerNight().map((row) => ({ ...row }));

  assert.deepEqual(rows, [
    { day: "2022-01-08", awake: 0, light: 20, deep: 10, rem: 15 },
    { day: "2022-01-09", awake: 5, light: 0, deep: 0, rem: 0 },
  ]);

  rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

/**
 * Builds a throwaway heart_rate_record_table + heart_rate_record_series_table
 * with a *non-uniform* duplication factor — both across sessions (3x vs 1x)
 * and within one session (1x vs 2x for two different samples) — for the same
 * reason as the sleep fixture above.
 *
 * No `row_id` column, for the same reason as the sleep fixture above:
 * `parent_key` references the session's SQLite rowid directly, which some
 * real exports don't mirror into an explicit column.
 *
 * @return {string} Absolute path to the fixture DB file.
 */
function makeHeartRateFixtureDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "health-connect-test-"));
  const dbPath = path.join(dir, "fixture.db");
  const setup = new DatabaseSync(dbPath);
  setup.exec(`
    create table heart_rate_record_table (
      local_date text
    );
    create table heart_rate_record_series_table (
      parent_key text,
      beats_per_minute text,
      epoch_millis text
    )
  `);
  const insertSession = setup.prepare("insert into heart_rate_record_table (local_date) values (?)");
  const insertSample = setup.prepare(
    "insert into heart_rate_record_series_table (parent_key, beats_per_minute, epoch_millis) values (?, ?, ?)"
  );

  // Session 1 (rowid 1), day 2022-01-08 (local_date=19000): bpm 60, 80, 100,
  // each re-appended 3x (dedup factor 3). min=60, max=100, avg=80.
  insertSession.run("19000");
  for (let i = 0; i < 3; i++) {
    insertSample.run("1", "60", "1000000000000");
    insertSample.run("1", "80", "1000000060000");
    insertSample.run("1", "100", "1000000120000");
  }

  // Session 2 (rowid 2), day 2022-01-09 (local_date=19001): bpm 70 not
  // duplicated, bpm 130 duplicated 2x (different factor from both session 1
  // and its own sibling sample). min=70, max=130, avg=100.
  insertSession.run("19001");
  insertSample.run("2", "70", "2000000000000");
  insertSample.run("2", "130", "2000000060000");
  insertSample.run("2", "130", "2000000060000");

  setup.close();
  return dbPath;
}

test("heartRatePerDay deduplicates re-appended samples and computes min/avg/max per day", () => {
  const dbPath = makeHeartRateFixtureDb();
  const { heartRatePerDay } = createDb(dbPath);

  const rows = heartRatePerDay().map((row) => ({ ...row }));

  assert.deepEqual(rows, [
    { day: "2022-01-08", min: 60, avg: 80, max: 100 },
    { day: "2022-01-09", min: 70, avg: 100, max: 130 },
  ]);

  rmSync(path.dirname(dbPath), { recursive: true, force: true });
});
