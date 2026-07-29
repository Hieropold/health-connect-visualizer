// Shared, DOM-free chart building blocks (scales, gridlines, axis labels,
// date formatting, HTML escaping) plus the one generic DOM helper for
// tooltip wiring. Every panel (bars, stacked bars, range bands, lines) needs
// the same axes/gridlines/tooltip shell and only the mark shape differs, so
// that shell lives here rather than being duplicated per panel. Per-panel
// fetch and mark rendering stay in app.js.

/**
 * Escapes the five HTML-significant characters. Every DB-sourced string
 * (e.g. a workout title) must go through this before landing in innerHTML,
 * since exercise/sleep session titles and notes are user-writable text.
 *
 * @param {string} s
 * @return {string}
 */
export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Rounds a value up to the next "nice" 1/2/5/10 * 10^n step, so axis
 * gridlines land on round numbers instead of the raw data max.
 *
 * @param {number} value
 * @return {number}
 */
export function niceCeiling(value) {
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

/**
 * @param {number} n
 * @return {string} e.g. 12345 -> "12.3k", 1000 -> "1k", 500 -> "500"
 */
export function formatCompact(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @return {string} e.g. "Jan 8"
 */
export function formatShortDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @return {string} e.g. "Sat, Jan 8, 2022"
 */
export function formatFullDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Builds evenly spaced gridline positions from 0 to niceMax, in plot pixel
 * space (y grows downward, so the largest value sits at the top).
 *
 * @param {{niceMax: number, marginTop: number, plotH: number, steps?: number}} opts
 * @return {Array<{y: number, value: number}>}
 */
export function computeGridlines({ niceMax, marginTop, plotH, steps = 4 }) {
  const gridlines = [];
  for (let i = 0; i <= steps; i++) {
    const value = (niceMax / steps) * i;
    const y = marginTop + plotH - (value / niceMax) * plotH;
    gridlines.push({ y, value });
  }
  return gridlines;
}

/**
 * How many items to skip between rendered x-axis labels, so ~`target`
 * labels are shown across the full range regardless of how many items there are.
 *
 * @param {number} count
 * @param {number} [target]
 * @return {number}
 */
export function computeLabelEvery(count, target = 7) {
  return Math.max(1, Math.ceil(count / target));
}

/**
 * Renders gridlines as SVG <line> + axis-label <text> elements.
 *
 * @param {Array<{y: number, value: number}>} gridlines
 * @param {{marginLeft: number, width: number, marginRight: number}} opts
 * @return {string}
 */
export function renderGridSvg(gridlines, { marginLeft, width, marginRight }) {
  return gridlines
    .map(
      (g) => `
      <line class="chart-gridline" x1="${marginLeft}" x2="${width - marginRight}" y1="${g.y.toFixed(2)}" y2="${g.y.toFixed(2)}" />
      <text class="chart-axis-label" x="${marginLeft - 6}" y="${(g.y + 3).toFixed(2)}" text-anchor="end">${formatCompact(g.value)}</text>
    `
    )
    .join("");
}

/**
 * Renders x-axis date labels, skipping items per `labelEvery` so labels
 * don't collide.
 *
 * @param {Array<any>} items
 * @param {{marginLeft: number, barW: number, height: number, marginBottom: number, labelEvery: number, getDay: (item: any) => string}} opts
 * @return {string}
 */
export function renderXAxisLabels(items, { marginLeft, barW, height, marginBottom, labelEvery, getDay }) {
  return items
    .map((item, i) => {
      if (i % labelEvery !== 0) return "";
      const x = marginLeft + i * barW + barW / 2;
      return `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${height - 6}" text-anchor="middle">${formatShortDate(getDay(item))}</text>`;
    })
    .join("");
}

/**
 * @param {number} totalMinutes
 * @return {string} e.g. 452 -> "7h 32m", 27 -> "27m"
 */
export function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

/**
 * Aligns sparse rows onto a continuous calendar-day domain (first row's day
 * through last row's day inclusive), so a renderer can leave a true gap —
 * no bar/mark, not an interpolated zero — for days without data instead of
 * silently compressing them out by rendering one mark per array index. Each
 * domain entry keeps its date even when `row` is null, since the x-axis
 * must still label a gap day.
 *
 * @param {Array<any>} rows
 * @param {(row: any) => string} getDay Returns a row's YYYY-MM-DD date.
 * @return {Array<{day: string, row: any | null}>} One entry per calendar day.
 */
export function alignToDateDomain(rows, getDay) {
  if (rows.length === 0) return [];

  const byDay = new Map(rows.map((row) => [getDay(row), row]));
  const days = [...byDay.keys()].sort();
  const first = new Date(`${days[0]}T00:00:00Z`);
  const last = new Date(`${days[days.length - 1]}T00:00:00Z`);

  const domain = [];
  for (let t = first.getTime(); t <= last.getTime(); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    domain.push({ day, row: byDay.get(day) ?? null });
  }
  return domain;
}

/**
 * Wires hover/move/leave listeners on a set of mark elements to show a
 * shared tooltip. Identical across panels; only `renderTooltip` (what text
 * to show for a given item) differs per panel, so it stays a callback
 * rather than being duplicated in every app.js panel function.
 *
 * @param {{wrap: Element, marks: NodeListOf<Element> | Element[], tooltip: Element, renderTooltip: (item: any) => {date: string, value: string}}} opts
 */
export function attachTooltip({ wrap, marks, tooltip, renderTooltip }) {
  const ttDate = tooltip.querySelector(".tt-date");
  const ttValue = tooltip.querySelector(".tt-value");

  marks.forEach((mark) => {
    mark.addEventListener("mouseenter", () => {
      const { date, value } = renderTooltip(mark);
      ttDate.textContent = date;
      ttValue.textContent = value;
      tooltip.classList.add("visible");
    });
    mark.addEventListener("mousemove", (e) => {
      const rect = wrap.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left}px`;
      tooltip.style.top = `${e.clientY - rect.top - 8}px`;
    });
    mark.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  });
}
