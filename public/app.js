// Steps-per-day panel: fetch /api/steps and render an SVG bar chart.
// No chart library — one panel doesn't warrant one; see marks-and-anatomy.md
// for the spacer/label conventions this follows.

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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

  const gridSteps = 4;
  const gridlines = [];
  for (let i = 0; i <= gridSteps; i++) {
    const value = (niceMax / gridSteps) * i;
    const y = marginTop + plotH - (value / niceMax) * plotH;
    gridlines.push({ y, value });
  }

  // Label every Nth bar so labels don't collide (~7 labels across the range).
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));

  const bars = rows
    .map((r, i) => {
      const x = marginLeft + i * barW;
      const h = (r.steps / niceMax) * plotH;
      const y = marginTop + plotH - h;
      const w = Math.max(0, barW - barGap);
      return `<rect class="chart-bar" data-i="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" rx="2" />`;
    })
    .join("");

  const gridSvg = gridlines
    .map(
      (g) => `
      <line class="chart-gridline" x1="${marginLeft}" x2="${width - marginRight}" y1="${g.y.toFixed(2)}" y2="${g.y.toFixed(2)}" />
      <text class="chart-axis-label" x="${marginLeft - 6}" y="${(g.y + 3).toFixed(2)}" text-anchor="end">${formatCompact(g.value)}</text>
    `
    )
    .join("");

  const xLabels = rows
    .map((r, i) => {
      if (i % labelEvery !== 0) return "";
      const x = marginLeft + i * barW + barW / 2;
      return `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${height - 6}" text-anchor="middle">${formatShortDate(r.day)}</text>`;
    })
    .join("");

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

  attachHover(rows);
}

function attachHover(rows) {
  const wrap = body.querySelector(".chart-wrap");
  const tooltip = document.getElementById("chart-tooltip");
  const ttDate = tooltip.querySelector(".tt-date");
  const ttValue = tooltip.querySelector(".tt-value");

  wrap.querySelectorAll(".chart-bar").forEach((bar) => {
    bar.addEventListener("mouseenter", (e) => {
      const i = Number(bar.dataset.i);
      const r = rows[i];
      ttDate.textContent = formatFullDate(r.day);
      ttValue.textContent = `${r.steps.toLocaleString()} steps`;
      tooltip.classList.add("visible");
    });
    bar.addEventListener("mousemove", (e) => {
      const rect = wrap.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left}px`;
      tooltip.style.top = `${e.clientY - rect.top - 8}px`;
    });
    bar.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  });
}

function niceCeiling(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  let niceNormalized;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
}

function formatCompact(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function formatShortDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatFullDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

loadSteps();
