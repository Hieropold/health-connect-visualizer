# 2. Deduplicate series tables with `DISTINCT` at query time

## Status

Accepted

## Context

`sleep_stages_table` and `heart_rate_record_series_table` are child "series"
tables keyed by `parent_key`, referencing the parent
record table's `row_id`. An earlier export of this project's reference
`health_connect.db` was found to carry a large number of duplicate rows in
both tables — apparently from an exporter that appends a full copy of the
series on each run rather than replacing it. The duplication factor was not
uniform: it decayed with `parent_key`, so summing the raw rows didn't just
inflate totals, it *biased* them (a documented case: mean heart rate read
120.5 bpm raw vs 105.5 bpm deduplicated).

The `health_connect.db` snapshot used while implementing this project's sleep
and heart rate panels does **not** currently exhibit this — `select count(*)`
and `select count(distinct ...natural key...)` return the same number on both
`sleep_stages_table` and `heart_rate_record_series_table`. Whatever produced
the duplication either isn't present in this export run or has since been
fixed upstream. The dedup is kept anyway: the failure mode is silent (a query
against the raw table doesn't error, it just returns a biased number), the
export tooling isn't controlled by this project, and the cost of guarding
against it is one subquery.

## Decision

Every query over `sleep_stages_table` and `heart_rate_record_series_table`
selects `DISTINCT` on the natural key in a subquery before any aggregation
runs:

- Sleep stages: `(parent_key, stage_start_time, stage_end_time, stage_type)`
- Heart rate: `(parent_key, epoch_millis, beats_per_minute)`

```sql
select ...
from (
  select distinct parent_key, stage_start_time, stage_end_time, stage_type
  from sleep_stages_table
) st
join sleep_session_record_table s on s.row_id = st.parent_key
group by day
```

Rejected alternatives:
- **Dedup into memory at server startup** — would need `db.js` to hold
  query-shaped state outside SQL, and re-run on every `createDb()` call
  regardless of whether the panel is ever requested.
- **A temp view** — same SQL, extra indirection, and another thing to keep in
  sync with the table it wraps.

Putting `DISTINCT` inside the query itself means a caller can't forget it —
there's no "plain" query path that returns the biased numbers.

## Consequences

- `test/db.test.js`'s `sleepPerNight` and `heartRatePerDay` fixtures each
  insert the same rows multiple times with a *non-uniform* factor — across
  sessions, and (for heart rate) within one session too — specifically to
  catch a dedup key that's wrong in a way a uniform multiplier would hide.
- Measured cost on the reference export: ~230ms for the deduplicated sleep
  query, vs <1ms for `stepsPerDay`. Mitigated by memoizing the result per
  `createDb()` instance (the DB is read-only and static within a server
  lifetime, so a cached result cannot go stale) — see `db.js`'s `memoize()`.
- If a future export never reproduces the duplication, this is a no-op
  `DISTINCT` on already-unique rows — cheap insurance, not dead weight to
  remove.
