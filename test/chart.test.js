// Tests for the DOM-free chart helpers in public/chart.js (scales,
// gridlines, formatting, escaping). Rendering helpers that touch the DOM
// (attachTooltip) are not covered here; they have no logic beyond wiring
// event listeners.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  escapeHtml,
  niceCeiling,
  formatCompact,
  formatShortDate,
  formatFullDate,
  computeGridlines,
  computeLabelEvery,
} from "../public/chart.js";

test("escapeHtml escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<script>&"'`), "&lt;script&gt;&amp;&quot;&#39;");
});

test("escapeHtml leaves plain text untouched", () => {
  assert.equal(escapeHtml("Morning walk"), "Morning walk");
});

test("niceCeiling rounds up to a nice 1/2/5/10 step", () => {
  assert.equal(niceCeiling(0), 1);
  assert.equal(niceCeiling(4), 5);
  assert.equal(niceCeiling(1234), 2000);
  assert.equal(niceCeiling(9000), 10000);
});

test("formatCompact abbreviates thousands with a trailing 'k'", () => {
  assert.equal(formatCompact(500), "500");
  assert.equal(formatCompact(1000), "1k");
  assert.equal(formatCompact(12345), "12.3k");
});

test("formatShortDate renders month + day in UTC", () => {
  assert.equal(formatShortDate("2022-01-08"), "Jan 8");
});

test("formatFullDate renders weekday, month, day and year in UTC", () => {
  assert.equal(formatFullDate("2022-01-08"), "Sat, Jan 8, 2022");
});

test("computeGridlines splits the range into evenly spaced steps", () => {
  const gridlines = computeGridlines({ niceMax: 100, marginTop: 0, plotH: 200, steps: 4 });
  assert.deepEqual(
    gridlines.map((g) => g.value),
    [0, 25, 50, 75, 100]
  );
  // Highest value sits at the top of the plot area (y = marginTop).
  assert.equal(gridlines[4].y, 0);
  // Zero sits at the bottom of the plot area (y = marginTop + plotH).
  assert.equal(gridlines[0].y, 200);
});

test("computeLabelEvery keeps roughly `target` labels across the range", () => {
  assert.equal(computeLabelEvery(7, 7), 1);
  assert.equal(computeLabelEvery(97, 7), 14);
  assert.equal(computeLabelEvery(1, 7), 1);
});
