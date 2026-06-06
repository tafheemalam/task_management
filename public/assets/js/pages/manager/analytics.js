let _analyticsData = null;
let _analyticsCharts = {};

async function renderAnalytics() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6 animate-fade-in-up">
      ${pageHeader(
        'Analytics',
        'Task performance insights for your team',
        `<button class="btn-secondary" onclick="loadAnalytics()">
           <i class="fa-solid fa-arrows-rotate"></i> Refresh
         </button>`
      )}
      <div id="analytics-content">${skeletonStatCards(4) + skeletonCards(2)}</div>
    </div>`);

  await loadAnalytics();
}

async function loadAnalytics() {
  try {
    const resp = await api.manager.analytics();
    _analyticsData = resp.data;
    renderAnalyticsContent(_analyticsData);
  } catch (err) {
    document.getElementById('analytics-content').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

function renderAnalyticsContent(d) {
  Object.values(_analyticsCharts).forEach(c => c.destroy());
  _analyticsCharts = {};

  const bottleneckLabel = d.bottleneck
    ? `Bottleneck: <strong>${anEsc(d.bottleneck.name)}</strong> (${d.bottleneck.count} tasks)`
    : 'No bottleneck detected';

  document.getElementById('analytics-content').innerHTML = `
    <!-- Stat cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${anStatCard('fa-circle-check', d.completed_tasks, 'Tasks Completed', 'green',
          d.total_tasks > 0 ? `${d.completion_rate}% completion rate (30d)` : 'No tasks yet')}
      ${anStatCard('fa-clock-rotate-left',
          d.avg_cycle_time > 0 ? d.avg_cycle_time + ' days' : '—',
          'Avg Cycle Time', 'blue', 'Days from creation to done (90d)')}
      ${anStatCard('fa-triangle-exclamation', d.overdue_tasks, 'Overdue Tasks',
          d.overdue_tasks > 0 ? 'red' : 'green',
          d.overdue_tasks > 0 ? 'Needs immediate attention' : 'All on track!')}
      ${anStatCard('fa-layer-group', d.total_tasks, 'Total Tasks', 'indigo', bottleneckLabel)}
    </div>

    <!-- Row 1: Velocity (wide) + Priority (narrow) -->
    <div class="grid lg:grid-cols-3 gap-6 mb-6">
      <div class="card lg:col-span-2">
        <div class="mb-4">
          <h3 class="font-semibold text-gray-900">Weekly Velocity</h3>
          <p class="text-xs text-gray-400 mt-0.5">Tasks completed per week — last 8 weeks</p>
        </div>
        <canvas id="an-velocity-chart" height="110"></canvas>
      </div>

      <div class="card">
        <div class="mb-4">
          <h3 class="font-semibold text-gray-900">Tasks by Priority</h3>
          <p class="text-xs text-gray-400 mt-0.5">All tasks</p>
        </div>
        <canvas id="an-priority-chart" height="160"></canvas>
        <div class="mt-4 space-y-2" id="an-priority-legend"></div>
      </div>
    </div>

    <!-- Row 2: Stage distribution -->
    <div class="card">
      <div class="mb-5">
        <h3 class="font-semibold text-gray-900">Tasks by Stage</h3>
        <p class="text-xs text-gray-400 mt-0.5">Distribution across all workflow stages</p>
      </div>
      ${d.tasks_by_stage.length === 0
        ? emptyState('fa-chart-pie', 'No stage data yet', 'Create tasks and assign them to workflow stages.')
        : `<div class="grid lg:grid-cols-2 gap-8 items-center">
             <div class="flex justify-center"><canvas id="an-stage-chart" style="max-height:260px"></canvas></div>
             <div id="an-stage-legend" class="space-y-1"></div>
           </div>`}
    </div>
  `;

  requestAnimationFrame(() => {
    anBuildVelocity(d.weekly_velocity);
    anBuildPriority(d.tasks_by_priority);
    if (d.tasks_by_stage.length > 0) anBuildStage(d.tasks_by_stage);
  });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function anStatCard(icon, value, label, color, sub) {
  const palette = {
    green:  'bg-green-100 text-green-600',
    blue:   'bg-blue-100 text-blue-600',
    red:    'bg-red-100 text-red-600',
    indigo: 'bg-indigo-100 text-indigo-600',
  };
  return `
    <div class="card flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center ${palette[color] || palette.indigo} shrink-0">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="min-w-0">
        <p class="text-2xl font-bold text-gray-900">${value}</p>
        <p class="text-sm font-medium text-gray-700">${label}</p>
        ${sub ? `<p class="text-xs text-gray-400 mt-0.5">${sub}</p>` : ''}
      </div>
    </div>`;
}

// ── Charts ─────────────────────────────────────────────────────────────────────

function anBuildVelocity(data) {
  const ctx = document.getElementById('an-velocity-chart');
  if (!ctx) return;
  const max = Math.max(...data.map(w => w.completed), 1);
  _analyticsCharts.velocity = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(w => w.label),
      datasets: [{
        label: 'Completed',
        data: data.map(w => w.completed),
        backgroundColor: 'rgba(99,102,241,0.75)',
        borderColor: '#6366f1',
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          max: max + 1,
          ticks: { stepSize: 1, font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function anBuildPriority(data) {
  const ctx = document.getElementById('an-priority-chart');
  if (!ctx) return;
  const total = data.high + data.medium + data.low || 1;
  _analyticsCharts.priority = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{
        data: [data.high, data.medium, data.low],
        backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.label}: ${c.raw} (${Math.round(c.raw / total * 100)}%)`,
          },
        },
      },
    },
  });

  const legend = document.getElementById('an-priority-legend');
  if (!legend) return;
  const colors = { High: '#ef4444', Medium: '#f59e0b', Low: '#22c55e' };
  legend.innerHTML = [['High', data.high], ['Medium', data.medium], ['Low', data.low]].map(([lbl, cnt]) => `
    <div class="flex items-center justify-between text-sm">
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full inline-block" style="background:${colors[lbl]}"></span>
        <span class="text-gray-600">${lbl}</span>
      </div>
      <span class="font-semibold text-gray-900">${cnt}
        <span class="text-xs text-gray-400 font-normal">(${Math.round(cnt / total * 100)}%)</span>
      </span>
    </div>`).join('');
}

function anBuildStage(data) {
  const ctx = document.getElementById('an-stage-chart');
  if (!ctx) return;
  const colors = data.map(s => s.color || '#6366f1');
  _analyticsCharts.stage = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(s => s.stage_name),
      datasets: [{
        data: data.map(s => Number(s.count)),
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '58%',
      plugins: { legend: { display: false } },
    },
  });

  const total = data.reduce((s, r) => s + Number(r.count), 0) || 1;
  const legend = document.getElementById('an-stage-legend');
  if (!legend) return;
  legend.innerHTML = data.map(s => `
    <div class="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <div class="flex items-center gap-2.5">
        <span class="w-3 h-3 rounded-full shrink-0" style="background:${s.color || '#6366f1'}"></span>
        <span class="text-sm text-gray-700 truncate max-w-[180px]">${anEsc(s.stage_name)}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0 ml-2">
        <span class="font-semibold text-gray-900 text-sm">${s.count}</span>
        <span class="text-xs text-gray-400 w-8 text-right">${Math.round(s.count / total * 100)}%</span>
      </div>
    </div>`).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function anEsc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
