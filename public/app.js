// Steps-per-day panel: fetch /api/steps and render an SVG bar chart.
// No chart library — shared scales/axes/tooltip/formatting live in
// chart.js; this file keeps only the fetch and the bar mark shape, which is
// the part that differs per panel.

import { escapeHtml, niceCeiling, computeGridlines, computeLabelEvery, renderGridSvg, renderXAxisLabels, attachTooltip, formatFullDate } from "./chart.js";

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
