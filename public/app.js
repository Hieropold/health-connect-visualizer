// Steps-per-day panel: fetch /api/steps and render an SVG bar chart.
// No chart library — shared scales/axes/tooltip/formatting live in
// chart.js; this file keeps only the fetch and the bar mark shape, which is
// the part that differs per panel.

import {
  escapeHtml,
  niceCeiling,
  computeGridlines,
  computeLabelEvery,
  renderGridSvg,
  renderXAxisLabels,
  attachTooltip,
  formatFullDate,
  alignToDateDomain,
  formatDuration,
} from "./chart.js";

const body = document.getElementById("steps-body");
const stat = document.getElementById("steps-stat");

async function loadSteps() {
  let rows;
  try {
    const res = await fetch("/api/steps");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
  } catch (err) {
    body.innerHTML = `<p class="panel-error">Failed to load steps: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (!rows || rows.length === 0) {
    body.innerHTML = `<p class="panel-empty">No step data yet.</p>`;
    return;
  }

  const avg = Math.round(rows.reduce((sum, r) => sum + r.steps, 0) / rows.length);
  stat.innerHTML = `avg <strong>${avg.toLocaleString()}</strong> steps/day`;

  renderChart(rows);
}

function renderChart(rows) {
  const width = 900;
  const height = 280;
  const marginTop = 12;
  const marginRight = 8;
  const marginBottom = 24;
  const marginLeft = 44;

  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const max = Math.max(...rows.map((r) => r.steps));
  const niceMax = niceCeiling(max);

  const barGap = 2; // surface gap between adjacent bars
  const barW = plotW / rows.length;

  const gridlines = computeGridlines({ niceMax, marginTop, plotH });
  const labelEvery = computeLabelEvery(rows.length);

  const bars = rows
    .map((r, i) => {
      const x = marginLeft + i * barW;
      const h = (r.steps / niceMax) * plotH;
      const y = marginTop + plotH - h;
      const w = Math.max(0, barW - barGap);
      return `<rect class="chart-bar" data-i="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" rx="2" />`;
    })
    .join("");

  const gridSvg = renderGridSvg(gridlines, { marginLeft, width, marginRight });
  const xLabels = renderXAxisLabels(rows, { marginLeft, barW, height, marginBottom, labelEvery, getDay: (r) => r.day });

  body.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${gridSvg}
        ${bars}
        ${xLabels}
      </svg>
      <div class="chart-tooltip" id="chart-tooltip">
        <div class="tt-date"></div>
        <div class="tt-value"></div>
      </div>
    </div>
  `;

  const wrap = body.querySelector(".chart-wrap");
  const tooltip = document.getElementById("chart-tooltip");
  attachTooltip({
    wrap,
    marks: wrap.querySelectorAll(".chart-bar"),
    tooltip,
    renderTooltip: (mark) => {
      const r = rows[Number(mark.dataset.i)];
      return { date: formatFullDate(r.day), value: `${r.steps.toLocaleString()} steps` };
    },
  });
}

loadSteps();

// Sleep-per-night panel: fetch /api/sleep and render a stacked bar chart of
// stage minutes (Awake/Light/Deep/REM). Nights without data render as a
// true gap in the continuous calendar axis rather than a compressed or
// interpolated bar — see alignToDateDomain in chart.js.

const sleepBody = document.getElementById("sleep-body");
const sleepStat = document.getElementById("sleep-stat");

// Fixed stacking order (bottom to top) and categorical color per the
// dataviz skill's palette — the order is assigned once and never cycled per
// panel, so it stays consistent with the legend and tooltip.
const SLEEP_STAGES = [
  { key: "deep", cls: "stage-deep", label: "Deep" },
  { key: "light", cls: "stage-light", label: "Light" },
  { key: "rem", cls: "stage-rem", label: "REM" },
  { key: "awake", cls: "stage-awake", label: "Awake" },
];

async function loadSleep() {
  let rows;
  try {
    const res = await fetch("/api/sleep");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
  } catch (err) {
    sleepBody.innerHTML = `<p class="panel-error">Failed to load sleep: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (!rows || rows.length === 0) {
    sleepBody.innerHTML = `<p class="panel-empty">No sleep data yet.</p>`;
    return;
  }

  const avgAsleep = rows.reduce((sum, r) => sum + r.light + r.deep + r.rem, 0) / rows.length;
  sleepStat.innerHTML = `avg <strong>${escapeHtml(formatDuration(avgAsleep))}</strong> asleep/night`;

  renderSleepChart(rows);
}

function renderSleepChart(rows) {
  const width = 900;
  const height = 280;
  const marginTop = 12;
  const marginRight = 8;
  const marginBottom = 24;
  const marginLeft = 44;

  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const domain = alignToDateDomain(rows, (r) => r.day);
  const barGap = 2;
  const barW = plotW / domain.length;

  const max = Math.max(...rows.map((r) => r.awake + r.light + r.deep + r.rem));
  const niceMax = niceCeiling(max);

  const gridlines = computeGridlines({ niceMax, marginTop, plotH });
  const labelEvery = computeLabelEvery(domain.length);

  const bars = domain
    .map((d, i) => {
      if (!d.row) return ""; // gap night: no bar
      const x = marginLeft + i * barW;
      const w = Math.max(0, barW - barGap);
      let cursor = marginTop + plotH;
      return SLEEP_STAGES.map((stage) => {
        const h = (d.row[stage.key] / niceMax) * plotH;
        cursor -= h;
        return `<rect class="chart-bar-segment ${stage.cls}" data-i="${i}" x="${x.toFixed(2)}" y="${cursor.toFixed(2)}" width="${w.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" />`;
      }).join("");
    })
    .join("");

  const gridSvg = renderGridSvg(gridlines, { marginLeft, width, marginRight });
  const xLabels = renderXAxisLabels(domain, { marginLeft, barW, height, marginBottom, labelEvery, getDay: (d) => d.day });

  const legend = SLEEP_STAGES.map(
    (stage) => `<div class="chart-legend-item"><span class="chart-legend-swatch ${stage.cls}"></span>${escapeHtml(stage.label)}</div>`
  ).join("");

  sleepBody.innerHTML = `
    <div class="chart-legend">${legend}</div>
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${gridSvg}
        ${bars}
        ${xLabels}
      </svg>
      <div class="chart-tooltip" id="sleep-chart-tooltip">
        <div class="tt-date"></div>
        <div class="tt-value"></div>
      </div>
    </div>
  `;

  const wrap = sleepBody.querySelector(".chart-wrap");
  const tooltip = document.getElementById("sleep-chart-tooltip");
  attachTooltip({
    wrap,
    marks: wrap.querySelectorAll(".chart-bar-segment"),
    tooltip,
    renderTooltip: (mark) => {
      const d = domain[Number(mark.dataset.i)];
      const r = d.row;
      const asleep = formatDuration(r.light + r.deep + r.rem);
      return { date: formatFullDate(d.day), value: `${asleep} asleep · ${r.awake}m awake` };
    },
  });
}

loadSleep();

// Heart-rate-per-day panel: fetch /api/heart-rate and render a range band
// (min–max, with an avg dot) per day. Same continuous-gap-axis treatment as
// sleep — HR coverage is 64/97 days in the reference export.

const hrBody = document.getElementById("heart-rate-body");
const hrStat = document.getElementById("heart-rate-stat");

async function loadHeartRate() {
  let rows;
  try {
    const res = await fetch("/api/heart-rate");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
  } catch (err) {
    hrBody.innerHTML = `<p class="panel-error">Failed to load heart rate: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (!rows || rows.length === 0) {
    hrBody.innerHTML = `<p class="panel-empty">No heart rate data yet.</p>`;
    return;
  }

  const avgOfDaily = Math.round(rows.reduce((sum, r) => sum + r.avg, 0) / rows.length);
  hrStat.innerHTML = `avg <strong>${avgOfDaily}</strong> bpm`;

  renderHeartRateChart(rows);
}

function renderHeartRateChart(rows) {
  const width = 900;
  const height = 280;
  const marginTop = 12;
  const marginRight = 8;
  const marginBottom = 24;
  const marginLeft = 44;

  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const domain = alignToDateDomain(rows, (r) => r.day);
  const barGap = 2;
  const barW = plotW / domain.length;
  const bandW = Math.max(2, Math.min(barW - barGap, 8));

  const max = Math.max(...rows.map((r) => r.max));
  const niceMax = niceCeiling(max);

  const gridlines = computeGridlines({ niceMax, marginTop, plotH });
  const labelEvery = computeLabelEvery(domain.length);

  const yOf = (bpm) => marginTop + plotH - (bpm / niceMax) * plotH;

  const marks = domain
    .map((d, i) => {
      const x = marginLeft + i * barW;
      const colW = Math.max(0, barW - barGap);
      // Wide, invisible hit target behind the thin visual band — easier to
      // hover than the band itself, per the dataviz skill's interaction spec.
      const hit = `<rect class="chart-hit" data-i="${i}" x="${x.toFixed(2)}" y="${marginTop}" width="${colW.toFixed(2)}" height="${plotH}" />`;
      if (!d.row) return hit;

      const bandX = x + (colW - bandW) / 2;
      const yMin = yOf(d.row.min);
      const yMax = yOf(d.row.max);
      const yAvg = yOf(d.row.avg);
      const band = `<rect class="chart-range-band" x="${bandX.toFixed(2)}" y="${yMax.toFixed(2)}" width="${bandW.toFixed(2)}" height="${Math.max(0, yMin - yMax).toFixed(2)}" rx="${(bandW / 2).toFixed(2)}" />`;
      const dot = `<circle class="chart-range-avg" cx="${(bandX + bandW / 2).toFixed(2)}" cy="${yAvg.toFixed(2)}" r="4" />`;
      return band + dot + hit;
    })
    .join("");

  const gridSvg = renderGridSvg(gridlines, { marginLeft, width, marginRight });
  const xLabels = renderXAxisLabels(domain, { marginLeft, barW, height, marginBottom, labelEvery, getDay: (d) => d.day });

  hrBody.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${gridSvg}
        ${marks}
        ${xLabels}
      </svg>
      <div class="chart-tooltip" id="hr-chart-tooltip">
        <div class="tt-date"></div>
        <div class="tt-value"></div>
      </div>
    </div>
  `;

  const wrap = hrBody.querySelector(".chart-wrap");
  const tooltip = document.getElementById("hr-chart-tooltip");
  attachTooltip({
    wrap,
    marks: wrap.querySelectorAll(".chart-hit"),
    tooltip,
    renderTooltip: (mark) => {
      const d = domain[Number(mark.dataset.i)];
      if (!d.row) return { date: formatFullDate(d.day), value: "No data" };
      const r = d.row;
      return { date: formatFullDate(d.day), value: `${r.min}–${r.max} bpm (avg ${r.avg})` };
    },
  });
}

loadHeartRate();
