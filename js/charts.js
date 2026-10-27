// charts.js - Renders SVG wave charts, donut rings, and weekly bar charts

/**
 * Creates an SVG circular donut progress ring
 */
export function createDonutSVG({
  percentage = 0,
  size = 120,
  strokeWidth = 14,
  color = '#f472b6',
  trackColor = '#f3f4f6',
  centerMain = '',
  centerSub = '',
  subAbove = false
}) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut-chart-svg">
      <circle
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="transparent"
        stroke="${trackColor}"
        stroke-width="${strokeWidth}"
      />
      <circle
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="transparent"
        stroke="${color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${strokeDashoffset}"
        stroke-linecap="round"
        transform="rotate(-90 ${center} ${center})"
        style="transition: stroke-dashoffset 0.8s ease;"
      />
      <g class="donut-text-group" text-anchor="middle" dominant-baseline="middle">
        ${subAbove && centerSub ? `
          <text x="${center}" y="${center - 14}" class="donut-sub-text">${centerSub}</text>
          <text x="${center}" y="${center + 8}" class="donut-main-text">${centerMain}</text>
        ` : `
          <text x="${center}" y="${centerSub ? center - 4 : center}" class="donut-main-text">${centerMain}</text>
          ${centerSub ? `<text x="${center}" y="${center + 14}" class="donut-sub-text">${centerSub}</text>` : ''}
        `}
      </g>
    </svg>
  `;
}

/**
 * Renders the top aesthetic mountain wave area chart
 */
export function renderWaveAreaChart(container, daysStats) {
  if (!container || !daysStats || daysStats.length === 0) return;

  const width = container.clientWidth || 800;
  const height = 90;
  const paddingX = 20;
  const paddingY = 10;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Calculate coordinates for points
  const points = daysStats.map((d, index) => {
    const x = paddingX + (index / (daysStats.length - 1)) * chartWidth;
    // Map percentage (0-100) to y-coordinate (inverted: 0 at bottom, 100 near top)
    // Add subtle baseline so it maintains a gentle wavy mountain shape even with lower values
    const pct = Math.max(d.percentage, 15);
    const y = height - paddingY - (pct / 100) * chartHeight;
    return { x, y, ...d };
  });

  // Construct smooth bezier curve path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpX1 = p0.x + (p1.x - p0.x) / 2;
    const cpY1 = p0.y;
    const cpX2 = cpX1;
    const cpY2 = p1.y;
    pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
  }

  // Construct area closed path
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaD = `${pathD} L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`;

  container.innerHTML = `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="wave-chart-svg">
      <defs>
        <linearGradient id="waveFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#bfdbfe" stop-opacity="0.85" />
          <stop offset="100%" stop-color="#eff6ff" stop-opacity="0.25" />
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#waveFillGrad)" />
      <path d="${pathD}" fill="none" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  `;
}

/**
 * Colors for each week matching the reference screenshots
 */
export const WEEK_PALETTES = {
  1: {
    primary: '#93c5fd',
    light: '#eff6ff',
    border: '#60a5fa',
    track: '#dbeafe',
    text: '#1e40af'
  },
  2: {
    primary: '#f9a8d4',
    light: '#fdf2f8',
    border: '#f472b6',
    track: '#fce7f3',
    text: '#9d174d'
  },
  3: {
    primary: '#99f6e4',
    light: '#f0fdfa',
    border: '#2dd4bf',
    track: '#ccfbf1',
    text: '#0f766e'
  },
  4: {
    primary: '#fde68a',
    light: '#fefce8',
    border: '#fbbf24',
    track: '#fef3c7',
    text: '#b45309'
  },
  5: {
    primary: '#bfdbfe',
    light: '#eff6ff',
    border: '#93c5fd',
    track: '#dbeafe',
    text: '#1e40af'
  }
};

/**
 * Renders the center 5-week vertical bar chart block with percentages, counts, and donut rings
 */
export function renderWeeklyBarsBlock(container, weekStats) {
  if (!container) return;

  let html = `<div class="weekly-bars-container">`;

  [1, 2, 3, 4, 5].forEach(wIndex => {
    const wData = weekStats[wIndex];
    if (!wData) return;
    const palette = WEEK_PALETTES[wIndex];

    html += `
      <div class="week-chart-column" data-week="${wIndex}">
        <div class="week-title-heading">week ${wIndex}</div>
        
        <div class="week-bars-row">
          ${wData.days.map(d => {
            const heightPct = Math.max(d.percentage, 8); // minimum visible height
            return `
              <div class="day-bar-col" title="Day ${d.day} (${d.letter}): ${d.count}/${d.totalHabits} (${d.percentage}%)">
                <div class="bar-track">
                  <div class="bar-fill" style="height: ${heightPct}%; background-color: ${palette.primary};"></div>
                </div>
                <div class="bar-pct-label">${d.percentage}%</div>
                <div class="bar-count-label">${d.count}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="week-donut-wrapper">
          ${createDonutSVG({
            percentage: wData.percentage,
            size: 96,
            strokeWidth: 10,
            color: palette.primary,
            trackColor: palette.track,
            centerMain: wData.percentageFormatted,
            subAbove: false
          })}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

/**
 * Renders the Weekly Habits vertical bar chart (Right card of weekly habits)
 */
export function renderWeeklyHabitsProgressChart(container, weeklyStats) {
  if (!container) return;

  const maxVal = 5;
  const labels = [1, 2, 3, 4, 5];

  let html = `
    <div class="weekly-progress-card-inner">
      <div class="chart-header-label">WEEKLY PROGRESS</div>
      <div class="weekly-bar-graph">
        <div class="graph-y-axis">
          <span>5</span>
          <span>4</span>
          <span>3</span>
          <span>2</span>
          <span>1</span>
          <span>0</span>
        </div>
        <div class="graph-bars-area">
          ${labels.map(w => {
            const info = weeklyStats.perWeek[w] || { completed: 0, total: 5 };
            const count = info.completed;
            const heightPct = Math.min((count / maxVal) * 100, 100);
            const palette = WEEK_PALETTES[w];

            return `
              <div class="weekly-graph-col">
                <div class="graph-bar-slot">
                  <div class="graph-bar-fill" style="height: ${heightPct}%; background-color: ${palette.primary};" title="Week ${w}: ${count} completed"></div>
                </div>
                <div class="graph-x-label">week ${w}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}
