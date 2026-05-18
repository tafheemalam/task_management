// ─── Shared state ─────────────────────────────────────────────────────────────
let _empSelectedProject = null;
let _empViewMode        = 'board';
let _empDragTaskId      = null;
let _empSortField       = 'due_date';
let _empSortDir         = 'asc';
let _empPage            = 1;
const _EMP_PAGE_SIZE    = 10;

// ─── Employee Dashboard ───────────────────────────────────────────────────────
async function renderEmployeeDashboard() {
  document.getElementById('app').innerHTML = renderLayout('employee', `
    <div class="p-6 space-y-6">
      ${pageHeader(`Hello, ${state.user?.name || 'there'}!`, "Here's what's on your plate")}

      <div id="emp-stats">${skeletonStatCards(3)}</div>

      <div id="emp-alerts"></div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-diagram-project text-purple-500"></i> My Projects
          </h3>
          <button onclick="navigate('employee-tasks')" class="text-xs text-blue-600 hover:underline">
            View all tasks →
          </button>
        </div>
        <div id="emp-project-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${skeletonCards(2)}
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-list-check text-blue-500"></i> Recent Tasks
          </h3>
          ${state.user?.can_create_tasks
            ? `<button class="btn-primary text-xs" onclick="openEmpCreateTaskModal()">
                 <i class="fa-solid fa-plus"></i> New Task
               </button>`
            : ''}
        </div>
        <div id="emp-tasks">${skeletonCards(4)}</div>
      </div>
    </div>`);

  try {
    const [stats, projectTasks, myTasks] = await Promise.all([
      api.employee.stats(),
      api.employee.listProjectTasks(),
      api.employee.listTasks(),
    ]);

    document.getElementById('emp-stats').innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">${[
      statCard('fa-list-check',   stats.my_tasks, 'My Tasks',  'blue'),
      statCard('fa-circle-check', stats.done,     'Completed', 'green'),
      statCard('fa-clock',        stats.overdue,  'Overdue',   'red'),
    ].join('')}</div>`;

    // Build project cards from ALL project tasks (not just assigned)
    const projectMap = new Map();
    projectTasks.forEach(t => {
      if (!t.workflow_id) return;
      if (!projectMap.has(t.workflow_id))
        projectMap.set(t.workflow_id, { id: t.workflow_id, name: t.workflow_name, total: 0, done: 0, overdue: 0 });
      const p = projectMap.get(t.workflow_id);
      p.total++;
      if (['Done','Closed'].includes(t.stage_name)) p.done++;
      else if (isOverdue(t.due_date)) p.overdue++;
    });

    const cards = [...projectMap.values()].map(p => {
      const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
      return `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 cursor-pointer
                    hover:shadow-md hover:border-blue-200 transition-all group"
             onclick="_empSelectedProject=${p.id}; navigate('employee-tasks',{project:${p.id}})">
          <div class="flex items-start justify-between mb-3">
            <div class="font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">${p.name}</div>
            <i class="fa-solid fa-chevron-right text-gray-300 group-hover:text-blue-400 text-xs mt-1"></i>
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-500 mb-3">
            <span><i class="fa-solid fa-list-check mr-1 text-blue-400"></i>${p.total} task${p.total !== 1 ? 's' : ''}</span>
            <span><i class="fa-solid fa-circle-check mr-1 text-green-400"></i>${p.done} done</span>
            ${p.overdue > 0 ? `<span class="text-red-500"><i class="fa-solid fa-clock mr-1"></i>${p.overdue} overdue</span>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div class="bg-green-500 h-1.5 rounded-full" style="width:${pct}%"></div>
            </div>
            <span class="text-xs text-gray-400 w-8 text-right">${pct}%</span>
          </div>
        </div>`;
    });

    document.getElementById('emp-project-cards').innerHTML = cards.length
      ? cards.join('')
      : '<div class="col-span-3 text-sm text-gray-400 py-4">No projects yet — your manager will assign you to a project.</div>';

    // Alert section — overdue or due today, not done
    const today       = new Date().toISOString().split('T')[0];
    const alertTasks  = myTasks.filter(t =>
      t.due_date && t.due_date <= today && !['Done','Closed'].includes(t.stage_name)
    ).sort((a, b) => a.due_date < b.due_date ? -1 : 1);

    document.getElementById('emp-alerts').innerHTML = alertTasks.length ? `
      <div class="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
        <div class="flex items-center gap-3 px-5 py-4 border-b border-red-200 bg-red-100/60">
          <div class="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-triangle-exclamation text-white text-sm"></i>
          </div>
          <div>
            <div class="font-semibold text-red-800 text-sm">
              ${alertTasks.length} task${alertTasks.length !== 1 ? 's' : ''} need${alertTasks.length === 1 ? 's' : ''} your attention
            </div>
            <div class="text-xs text-red-600 mt-0.5">Due today or overdue — not yet marked as done</div>
          </div>
        </div>
        <div class="divide-y divide-red-100">
          ${alertTasks.map(t => {
            const isToday = t.due_date === today;
            const daysAgo = isToday ? 0 : Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000);
            return `
              <div class="flex items-center gap-4 px-5 py-3.5 hover:bg-red-100/50 cursor-pointer transition-colors group"
                   onclick="navigate('employee-task-detail',{id:${t.id}})">
                <i class="fa-solid fa-circle-exclamation text-lg shrink-0 ${isToday ? 'text-orange-400' : 'text-red-400'}"></i>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800 truncate">${t.title}</div>
                  <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                    ${priorityBadge(t.priority)}
                    ${t.workflow_name ? `<span class="text-xs text-gray-400">${t.workflow_name}</span>` : ''}
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-xs font-semibold ${isToday ? 'text-orange-600' : 'text-red-600'}">
                    ${isToday ? 'Due Today' : daysAgo + ' day' + (daysAgo !== 1 ? 's' : '') + ' overdue'}
                  </div>
                  <div class="text-xs text-gray-400 mt-0.5">${formatDate(t.due_date)}</div>
                </div>
                <i class="fa-solid fa-chevron-right text-red-300 group-hover:text-red-500 text-xs shrink-0 transition-colors"></i>
              </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Recent Tasks shows only tasks assigned to this employee
    document.getElementById('emp-tasks').innerHTML = myTasks.length
      ? myTasks.slice(0, 5).map(t => `
          <div class="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0
                      cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 group"
               onclick="navigate('employee-task-detail',{id:${t.id}})">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-800 truncate">${t.title}</div>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                ${priorityBadge(t.priority)} ${stageBadge(t.stage_name, t.stage_color)}
                ${t.workflow_name ? `<span class="text-xs text-gray-400">${t.workflow_name}</span>` : ''}
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-xs ${isOverdue(t.due_date) ? 'text-red-600 font-medium' : 'text-gray-400'}">
                ${t.due_date ? formatDate(t.due_date) : ''}
              </div>
              ${t.subtask_count > 0 ? `<div class="text-xs text-gray-400 mt-0.5"><i class="fa-solid fa-bars-staggered"></i> ${t.subtask_count}</div>` : ''}
            </div>
            <i class="fa-solid fa-chevron-right text-gray-300 group-hover:text-gray-500 text-xs flex-shrink-0"></i>
          </div>`).join('')
      : emptyState('fa-circle-check', 'No tasks assigned', 'You have no tasks yet — enjoy the quiet!');

  } catch (err) { showToast(err.message, 'error'); }
}

// ─── Employee Tasks page ──────────────────────────────────────────────────────
async function renderEmployeeTasks(params = {}) {
  if (params.project != null) _empSelectedProject = +params.project;

  document.getElementById('app').innerHTML = renderLayout('employee', `
    <div class="p-6 space-y-4">

      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">My Tasks</h1>
          <p class="text-sm text-gray-400 mt-0.5">Drag tasks between columns to update status</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="emp-btn-board" onclick="setEmpView('board')" class="btn-secondary text-xs">
            <i class="fa-solid fa-table-columns"></i> Board
          </button>
          <button id="emp-btn-list" onclick="setEmpView('list')" class="btn-secondary text-xs">
            <i class="fa-solid fa-list"></i> List
          </button>
          ${state.user?.can_create_tasks
            ? `<button class="btn-primary text-xs" onclick="openEmpCreateTaskModal()">
                 <i class="fa-solid fa-plus"></i> New Task
               </button>`
            : ''}
        </div>
      </div>

      <!-- Project tabs -->
      <div>
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Project</p>
        <div id="emp-project-tabs" class="flex flex-wrap gap-2">
          <div class="h-7 bg-gray-100 animate-pulse rounded-full w-24"></div>
          <div class="h-7 bg-gray-100 animate-pulse rounded-full w-32"></div>
        </div>
      </div>

      <!-- List-mode filters (hidden in board mode) -->
      <div id="emp-list-filters" class="hidden bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div class="grid grid-cols-2 gap-3">
          <!-- Search: flex wrapper avoids absolute-icon vs input-padding conflict -->
          <div class="col-span-2 flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white
                      focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <i class="fa-solid fa-magnifying-glass text-gray-400 text-sm shrink-0"></i>
            <input id="emp-search" type="text" class="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
                   placeholder="Search tasks by title…" oninput="filterEmpTasks()" />
          </div>
          <!-- Priority & Stage -->
          <select id="emp-filter-priority" class="input text-sm" onchange="filterEmpTasks()">
            <option value="">All Priorities</option>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
          <select id="emp-filter-stage" class="input text-sm" onchange="filterEmpTasks()">
            <option value="">All Stages</option>
          </select>
          <!-- Due date range -->
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Due From</label>
            <input id="emp-filter-due-from" type="date" class="input text-sm" onchange="filterEmpTasks()" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Due To</label>
            <input id="emp-filter-due-to" type="date" class="input text-sm" onchange="filterEmpTasks()" />
          </div>
        </div>
      </div>

      <!-- Board / List area -->
      <div id="emp-tasks-view">
        <div class="animate-pulse space-y-3">
          ${[1,2,3].map(() => '<div class="h-10 bg-gray-100 rounded"></div>').join('')}
        </div>
      </div>

    </div>`);

  try {
    const [workflows, tasks] = await Promise.all([
      api.employee.listWorkflows(),
      api.employee.listTasks(),
    ]);
    window._empWorkflows = workflows;
    window._empTasksAll  = tasks;

    // Populate stage filter for list view
    const stages = [...new Set(tasks.map(t => t.stage_name).filter(Boolean))].sort();
    const stageSel = document.getElementById('emp-filter-stage');
    if (stageSel) stages.forEach(n => {
      const o = document.createElement('option'); o.value = o.textContent = n; stageSel.appendChild(o);
    });

    // Auto-select a project for board mode
    if (_empViewMode === 'board' && _empSelectedProject === null && workflows.length)
      _empSelectedProject = workflows[0].id;

    _renderEmpProjectTabs(workflows, tasks);
    _syncViewButtons();
    filterEmpTasks();

  } catch (err) { showToast(err.message, 'error'); }
}

// ─── View toggle ──────────────────────────────────────────────────────────────
function setEmpView(mode) {
  _empViewMode = mode;

  // Board mode needs a project selected
  if (mode === 'board' && _empSelectedProject === null) {
    const wfs = window._empWorkflows || [];
    if (wfs.length) {
      _empSelectedProject = wfs[0].id;
      _renderEmpProjectTabs(wfs, window._empTasksAll || []);
    }
  }

  _syncViewButtons();
  const filters = document.getElementById('emp-list-filters');
  if (filters) filters.classList.toggle('hidden', mode === 'board');
  filterEmpTasks();
}

function _syncViewButtons() {
  const btnB = document.getElementById('emp-btn-board');
  const btnL = document.getElementById('emp-btn-list');
  if (btnB) btnB.className = _empViewMode === 'board' ? 'btn-primary text-xs' : 'btn-secondary text-xs';
  if (btnL) btnL.className = _empViewMode === 'list'  ? 'btn-primary text-xs' : 'btn-secondary text-xs';
}

// ─── Project tabs ─────────────────────────────────────────────────────────────
function _renderEmpProjectTabs(workflows, tasks) {
  const el = document.getElementById('emp-project-tabs');
  if (!el) return;

  const mk = (label, count, id) => {
    const active = id === null ? _empSelectedProject === null : _empSelectedProject == id;
    return `<button onclick="selectEmpProject(${id === null ? 'null' : id})"
              class="px-3 py-1.5 rounded-full text-xs font-medium transition-all
                     ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
              ${label} <span class="${active ? 'opacity-75' : 'opacity-60'}">(${count})</span>
            </button>`;
  };

  el.innerHTML = mk('All Projects', tasks.length, null)
    + workflows.map(wf => mk(wf.name, tasks.filter(t => t.workflow_id == wf.id).length, wf.id)).join('');

  if (!workflows.length)
    el.innerHTML += '<span class="text-xs text-gray-400 self-center ml-2">No projects yet.</span>';
}

function selectEmpProject(id) {
  _empSelectedProject = id;

  // Board needs a real project
  if (_empViewMode === 'board' && id === null) {
    const wfs = window._empWorkflows || [];
    if (wfs.length) _empSelectedProject = wfs[0].id;
  }

  _renderEmpProjectTabs(window._empWorkflows || [], window._empTasksAll || []);
  filterEmpTasks();
}

// ─── Filter / sort / page / route to view ────────────────────────────────────
function filterEmpTasks() {
  _empPage = 1;
  _runEmpView();
}

function setEmpSort(field) {
  if (_empSortField === field) {
    _empSortDir = _empSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _empSortField = field;
    _empSortDir   = 'asc';
  }
  _empPage = 1;
  _runEmpView();
}

function goEmpPage(n) {
  _empPage = n;
  _runEmpView();
}

function _runEmpView() {
  const all = window._empTasksAll || [];

  let list = all.filter(t => {
    if (_empSelectedProject != null && t.workflow_id != _empSelectedProject) return false;
    if (_empViewMode === 'list') {
      const prio    = document.getElementById('emp-filter-priority')?.value  || '';
      const stage   = document.getElementById('emp-filter-stage')?.value     || '';
      const q       = (document.getElementById('emp-search')?.value || '').toLowerCase();
      const dueFrom = document.getElementById('emp-filter-due-from')?.value  || '';
      const dueTo   = document.getElementById('emp-filter-due-to')?.value    || '';
      if (prio    && t.priority !== prio)                return false;
      if (stage   && (t.stage_name || '') !== stage)     return false;
      if (q       && !t.title.toLowerCase().includes(q)) return false;
      if (dueFrom && (!t.due_date || t.due_date < dueFrom)) return false;
      if (dueTo   && (!t.due_date || t.due_date > dueTo))   return false;
    }
    return true;
  });

  if (_empViewMode === 'board') { _renderEmpBoard(list); return; }

  // Sort
  const priorityRank = { high: 0, medium: 1, low: 2 };
  list.sort((a, b) => {
    let av, bv;
    if (_empSortField === 'priority') {
      av = priorityRank[a.priority] ?? 1;
      bv = priorityRank[b.priority] ?? 1;
    } else if (_empSortField === 'due_date') {
      av = a.due_date || '9999-99-99';
      bv = b.due_date || '9999-99-99';
    } else {
      av = (a[_empSortField] || '').toLowerCase();
      bv = (b[_empSortField] || '').toLowerCase();
    }
    if (av < bv) return _empSortDir === 'asc' ? -1 : 1;
    if (av > bv) return _empSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  // Paginate
  const total      = list.length;
  const totalPages = Math.max(1, Math.ceil(total / _EMP_PAGE_SIZE));
  if (_empPage > totalPages) _empPage = totalPages;
  const paged = list.slice((_empPage - 1) * _EMP_PAGE_SIZE, _empPage * _EMP_PAGE_SIZE);

  _renderEmpList(paged, total);
}

// ─── Board view ───────────────────────────────────────────────────────────────
function _renderEmpBoard(tasks) {
  const viewEl = document.getElementById('emp-tasks-view');
  if (!viewEl) return;

  const wf = (window._empWorkflows || []).find(w => w.id == _empSelectedProject);

  if (!wf) {
    viewEl.innerHTML = emptyState('fa-diagram-project', 'Select a project to use Board view', 'Click a project tab above');
    return;
  }

  const stages = [...(wf.stages || [])].sort((a, b) => a.order_index - b.order_index);
  if (!stages.length) {
    viewEl.innerHTML = emptyState('fa-table-columns', 'This project has no stages', 'Ask your manager to set up stages');
    return;
  }

  // Group tasks by stage_id
  const byStage = {};
  stages.forEach(s => { byStage[s.id] = []; });
  byStage['none'] = [];
  tasks.forEach(t => {
    const sid = t.stage_id != null ? t.stage_id : 'none';
    if (byStage[sid] !== undefined) byStage[sid].push(t);
    else byStage['none'].push(t);
  });

  const colHtml = stages.map(s => {
    const isDone = ['Done', 'Closed'].includes(s.name);
    const colTasks = byStage[s.id] || [];
    return `
      <div class="kanban-col flex-shrink-0 w-72 rounded-xl border flex flex-col
                  ${isDone ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}"
           data-stage-id="${s.id}"
           ondragover="empDragOver(event,this)"
           ondragleave="empDragLeave(this)"
           ondrop="empDrop(event,${s.id})">
        <div class="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
          <div class="w-3 h-3 rounded-full shrink-0" style="background:${s.color}"></div>
          <span class="text-sm font-semibold ${isDone ? 'text-green-700' : 'text-gray-700'}">${s.name}</span>
          ${isDone ? '<i class="fa-solid fa-lock text-xs text-green-400 ml-0.5"></i>' : ''}
          <span class="ml-auto text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
            ${colTasks.length}
          </span>
        </div>
        <div class="flex-1 p-2 space-y-2 min-h-[120px]">
          ${colTasks.map(t => _empTaskCard(t)).join('')}
          ${!colTasks.length ? `
            <div class="flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs
                        ${isDone ? 'border-green-200 text-green-300' : 'border-gray-200 text-gray-300'}">
              ${isDone ? '<i class="fa-solid fa-circle-check mr-1"></i> Drop to complete' : 'Drop here'}
            </div>` : ''}
        </div>
      </div>`;
  }).join('');

  const noneHtml = byStage['none'].length ? `
    <div class="kanban-col flex-shrink-0 w-72 bg-gray-50 rounded-xl border border-gray-200 flex flex-col"
         data-stage-id="none"
         ondragover="empDragOver(event,this)"
         ondragleave="empDragLeave(this)"
         ondrop="empDrop(event,null)">
      <div class="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <div class="w-3 h-3 rounded-full bg-gray-300 shrink-0"></div>
        <span class="text-sm font-semibold text-gray-500">No Stage</span>
        <span class="ml-auto text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
          ${byStage['none'].length}
        </span>
      </div>
      <div class="flex-1 p-2 space-y-2 min-h-[120px]">
        ${byStage['none'].map(t => _empTaskCard(t)).join('')}
      </div>
    </div>` : '';

  viewEl.innerHTML = `<div class="flex gap-4 overflow-x-auto pb-4">${colHtml}${noneHtml}</div>`;
}

const _EMP_CARD_PALETTE = [
  '#f97316', '#6366f1', '#10b981', '#8b5cf6',
  '#0ea5e9', '#ec4899', '#14b8a6', '#f59e0b',
];

function _empTaskCard(t) {
  const locked = ['Done', 'Closed'].includes(t.stage_name);
  const od     = isOverdue(t.due_date) && !locked;
  const drag   = locked ? '' : `draggable="true" ondragstart="empDragStart(event,${t.id})" ondragend="empDragEnd(event)"`;
  const accent = _EMP_CARD_PALETTE[t.id % _EMP_CARD_PALETTE.length];

  return `
    <div class="task-card select-none ${locked ? 'cursor-default opacity-70' : ''}"
         style="border-left:4px solid ${accent}"
         ${drag}
         data-task-id="${t.id}"
         onclick="navigate('employee-task-detail',{id:${t.id}})">
      <div class="flex items-start gap-2 mb-1.5">
        <div class="text-sm font-semibold text-gray-800 line-clamp-2 flex-1">${t.title}</div>
        ${locked ? '<i class="fa-solid fa-lock text-green-400 text-xs flex-shrink-0 mt-0.5"></i>' : ''}
      </div>
      <div class="flex items-center gap-1.5 mb-2">${priorityBadge(t.priority)}</div>
      <div class="flex items-center justify-between text-xs pt-1.5" style="border-top:1px solid #f1f5f9">
        <span class="text-gray-500 truncate max-w-[130px]">${t.assignee_name || 'Unassigned'}</span>
        ${t.due_date ? `<span class="${od ? 'text-red-500 font-medium' : 'text-gray-400'}">${formatDate(t.due_date)}</span>` : ''}
      </div>
      ${t.subtask_count > 0 ? `<div class="mt-1.5 text-[11px] text-gray-400 flex items-center gap-1"><i class="fa-solid fa-bars-staggered"></i>${t.subtask_count} subtask${t.subtask_count > 1 ? 's' : ''}</div>` : ''}
    </div>`;
}

// ─── List view ────────────────────────────────────────────────────────────────
function _empSortHeader(label, field) {
  const active = _empSortField === field;
  const icon   = active ? (_empSortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
  return `<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider
                      cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap group"
               onclick="setEmpSort('${field}')">
    <span class="flex items-center gap-1.5">
      ${label}
      <i class="fa-solid ${icon} text-[10px] ${active ? 'text-blue-500' : 'text-gray-300 group-hover:text-gray-400'}"></i>
    </span>
  </th>`;
}

function _empPagination(total, current) {
  const pages = Math.ceil(total / _EMP_PAGE_SIZE);
  if (pages <= 1) return '';
  const start = (current - 1) * _EMP_PAGE_SIZE + 1;
  const end   = Math.min(current * _EMP_PAGE_SIZE, total);

  const nav = (html, page, off) =>
    `<button onclick="goEmpPage(${page})"
             class="px-2.5 py-1.5 text-xs rounded-lg border transition-colors
                    ${off ? 'text-gray-300 border-gray-100 cursor-not-allowed pointer-events-none'
                          : 'text-gray-600 border-gray-200 hover:bg-gray-50'}"
             ${off ? 'disabled' : ''}>${html}</button>`;

  const nums = [];
  for (let p = Math.max(1, current - 2); p <= Math.min(pages, current + 2); p++) nums.push(p);

  return `
    <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
      <span class="text-xs text-gray-500">
        Showing <span class="font-medium">${start}&ndash;${end}</span> of <span class="font-medium">${total}</span> tasks
      </span>
      <div class="flex items-center gap-1">
        ${nav('<i class="fa-solid fa-chevron-left"></i>', current - 1, current === 1)}
        ${nums.map(p =>
          `<button onclick="goEmpPage(${p})"
                   class="px-2.5 py-1.5 text-xs rounded-lg border transition-colors font-medium
                          ${p === current
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'text-gray-600 border-gray-200 hover:bg-gray-50'}">${p}</button>`
        ).join('')}
        ${nav('<i class="fa-solid fa-chevron-right"></i>', current + 1, current === pages)}
      </div>
    </div>`;
}

function _renderEmpList(tasks, total) {
  const viewEl = document.getElementById('emp-tasks-view');
  if (!viewEl) return;

  if (total === 0) {
    viewEl.innerHTML = emptyState('fa-inbox', 'No tasks found', 'Try selecting a different project or clearing the filters');
    return;
  }

  viewEl.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              ${_empSortHeader('Task', 'title')}
              ${_empSortHeader('Project', 'workflow_name')}
              ${_empSortHeader('Stage', 'stage_name')}
              ${_empSortHeader('Priority', 'priority')}
              ${_empSortHeader('Due Date', 'due_date')}
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sub</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${tasks.map(t => {
              const od = isOverdue(t.due_date) && !['Done','Closed'].includes(t.stage_name);
              return `
                <tr class="${od ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'} cursor-pointer transition-colors"
                    onclick="navigate('employee-task-detail',{id:${t.id}})">
                  <td class="px-4 py-3 font-medium text-sm text-gray-900 max-w-xs">
                    <div class="truncate">${t.title}</div>
                  </td>
                  <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${t.workflow_name || '—'}</td>
                  <td class="px-4 py-3 whitespace-nowrap">${stageBadge(t.stage_name, t.stage_color)}</td>
                  <td class="px-4 py-3 whitespace-nowrap">${priorityBadge(t.priority)}</td>
                  <td class="px-4 py-3 text-sm whitespace-nowrap ${od ? 'text-red-600 font-medium' : 'text-gray-500'}">
                    ${t.due_date ? formatDate(t.due_date) : '—'}
                  </td>
                  <td class="px-4 py-3 text-center">
                    ${+t.subtask_count > 0
                      ? `<span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">${t.subtask_count}</span>`
                      : '<span class="text-gray-300 text-xs">—</span>'}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${_empPagination(total, _empPage)}
    </div>`;
}

// ─── Drag-and-drop ────────────────────────────────────────────────────────────
function empDragStart(event, taskId) {
  _empDragTaskId = taskId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', taskId);
  setTimeout(() => {
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) el.style.opacity = '0.4';
  }, 0);
}

function empDragEnd() {
  document.querySelectorAll('[data-task-id]').forEach(el => el.style.opacity = '');
  document.querySelectorAll('[data-stage-id]').forEach(col =>
    col.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50')
  );
}

function empDragOver(event, col) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  col.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50');
}

function empDragLeave(col) {
  col.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');
}

async function empDrop(event, stageId) {
  event.preventDefault();
  const col = event.currentTarget;
  col.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');

  const taskId = _empDragTaskId;
  _empDragTaskId = null;
  if (!taskId) return;

  const tasks = window._empTasksAll || [];
  const idx   = tasks.findIndex(t => t.id == taskId);
  if (idx < 0) return;

  const task = tasks[idx];
  // No-op if dropped on same stage
  if (String(task.stage_id) === String(stageId)) return;

  // Resolve stage display info for optimistic update
  const wf       = (window._empWorkflows || []).find(w => w.id == task.workflow_id);
  const newStage = stageId ? (wf?.stages || []).find(s => s.id == stageId) : null;

  const prev = { stage_id: task.stage_id, stage_name: task.stage_name, stage_color: task.stage_color };

  // Optimistic update
  window._empTasksAll[idx] = {
    ...task,
    stage_id:    stageId        ?? null,
    stage_name:  newStage?.name  ?? null,
    stage_color: newStage?.color ?? null,
  };
  filterEmpTasks();

  try {
    await api.employee.updateStage(taskId, stageId);
    showToast(newStage ? `Moved to "${newStage.name}"` : 'Stage updated');
  } catch (err) {
    // Roll back on failure (e.g. task was already Done)
    window._empTasksAll[idx] = { ...task, ...prev };
    filterEmpTasks();
    showToast(err.message, 'error');
  }
}

// ─── Create task modal ────────────────────────────────────────────────────────
async function openEmpCreateTaskModal() {
  let workflows = [];
  try { workflows = await api.employee.listWorkflows(); } catch {}

  const wfOptions = workflows.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  window._empWorkflows = workflows;
  window._pendingEmpChecklist = [];

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:820px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
              <i class="fa-solid fa-plus text-white text-sm"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-900">Create New Task</h3>
          </div>
          <button onclick="closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body: 2-column -->
        <form id="emp-task-form" onsubmit="submitEmpCreateTask(event)" style="flex:1;overflow-y:auto;display:flex;min-height:0">

          <!-- LEFT — content -->
          <div class="flex-1 p-6 space-y-4 overflow-y-auto" style="min-width:0;border-right:1px solid #f1f5f9">
            <button type="button" class="btn-secondary w-full justify-center text-sm" onclick="openEmpTemplatePicker()">
              <i class="fa-solid fa-wand-magic-sparkles text-indigo-400"></i> Use Template
            </button>
            <div>
              <label class="label">Task Title <span class="text-red-500">*</span></label>
              <input name="title" class="input text-base" placeholder="What needs to be done?" required />
            </div>

            <div>
              <label class="label">Description</label>
              <textarea name="description" class="input" rows="5" placeholder="Add details, steps, or context…"></textarea>
            </div>

            <div>
              <label class="label" style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Attachments</label>
              <label class="flex items-center gap-2.5 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                <i class="fa-solid fa-paperclip text-gray-400"></i>
                <span id="emp-attach-label" class="text-sm text-gray-400 flex-1">Choose files…</span>
                <input type="file" id="emp-attach-files" multiple class="hidden"
                       onchange="updateAttachLabel(this,'emp-attach-label')" />
              </label>
            </div>

            <div id="emp-task-error" class="hidden p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
              <i class="fa-solid fa-circle-exclamation mr-1.5"></i><span></span>
            </div>
          </div>

          <!-- RIGHT — metadata -->
          <div class="p-5 space-y-4 overflow-y-auto shrink-0" style="width:216px;background:#f8fafc">

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-diagram-project mr-1 text-indigo-400"></i> Project <span class="text-red-500">*</span>
              </label>
              <select name="workflow_id" class="input text-sm" id="emp-workflow-sel"
                      onchange="empLoadStages(this.value)" required>
                <option value="">Select project…</option>${wfOptions}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-circle-dot mr-1 text-blue-400"></i> Stage
              </label>
              <select name="stage_id" class="input text-sm" id="emp-stage-sel">
                <option value="">No stage</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-flag mr-1 text-yellow-400"></i> Priority
              </label>
              <select name="priority" class="input text-sm">
                <option value="high">🔴 High</option>
                <option value="medium" selected>🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-calendar-day mr-1 text-red-400"></i> Due Date <span class="text-red-500">*</span>
              </label>
              <input name="due_date" type="date" class="input text-sm" required />
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-calendar-plus mr-1 text-gray-400"></i> Start Date
              </label>
              <input name="start_date" type="date" class="input text-sm" />
            </div>

          </div>
        </form>

        <!-- Footer -->
        <div class="px-6 py-3.5 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-white">
          <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" form="emp-task-form" class="btn-primary">
            <i class="fa-solid fa-plus"></i> Create Task
          </button>
        </div>

      </div>
    </div>`);

  if (_empSelectedProject) {
    const sel = document.getElementById('emp-workflow-sel');
    if (sel) { sel.value = _empSelectedProject; empLoadStages(_empSelectedProject); }
  }

  const titleInput   = document.querySelector('#emp-task-form [name="title"]');
  const dueDateInput = document.querySelector('#emp-task-form [name="due_date"]');
  if (titleInput)   setupFieldValidation(titleInput,   [_validators.required]);
  if (dueDateInput) setupFieldValidation(dueDateInput, [_validators.required]);
}

function empLoadStages(wfId) {
  const wf  = (window._empWorkflows || []).find(w => w.id == wfId);
  const sel = document.getElementById('emp-stage-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">No stage</option>';
  (wf?.stages || []).forEach(s => {
    const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o);
  });
}

async function openEmpTemplatePicker() {
  let templates = [];
  try {
    const res = await api.employee.listTaskTemplates();
    templates = res.data || [];
  } catch (err) { showToast(err.message, 'error'); return; }

  if (!templates.length) { showToast('No task templates yet.', 'info'); return; }
  window._empTemplates = templates;

  // Remove existing panel if open (toggle)
  if (document.getElementById('emp-template-picker-panel')) {
    document.getElementById('emp-template-picker-panel').remove(); return;
  }

  const panel = document.createElement('div');
  panel.id = 'emp-template-picker-panel';
  panel.style.cssText = 'position:absolute;top:56px;left:16px;right:16px;z-index:9999;background:#fff;border:1px solid #e0e7ff;border-radius:14px;box-shadow:0 8px 32px rgba(99,102,241,0.18);max-height:320px;overflow-y:auto';
  panel.innerHTML = `
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
      <span class="text-sm font-semibold text-gray-800"><i class="fa-solid fa-wand-magic-sparkles text-indigo-500 mr-2"></i>Choose a Template</span>
      <button onclick="document.getElementById('emp-template-picker-panel').remove()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="p-3 space-y-1.5">
      ${templates.map(t => `
        <div onclick="applyEmpTaskTemplate(${t.id})"
             class="p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
          <div class="font-medium text-gray-800 text-sm">${t.name}</div>
          <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
            ${priorityBadge(t.priority)}
            ${t.checklist ? `<span><i class="fa-solid fa-list-check mr-0.5"></i>${JSON.parse(t.checklist||'[]').length} items</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`;

  const modalBox = document.querySelector('.modal-box');
  if (modalBox) { modalBox.style.position = 'relative'; modalBox.appendChild(panel); }
}

function applyEmpTaskTemplate(templateId) {
  const tpl = (window._empTemplates || []).find(t => t.id == templateId);
  if (!tpl) return;

  document.getElementById('emp-template-picker-panel')?.remove();

  const form = document.getElementById('emp-task-form');
  if (!form) return;

  const titleEl = form.querySelector('[name=title]');
  const descEl  = form.querySelector('[name=description]');
  const prioEl  = form.querySelector('[name=priority]');
  if (titleEl) titleEl.value = tpl.title_template || '';
  if (descEl)  descEl.value  = tpl.description    || '';
  if (prioEl)  prioEl.value  = tpl.priority        || 'medium';

  const checklist = JSON.parse(tpl.checklist || '[]');
  window._pendingEmpChecklist = checklist;

  if (checklist.length) {
    const area = form.querySelector('#emp-task-error');
    const existing = document.getElementById('emp-tpl-checklist-preview');
    existing?.remove();
    if (area) {
      const preview = document.createElement('div');
      preview.id = 'emp-tpl-checklist-preview';
      preview.className = 'p-3 bg-indigo-50 rounded-xl border border-indigo-100';
      preview.innerHTML = `<p class="text-xs font-semibold text-indigo-600 mb-2"><i class="fa-solid fa-list-check mr-1"></i> ${checklist.length} checklist item${checklist.length > 1 ? 's' : ''} will be added</p>` +
        checklist.map(item => `<p class="text-xs text-gray-600 flex items-center gap-1.5 mb-1"><i class="fa-regular fa-square text-gray-400"></i>${item}</p>`).join('');
      area.parentNode.insertBefore(preview, area);
    }
  }

  showToast('Template applied!', 'success');
}

async function submitEmpCreateTask(e) {
  e.preventDefault();
  const titleInput   = document.querySelector('#emp-task-form [name="title"]');
  const dueDateInput = document.querySelector('#emp-task-form [name="due_date"]');
  if (!validateForm([
    ...(titleInput   ? [{ input: titleInput,   rules: [_validators.required] }] : []),
    ...(dueDateInput ? [{ input: dueDateInput, rules: [_validators.required] }] : []),
  ])) return;

  const data = Object.fromEntries(new FormData(e.target).entries());
  if (!data.stage_id)    delete data.stage_id;
  if (!data.assignee_id) delete data.assignee_id;

  const errEl     = document.getElementById('emp-task-error');
  const fileInput = document.getElementById('emp-attach-files');
  const submitBtn = document.querySelector('#emp-task-form ~ div button[type="submit"]')
                 || document.querySelector('[form="emp-task-form"]');
  errEl.classList.add('hidden');
  if (submitBtn) setButtonLoading(submitBtn, true);
  try {
    const resp   = await api.employee.createTask(data);
    const taskId = resp.data?.id || resp.id;
    closeModal();
    await uploadFilesAfterCreate(taskId, fileInput, (id, fd) => api.employee.uploadAttachment(id, fd));

    if (window._pendingEmpChecklist?.length) {
      await Promise.all(
        window._pendingEmpChecklist.map((title, i) =>
          api.employee.createSubtask(taskId, { title, sort_order: i })
        )
      );
      window._pendingEmpChecklist = [];
    }

    showToast('Task created!');
    navigate('employee-task-detail', { id: taskId });
  } catch (err) {
    errEl.querySelector('span').textContent = err.message;
    errEl.classList.remove('hidden');
    if (submitBtn) setButtonLoading(submitBtn, false);
  }
}
