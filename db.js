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

// sleep_stages_table carries many re-appended duplicate rows (the exporter
// appends a full copy of the series on each run, at a factor that decays
// per session rather than staying uniform) — see
// docs/adr/0002-dedupe-series-tables-with-distinct.md. The inner subquery
// deduplicates on the natural key before any aggregation touches it, so a
// caller can't accidentally sum the raw (biased) rows. Stage type is Health
// Connect's sleep enum: 1 Awake, 4 Light, 5 Deep, 6 REM (see
// docs/GLOSSARY.md) — hardcoded here since it maps unambiguously, unlike
// exercise_type.
//
// parent_key joins to the session's SQLite rowid, not to an exported
// column: some exports add an explicit `row_id` TEXT column that mirrors
// rowid, others don't, but rowid always exists (sleep_session_record_table's
// PRIMARY KEY is the non-integer `uuid`, so it never becomes a rowid alias,
// and the hidden rowid stays available as the join target either way) — see
// docs/adr/0002-dedupe-series-tables-with-distinct.md.
const SLEEP_PER_NIGHT_SQL = `
  select date(cast(s.local_date as int) * 86400, 'unixepoch') as day,
         round(sum(case when st.stage_type = '1' then (cast(st.stage_end_time as int) - cast(st.stage_start_time as int)) / 60000.0 else 0 end)) as awake,
         round(sum(case when st.stage_type = '4' then (cast(st.stage_end_time as int) - cast(st.stage_start_time as int)) / 60000.0 else 0 end)) as light,
         round(sum(case when st.stage_type = '5' then (cast(st.stage_end_time as int) - cast(st.stage_start_time as int)) / 60000.0 else 0 end)) as deep,
         round(sum(case when st.stage_type = '6' then (cast(st.stage_end_time as int) - cast(st.stage_start_time as int)) / 60000.0 else 0 end)) as rem
  from (
    select distinct parent_key, stage_start_time, stage_end_time, stage_type
    from sleep_stages_table
  ) st
  join sleep_session_record_table s on s.rowid = cast(st.parent_key as int)
  group by day
  order by day
`;

// heart_rate_record_series_table has the same re-append duplication risk as
// sleep_stages_table, and the same rowid-not-exported-column join key, as
// sleep_stages_table above — see
// docs/adr/0002-dedupe-series-tables-with-distinct.md. Dedup key is
// (parent_key, epoch_millis, beats_per_minute): a duplicate row is an exact
// re-append, so all three columns match together.
const HEART_RATE_PER_DAY_SQL = `
  select date(cast(h.local_date as int) * 86400, 'unixepoch') as day,
         min(cast(hs.beats_per_minute as int))                as min,
         round(avg(cast(hs.beats_per_minute as int)))         as avg,
         max(cast(hs.beats_per_minute as int))                as max
  from (
    select distinct parent_key, epoch_millis, beats_per_minute
    from heart_rate_record_series_table
  ) hs
  join heart_rate_record_table h on h.rowid = cast(hs.parent_key as int)
  group by day
  order by day
`;

// Body composition reads raw record tables (weight_record_table,
// body_fat_record_table) joining on local_date rather than using the
// exporter-synthesised joined_body_metrics table — see docs/adr/0004-read-body-composition-from-raw-record-tables.md.
// Weight is stored in grams (converted to kg by /1000.0). Empty string values
// are sanitized with nullif() before casting to real to prevent cast('', 'real')
// from returning 0.0 — see docs/task-more-graphs.md.
const BODY_METRICS_PER_DAY_SQL = `
  select date(cast(w.local_date as int) * 86400, 'unixepoch') as day,
         round(avg(cast(nullif(w.weight, '') as real) / 1000.0), 1) as weightKg,
         round(avg(cast(nullif(bf.percentage, '') as real)), 1) as bodyFatPct
  from weight_record_table w
  left join body_fat_record_table bf on w.local_date = bf.local_date
  group by day
  order by day
`;

// Exercise sessions joined with distance and total calories burned by start_time.
// Converts UTC start/end epoch millis duration to minutes, metres to km, and
// calories to kcal.
const EXERCISE_PER_DAY_SQL = `
  select date(cast(e.local_date as int) * 86400, 'unixepoch') as day,
         round(sum((cast(nullif(e.end_time, '') as int) - cast(nullif(e.start_time, '') as int)) / 60000.0), 1) as durationMin,
         round(sum(cast(nullif(d.distance, '') as real) / 1000.0), 2) as distanceKm,
         round(sum(cast(nullif(c.energy, '') as real) / 1000.0), 1) as caloriesKcal
  from exercise_session_record_table e
  left join distance_record_table d on e.start_time = d.start_time
  left join total_calories_burned_record_table c on e.start_time = c.start_time
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
 * @return {{
 *   stepsPerDay: () => Array<{day: string, steps: number}>,
 *   sleepPerNight: () => Array<{day: string, awake: number, light: number, deep: number, rem: number}>,
 *   heartRatePerDay: () => Array<{day: string, min: number, avg: number, max: number}>,
 *   bodyMetricsPerDay: () => Array<{day: string, weightKg: number, bodyFatPct: number|null}>,
 *   exercisePerDay: () => Array<{day: string, durationMin: number, distanceKm: number|null, caloriesKcal: number|null}>,
 * }}
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

  function sleepPerNight() {
    return db.prepare(SLEEP_PER_NIGHT_SQL).all();
  }

  function heartRatePerDay() {
    return db.prepare(HEART_RATE_PER_DAY_SQL).all();
  }

  function bodyMetricsPerDay() {
    return db.prepare(BODY_METRICS_PER_DAY_SQL).all();
  }

  function exercisePerDay() {
    return db.prepare(EXERCISE_PER_DAY_SQL).all();
  }

  return {
    stepsPerDay,
    sleepPerNight: memoize(sleepPerNight),
    heartRatePerDay: memoize(heartRatePerDay),
    bodyMetricsPerDay: memoize(bodyMetricsPerDay),
    exercisePerDay: memoize(exercisePerDay),
  };
}

// The DB is a static read-only export, so a query's result can never go
// stale within a server lifetime — memoizing turns the ~230ms deduplicated
// series queries into a one-time cost instead of paying it on every page
// reload. Caches the *result*, not the prepared statement (see the
// node:sqlite finalization bug noted above): this wraps the function after
// each call re-prepares its own statement internally.
function memoize(fn) {
  let cached;
  return () => {
    if (!cached) cached = fn();
    return cached;
  };
}
