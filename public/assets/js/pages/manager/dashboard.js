// ─── Chart registry ───────────────────────────────────────────────────────────
const _mc = {};
function _mChart(id, cfg) {
  if (_mc[id]) { try { _mc[id].destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el) return;
  _mc[id] = new Chart(el, cfg);
}
function _killMgrCharts() {
  Object.keys(_mc).forEach(k => { try { _mc[k].destroy(); } catch {} delete _mc[k]; });
}

const MGR_STAGE_COLORS = {
  'To Do':       '#94a3b8',
  'In Progress': '#3b82f6',
  'Review':      '#f59e0b',
  'QA':          '#8b5cf6',
  'Testing':     '#06b6d4',
  'Done':        '#10b981',
  'Closed':      '#6b7280',
  'Unassigned':  '#e2e8f0',
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
function _mKpi(icon, value, label, color, bg, sub = '') {
  return `
    <div class="bg-white rounded-xl shadow-sm p-5 flex items-start gap-4"
         style="border-left:4px solid ${color}">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
           style="background:${bg};color:${color}">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="min-w-0">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">${label}</p>
        <p class="text-3xl font-extrabold leading-none mt-1" style="color:${color}">${value}</p>
        ${sub ? `<p class="text-xs text-gray-400 mt-1">${sub}</p>` : ''}
      </div>
    </div>`;
}

// ─── Chart builders ───────────────────────────────────────────────────────────
function _mDrawProjects(projects) {
  const wrap = document.getElementById('mc-projects-wrap');
  if (!wrap || !projects.length) {
    if (wrap) wrap.innerHTML = '<p class="text-sm text-gray-400 py-8 text-center">No projects yet</p>';
    return;
  }
  const h = Math.max(240, projects.length * 52);
  wrap.style.height = h + 'px';

  const labels  = projects.map(p => p.workflow_name);
  const done    = projects.map(p => +p.done    || 0);
  const overdue = projects.map(p => +p.overdue || 0);
  const active  = projects.map((p, i) => Math.max(0, (+p.total || 0) - done[i] - overdue[i]));

  _mChart('mc-projects', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Done',        data: done,    backgroundColor: '#10b981', borderRadius: 3 },
        { label: 'In Progress', data: active,  backgroundColor: '#3b82f6', borderRadius: 3 },
        { label: 'Overdue',     data: overdue, backgroundColor: '#ef4444', borderRadius: 3 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, padding: 12, usePointStyle: true } },
        tooltip: {
          callbacks: {
            footer: items => `Total: ${items.reduce((s, i) => s + i.raw, 0)} tasks`,
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
        y: { stacked: true, ticks: { font: { size: 11 } } },
      },
      onClick: (e, els) => {
        if (!els.length) return;
        navigate('manager-tasks');
      },
      onHover: (e, els) => {
        const cv = document.getElementById('mc-projects');
        if (cv) cv.style.cursor = els.length ? 'pointer' : 'default';
      },
    },
  });
}

function _mDrawStatus(stages) {
  if (!stages.length) return;
  const labels = stages.map(s => s.stage_name);
  const data   = stages.map(s => +s.count || 0);
  const colors = labels.map(l => MGR_STAGE_COLORS[l] || '#6366f1');
  const total  = data.reduce((a, b) => a + b, 0);

  _mChart('mc-status', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: '#fff', hoverOffset: 8 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} (${total ? Math.round(ctx.raw / total * 100) : 0}%)`,
          },
        },
      },
    },
    plugins: [{
      id: 'mCenter',
      beforeDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right)  / 2;
        const cy = (chartArea.top  + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillStyle = '#111827';
        ctx.fillText(total, cx, cy - 8);
        ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = '#6b7280';
        ctx.fillText('tasks', cx, cy + 11);
        ctx.restore();
      },
    }],
  });
}

function _mDrawPriority(priorities) {
  const map = { high: 0, medium: 0, low: 0 };
  (priorities || []).forEach(p => { if (p.priority in map) map[p.priority] = +p.count; });
  const total = map.high + map.medium + map.low;

  _mChart('mc-priority', {
    type: 'doughnut',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{
        data: [map.high, map.medium, map.low],
        backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
        borderWidth: 3, borderColor: '#fff', hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} (${total ? Math.round(ctx.raw / total * 100) : 0}%)`,
          },
        },
      },
    },
    plugins: [{
      id: 'mCenter2',
      beforeDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right)  / 2;
        const cy = (chartArea.top  + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillStyle = '#111827';
        ctx.fillText(total, cx, cy - 8);
        ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = '#6b7280';
        ctx.fillText('tasks', cx, cy + 11);
        ctx.restore();
      },
    }],
  });
}

// ─── Page renderer ────────────────────────────────────────────────────────────
async function renderManagerDashboard() {
  _killMgrCharts();

  const company = state.user?.company_name || 'Your Company';

  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6 space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-extrabold text-gray-900">Welcome, ${state.user?.name || 'Manager'}</h1>
          <p class="text-sm text-gray-400 mt-0.5 flex items-center gap-1.5">
            <i class="fa-solid fa-building text-blue-400"></i>
            <span>${company}</span>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span id="mgr-ts" class="text-xs text-gray-400 hidden sm:block"></span>
          <button onclick="renderManagerDashboard()" class="btn-secondary text-xs">
            <i class="fa-solid fa-rotate-right"></i> Refresh
          </button>
        </div>
      </div>

      <!-- KPI cards -->
      <div id="mgr-kpis" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${[1,2,3,4].map(() => `
          <div class="bg-white rounded-xl shadow-sm p-5 animate-pulse border-l-4 border-gray-200">
            <div class="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
            <div class="h-7 bg-gray-200 rounded w-1/2"></div>
          </div>`).join('')}
      </div>

      <!-- Project progress — full width -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="font-bold text-gray-800">Project Progress</h2>
            <p class="text-xs text-gray-400 mt-0.5">Task completion across all projects in <strong>${company}</strong></p>
          </div>
          <button onclick="navigate('manager-tasks')" class="text-xs text-blue-600 hover:underline whitespace-nowrap">
            All tasks →
          </button>
        </div>
        <div id="mc-projects-wrap" style="position:relative;height:240px;">
          <canvas id="mc-projects"></canvas>
        </div>
      </div>

      <!-- Two small doughnuts -->
      <div class="grid lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 class="font-bold text-gray-800 text-sm mb-0.5">Task Status</h2>
          <p class="text-xs text-gray-400 mb-4">Distribution by workflow stage</p>
          <div style="position:relative;height:220px;">
            <canvas id="mc-status"></canvas>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 class="font-bold text-gray-800 text-sm mb-0.5">Priority Breakdown</h2>
          <p class="text-xs text-gray-400 mb-4">Tasks by urgency level</p>
          <div style="position:relative;height:220px;">
            <canvas id="mc-priority"></canvas>
          </div>
        </div>
      </div>

      <!-- Recent tasks + team -->
      <div class="grid lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <i class="fa-solid fa-list-check text-blue-500"></i> Recent Tasks
            </h2>
            <button onclick="navigate('manager-tasks')" class="text-xs text-blue-600 hover:underline">View all</button>
          </div>
          <div id="mgr-recent-tasks">
            <div class="animate-pulse space-y-3">
              ${[1,2,3].map(() => '<div class="h-10 bg-gray-100 rounded"></div>').join('')}
            </div>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <i class="fa-solid fa-users text-green-500"></i> Team — ${company}
            </h2>
            <button onclick="navigate('manager-users')" class="text-xs text-blue-600 hover:underline">Manage</button>
          </div>
          <div id="mgr-team">
            <div class="animate-pulse space-y-3">
              ${[1,2,3].map(() => '<div class="h-10 bg-gray-100 rounded"></div>').join('')}
            </div>
          </div>
        </div>
      </div>

    </div>`);

  try {
    const [sysStats, projStats, tasks, users] = await Promise.all([
      api.manager.stats(),
      api.manager.projectStats(),
      api.manager.listTasks(),
      api.manager.listUsers(),
    ]);

    const ts = document.getElementById('mgr-ts');
    if (ts) { ts.textContent = `Updated ${new Date().toLocaleTimeString()}`; ts.classList.remove('hidden'); }

    // KPI cards
    const total  = sysStats.total_tasks    || 0;
    const done   = (projStats.by_stage || []).filter(s => ['Done','Closed'].includes(s.stage_name))
                                              .reduce((n, s) => n + (+s.count || 0), 0);
    const pct    = total > 0 ? Math.round(done / total * 100) : 0;

    document.getElementById('mgr-kpis').innerHTML = [
      _mKpi('fa-users',          sysStats.total_users,     'Team Members',    '#3b82f6', '#eff6ff'),
      _mKpi('fa-list-check',     total,                    'Total Tasks',     '#10b981', '#f0fdf4', `${pct}% done`),
      _mKpi('fa-diagram-project',sysStats.total_workflows, 'Projects',        '#8b5cf6', '#f5f3ff'),
      _mKpi('fa-clock',          sysStats.overdue_tasks,   'Overdue',         '#ef4444', '#fef2f2', 'Need attention'),
    ].join('');

    // Draw charts
    requestAnimationFrame(() => {
      _mDrawProjects(projStats.by_project || []);
      _mDrawStatus(projStats.by_stage    || []);
      _mDrawPriority(projStats.by_priority || []);
    });

    // Recent tasks
    document.getElementById('mgr-recent-tasks').innerHTML = tasks.length
      ? tasks.slice(0, 6).map(t => `
          <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 group"
               onclick="navigate('manager-task-detail',{id:${t.id}})">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-800 truncate">${t.title}</div>
              <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                ${priorityBadge(t.priority)} ${stageBadge(t.stage_name, t.stage_color)}
                <span class="text-xs text-gray-400">${t.workflow_name || ''}</span>
              </div>
            </div>
            <div class="text-xs text-gray-400 flex-shrink-0">${t.assignee_name || 'Unassigned'}</div>
            <i class="fa-solid fa-chevron-right text-gray-300 group-hover:text-gray-500 text-xs flex-shrink-0"></i>
          </div>`).join('')
      : emptyState('fa-list-check', 'No tasks yet', 'Create your first task');

    // Team
    document.getElementById('mgr-team').innerHTML = users.length
      ? users.slice(0, 6).map(u => `
          <div class="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                ${avatarInitials(u.name)}
              </div>
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-800 truncate">${u.name}</div>
                <div class="text-xs text-gray-400 truncate">${u.email}</div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${u.can_create_tasks ? '<span class="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">Can Create</span>' : ''}
              ${statusDot(u.is_active)}
            </div>
          </div>`).join('')
      : emptyState('fa-users', 'No team members', 'Add employees to get started');

  } catch (err) {
    showToast('Dashboard error: ' + err.message, 'error');
  }
}
