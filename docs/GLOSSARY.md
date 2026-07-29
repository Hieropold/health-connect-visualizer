# Glossary

Domain vocabulary for Health Connect's data model, as used by this project.

## `local_date`

Epoch **days** since 1970-01-01, stored as `TEXT` (all Health Connect columns
are). Not epoch seconds, not a date string. Convert to a calendar date with:

```sql
date(cast(local_date as int) * 86400, 'unixepoch')
```

## Series table

A child table holding sample-level rows keyed by `parent_key`, which
references the parent record table's `row_id`. Examples used or planned in
this project: `sleep_stages_table` (parent: `sleep_session_record_table`),
`heart_rate_record_series_table` (parent: `heart_rate_record_table`),
`speed_record_table`. See [`docs/adr/0002-dedupe-series-tables-with-distinct.md`](adr/0002-dedupe-series-tables-with-distinct.md)
for why every query over a series table deduplicates on its natural key.

## Duplication factor

How many times a given series row was found re-appended by an export run, in
a reference export used while designing this project's dedup handling. Not
uniform across sessions — it decayed with `parent_key` in that export. See
the ADR above; the `health_connect.db` snapshot currently in this repo's
working copy does not itself exhibit the duplication, but the dedup query
guards against it regardless.

## Sleep stage type

Health Connect enum on `sleep_stages_table.stage_type`:

| Value | Stage |
|---|---|
| 1 | Awake |
| 4 | Light |
| 5 | Deep |
| 6 | REM |

Values 0 (Unknown), 2 (Sleeping), 3 (Out of bed), and 7 (Awake in bed) also
exist in the Health Connect spec but haven't been observed in this project's
reference data. Hardcoded in `db.js`'s `sleepPerNight()` since the mapping is
unambiguous.

## Exercise type

Health Connect enum on `exercise_session_record_table.exercise_type`.
Numeric mapping is unverified for Samsung Health exports (the observed
values don't line up cleanly with the AndroidX `ExerciseType` constants), so
until verified this project displays it raw (e.g. `"Type 53"`) rather than a
guessed label.

## `joined_body_metrics`

An exporter-synthesised convenience table present in some exports — **not**
part of the Health Connect schema itself (it's a real `CREATE TABLE`, not a
view). Holds body composition metrics already joined and in kg, but its
`date_time` column is a local-time string while every genuine Health Connect
record table stores UTC epoch millis. This project reads the raw record
tables (`weight_record_table`, `body_fat_record_table`, etc.) instead, so
every panel derives dates the same way.

## Recording method

The `recording_method` column present on Health Connect record tables (e.g.
`0` for manually/automatically recorded, exact meaning per the Health
Connect spec). Not currently used by any query in this project.
