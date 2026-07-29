// Read-only access to a Health Connect export DB.
//
// All columns in the Health Connect tables are TEXT (the importer does not
// type them), so numeric columns need an explicit cast before any arithmetic.
// `local_date` is stored as epoch days (days since 1970-01-01), not a date
// string — SQLite's date() function converts it via *86400 to epoch seconds.

import { DatabaseSync } from "node:sqlite";

// Steps are recorded as one row per sync interval, occasionally more than one
// per day. sum()/group by collapses that to a single daily total.
const STEPS_PER_DAY_SQL = `
  select date(cast(local_date as int) * 86400, 'unixepoch') as day,
         sum(cast(count as int))                            as steps
  from steps_record_table
  group by day
  order by day
`;

/**
 * Opens a Health Connect export DB read-only and returns its query functions.
 *
 * The path is a required argument rather than a hardcoded/default location:
 * this is personal health data, so the caller must name the file explicitly
 * rather than the server implicitly discovering one. See
 * docs/adr/0001-required-db-path.md.
 *
 * @param {string} dbPath Path to the health_connect.db file.
 * @return {{ stepsPerDay: () => Array<{day: string, steps: number}> }}
 */
export function createDb(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  // Prepared fresh on every call rather than cached at module scope: caching
  // the statement across a module boundary hits a node:sqlite 22.14 bug where
  // the statement is unexpectedly finalized after the first call made from a
  // separate http request tick ("statement has been finalized",
  // ERR_INVALID_STATE). Re-preparing is cheap enough for a dashboard's query
  // volume and sidesteps it.
  function stepsPerDay() {
    return db.prepare(STEPS_PER_DAY_SQL).all();
  }

  return { stepsPerDay };
}
