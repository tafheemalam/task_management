// ─── State ───────────────────────────────────────────────────────────────────
let _psTasks  = [];
let _psSortCol = 'created_at';
let _psSortDir = 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _miniKpi(icon, value, label, color) {
  return `
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
           style="background:${color}22;color:${color}">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div>
        <div class="text-2xl font-extrabold text-gray-900 leading-none">${value}</div>
        <div class="text-xs text-gray-500 mt-0.5">${label}</div>
      </div>
    </div>`;
}

function _sortIcon(col) {
  if (_psSortCol !== col) return '<i class="fa-solid fa-sort text-gray-300 ml-1"></i>';
  return _psSortDir === 'asc'
    ? '<i class="fa-solid fa-sort-up text-blue-500 ml-1"></i>'
    : '<i class="fa-solid fa-sort-down text-blue-500 ml-1"></i>';
}

function _thBtn(col, label) {
  return `<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
              onclick="psSortBy('${col}')">${label}${_sortIcon(col)}</th>`;
}

function _sortedFiltered(tasks) {
  const company  = document.getElementById('ps-f-company')?.value  || '';
  const project  = document.getElementById('ps-f-project')?.value  || '';
  const stage    = document.getElementById('ps-f-stage')?.value    || '';
  const priority = document.getElementById('ps-f-priority')?.value || '';
  const search   = (document.getElementById('ps-f-search')?.value  || '').toLowerCase();

  let list = tasks.filter(t => {
    if (company  && String(t.company_id)  !== company)  return false;
    if (project  && String(t.workflow_id) !== project)  return false;
    if (stage    && (t.stage_name || 'Unassigned') !== stage) return false;
    if (priority && t.priority !== priority)            return false;
    if (search   && !t.title.toLowerCase().includes(search) &&
        !t.workflow_name?.toLowerCase().includes(search))    return false;
    return true;
  });

  const prioOrder = { high: 0, medium: 1, low: 2 };
  list.sort((a, b) => {
    let av, bv;
    if (_psSortCol === 'priority') {
      av = prioOrder[a.priority] ?? 9;
      bv = prioOrder[b.priority] ?? 9;
    } else if (_psSortCol === 'due_date' || _psSortCol === 'created_at') {
      av = a[_psSortCol] ? new Date(a[_psSortCol]).getTime() : (Infinity * (_psSortDir === 'asc' ? 1 : -1));
      bv = b[_psSortCol] ? new Date(b[_psSortCol]).getTime() : (Infinity * (_psSortDir === 'asc' ? 1 : -1));
    } else {
      av = (a[_psSortCol] || '').toString().toLowerCase();
      bv = (b[_psSortCol] || '').toString().toLowerCase();
    }
    if (av < bv) return _psSortDir === 'asc' ? -1 :  1;
    if (av > bv) return _psSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return list;
}

// ─── Public actions ──────────────────────────────────────────────────────────
function psSortBy(col) {
  if (_psSortCol === col) {
    _psSortDir = _psSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _psSortCol = col;
    _psSortDir = 'asc';
  }
  psRenderTable();
}

function psClearFilters() {
  ['ps-f-company','ps-f-project','ps-f-stage','ps-f-priority'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('ps-f-search');
  if (s) s.value = '';
  psApplyFilters();
}

function psApplyFilters() {
  psRenderTable();
}

function psRenderTable() {
  const list = _sortedFiltered(_psTasks);

  // Update KPIs
  const total     = list.length;
  const done      = list.filter(t => ['Done','Closed'].includes(t.stage_name)).length;
  const overdue   = list.filter(t => isOverdue(t.due_date) && !['Done','Closed'].includes(t.stage_name)).length;
  const unassigned = list.filter(t => !t.assignee_name).length;

  const kpiEl = document.getElementById('ps-kpis');
  if (kpiEl) kpiEl.innerHTML = [
    _miniKpi('fa-list-check',  total,      'Tasks Found',  '#3b82f6'),
    _miniKpi('fa-circle-check', done,      'Completed',    '#10b981'),
    _miniKpi('fa-clock',        overdue,   'Overdue',      '#ef4444'),
    _miniKpi('fa-user-slash',   unassigned,'Unassigned',   '#94a3b8'),
  ].join('');

  // Update breadcrumb
  const bc = document.getElementById('ps-breadcrumb');
  if (bc) {
    const parts = [];
    const cSel = document.getElementById('ps-f-company');
    const pSel = document.getElementById('ps-f-project');
    if (cSel?.value) parts.push(cSel.options[cSel.selectedIndex]?.text);
    if (pSel?.value) parts.push(pSel.options[pSel.selectedIndex]?.text);
    const stage    = document.getElementById('ps-f-stage')?.value;
    const priority = document.getElementById('ps-f-priority')?.value;
    if (stage)    parts.push(stage + ' stage');
    if (priority) parts.push(priority + ' priority');
    bc.textContent = parts.length
      ? `Showing ${total} task${total !== 1 ? 's' : ''} · ${parts.join(' → ')}`
      : `All tasks across all projects (${total})`;
  }

  // Table
  const tableEl = document.getElementById('ps-table');
  if (!tableEl) return;

  if (!list.length) {
    tableEl.innerHTML = emptyState('fa-inbox', 'No tasks match your filters', 'Try clearing the filters');
    return;
  }

  const thead = `
    <thead>
      <tr class="bg-gray-50 sticky top-0 z-10">
        ${_thBtn('title',         'Task')}
        ${_thBtn('workflow_name', 'Project')}
        ${_thBtn('company_name',  'Company')}
        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
        ${_thBtn('priority',      'Priority')}
        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignee</th>
        ${_thBtn('due_date',      'Due Date')}
        <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Sub</th>
      </tr>
    </thead>`;

  const rows = list.map(t => {
    const od = isOverdue(t.due_date) && !['Done','Closed'].includes(t.stage_name);
    return `
      <tr class="${od ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'} transition-colors">
        <td class="px-4 py-3 max-w-xs">
          <div class="font-medium text-sm text-gray-900 truncate" title="${t.title}">${t.title}</div>
          <div class="text-xs text-gray-400 mt-0.5">by ${t.creator_name || '—'}</div>
        </td>
        <td class="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">${t.workflow_name}</td>
        <td class="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">${t.company_name}</td>
        <td class="px-4 py-3">${stageBadge(t.stage_name, t.stage_color)}</td>
        <td class="px-4 py-3">${priorityBadge(t.priority)}</td>
        <td class="px-4 py-3 text-sm ${t.assignee_name ? 'text-gray-700' : 'text-gray-400 italic'}">${t.assignee_name || 'Unassigned'}</td>
        <td class="px-4 py-3 text-sm whitespace-nowrap ${od ? 'text-red-600 font-semibold' : 'text-gray-500'}">${formatDate(t.due_date)}</td>
        <td class="px-4 py-3 text-center">
          ${+t.subtask_count > 0
            ? `<span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">${t.subtask_count}</span>`
            : '<span class="text-gray-300">—</span>'}
        </td>
      </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-100">
        ${thead}
        <tbody class="divide-y divide-gray-100">${rows}</tbody>
      </table>
    </div>`;
}

function _populateFilters(tasks) {
  // Unique companies
  const companies = [...new Map(tasks.map(t => [String(t.company_id), t.company_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const projects  = [...new Map(tasks.map(t => [String(t.workflow_id), t.workflow_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const stages    = [...new Set(tasks.map(t => t.stage_name || 'Unassigned'))].sort();

  const append = (selId, pairs) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    pairs.forEach(([val, text]) => {
      const o = document.createElement('option');
      o.value = val; o.textContent = text;
      sel.appendChild(o);
    });
  };

  append('ps-f-company', companies);
  append('ps-f-project', projects);
  append('ps-f-stage',   stages.map(s => [s, s]));
}

// ─── Page renderer ───────────────────────────────────────────────────────────
async function renderAdminProjectStats(params = {}) {
  _psTasks   = [];
  _psSortCol = 'created_at';
  _psSortDir = 'desc';

  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6 space-y-5">

      <!-- Header -->
      <div class="flex items-center gap-4">
        <button onclick="navigate('admin-dashboard')" class="btn-secondary text-xs">
          <i class="fa-solid fa-arrow-left"></i> Dashboard
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-extrabold text-gray-900">Task Detail View</h1>
          <p id="ps-breadcrumb" class="text-sm text-gray-400 mt-0.5 truncate">Loading…</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div class="flex flex-wrap gap-3 items-end">
          <div>
            <label class="label">Company</label>
            <select id="ps-f-company" class="input w-auto text-sm" onchange="psApplyFilters()">
              <option value="">All Companies</option>
            </select>
          </div>
          <div>
            <label class="label">Project</label>
            <select id="ps-f-project" class="input w-auto text-sm" onchange="psApplyFilters()">
              <option value="">All Projects</option>
            </select>
          </div>
          <div>
            <label class="label">Stage</label>
            <select id="ps-f-stage" class="input w-auto text-sm" onchange="psApplyFilters()">
              <option value="">All Stages</option>
            </select>
          </div>
          <div>
            <label class="label">Priority</label>
            <select id="ps-f-priority" class="input w-auto text-sm" onchange="psApplyFilters()">
              <option value="">All Priorities</option>
              <option value="high">🔴 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
          </div>
          <div class="flex-1 min-w-40">
            <label class="label">Search</label>
            <input id="ps-f-search" type="text" class="input text-sm"
                   placeholder="Search by title or project…" oninput="psApplyFilters()" />
          </div>
          <button onclick="psClearFilters()" class="btn-secondary text-xs" style="height:38px">
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        </div>
      </div>

      <!-- KPI row -->
      <div id="ps-kpis" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${[1,2,3,4].map(() => '<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 animate-pulse h-16"></div>').join('')}
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div id="ps-table" class="p-6">
          <div class="animate-pulse space-y-3">
            ${[1,2,3,4,5].map(() => '<div class="h-8 bg-gray-100 rounded"></div>').join('')}
          </div>
        </div>
      </div>

    </div>`);

  try {
    _psTasks = await api.admin.projectDetail();
    _populateFilters(_psTasks);

    // Pre-apply filter from chart click
    if (params.filter === 'company'  && params.company_id) {
      const sel = document.getElementById('ps-f-company');
      if (sel) sel.value = String(params.company_id);
    } else if (params.filter === 'project' && params.workflow_id) {
      const sel = document.getElementById('ps-f-project');
      if (sel) sel.value = String(params.workflow_id);
    } else if (params.filter === 'stage' && params.name) {
      const sel = document.getElementById('ps-f-stage');
      if (sel) sel.value = params.name;
    } else if (params.filter === 'priority' && params.name) {
      const sel = document.getElementById('ps-f-priority');
      if (sel) sel.value = params.name;
    }

    psRenderTable();
  } catch (err) {
    showToast('Failed to load tasks: ' + err.message, 'error');
    const t = document.getElementById('ps-table');
    if (t) t.innerHTML = `<div class="text-center py-12 text-red-500">${err.message}</div>`;
  }
}
