// ─── Shared state ─────────────────────────────────────────────────────────────
let _empSelectedProject = null;
let _empViewMode        = 'board';
let _empDragTaskId      = null;

// ─── Employee Dashboard ───────────────────────────────────────────────────────
async function renderEmployeeDashboard() {
  document.getElementById('app').innerHTML = renderLayout('employee', `
    <div class="p-6 space-y-6">
      ${pageHeader(`Hello, ${state.user?.name || 'there'}!`, "Here's what's on your plate")}

      <div id="emp-stats" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${[1,2,3].map(() => '<div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-24"></div>').join('')}
      </div>

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
          ${[1,2].map(() => '<div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-24"></div>').join('')}
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
        <div id="emp-tasks">Loading...</div>
      </div>
    </div>`);

  try {
    const [stats, tasks] = await Promise.all([api.employee.stats(), api.employee.listTasks()]);

    document.getElementById('emp-stats').innerHTML = [
      statCard('fa-list-check',   stats.my_tasks, 'My Tasks',  'blue'),
      statCard('fa-circle-check', stats.done,     'Completed', 'green'),
      statCard('fa-clock',        stats.overdue,  'Overdue',   'red'),
    ].join('');

    const projectMap = new Map();
    tasks.forEach(t => {
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

    document.getElementById('emp-tasks').innerHTML = tasks.length
      ? tasks.slice(0, 5).map(t => `
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
      : emptyState('fa-inbox', 'No tasks yet', 'Your manager will assign tasks to you');

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
      <div id="emp-list-filters" class="hidden bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <select id="emp-filter-priority" class="input w-auto text-sm" onchange="filterEmpTasks()">
          <option value="">All Priorities</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🟢 Low</option>
        </select>
        <select id="emp-filter-stage" class="input w-auto text-sm" onchange="filterEmpTasks()">
          <option value="">All Stages</option>
        </select>
        <input id="emp-search" type="text" class="input text-sm flex-1 min-w-40"
               placeholder="Search tasks…" oninput="filterEmpTasks()" />
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

// ─── Filter / route to view ───────────────────────────────────────────────────
function filterEmpTasks() {
  const all = window._empTasksAll || [];

  let list = all.filter(t => {
    if (_empSelectedProject != null && t.workflow_id != _empSelectedProject) return false;
    if (_empViewMode === 'list') {
      const prio  = document.getElementById('emp-filter-priority')?.value || '';
      const stage = document.getElementById('emp-filter-stage')?.value    || '';
      const q     = (document.getElementById('emp-search')?.value || '').toLowerCase();
      if (prio  && t.priority !== prio)                     return false;
      if (stage && (t.stage_name || '') !== stage)          return false;
      if (q     && !t.title.toLowerCase().includes(q))      return false;
    }
    return true;
  });

  _empViewMode === 'board' ? _renderEmpBoard(list) : _renderEmpList(list);
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

function _empTaskCard(t) {
  const locked = ['Done', 'Closed'].includes(t.stage_name);
  const od     = isOverdue(t.due_date) && !locked;
  const drag   = locked ? '' : `draggable="true" ondragstart="empDragStart(event,${t.id})" ondragend="empDragEnd(event)"`;

  return `
    <div class="task-card select-none ${locked ? 'cursor-default opacity-70' : ''}"
         ${drag}
         data-task-id="${t.id}"
         onclick="navigate('employee-task-detail',{id:${t.id}})">
      <div class="flex items-start gap-2 mb-1.5">
        <div class="text-sm font-medium text-gray-800 line-clamp-2 flex-1">${t.title}</div>
        ${locked ? '<i class="fa-solid fa-lock text-green-400 text-xs flex-shrink-0 mt-0.5"></i>' : ''}
      </div>
      <div class="flex items-center gap-1.5 mb-2">${priorityBadge(t.priority)}</div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-400 truncate max-w-[130px]">${t.assignee_name || 'Unassigned'}</span>
        ${t.due_date ? `<span class="${od ? 'text-red-500 font-medium' : 'text-gray-400'}">${formatDate(t.due_date)}</span>` : ''}
      </div>
      ${t.subtask_count > 0 ? `<div class="mt-1.5 text-xs text-gray-400"><i class="fa-solid fa-bars-staggered mr-1"></i>${t.subtask_count}</div>` : ''}
    </div>`;
}

// ─── List view ────────────────────────────────────────────────────────────────
function _renderEmpList(tasks) {
  const viewEl = document.getElementById('emp-tasks-view');
  if (!viewEl) return;

  if (!tasks.length) {
    viewEl.innerHTML = emptyState('fa-inbox', 'No tasks found', 'Try selecting a different project or clearing the filters');
    return;
  }

  viewEl.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
      ${tableWrapper(
        ['Task', 'Project', 'Stage', 'Priority', 'Due Date', 'Sub'],
        tasks.map(t => {
          const od = isOverdue(t.due_date) && !['Done','Closed'].includes(t.stage_name);
          return `
            <tr class="${od ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'} cursor-pointer transition-colors"
                onclick="navigate('employee-task-detail',{id:${t.id}})">
              <td class="px-4 py-3 font-medium text-sm text-gray-900">${t.title}</td>
              <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${t.workflow_name || '—'}</td>
              <td class="px-4 py-3">${stageBadge(t.stage_name, t.stage_color)}</td>
              <td class="px-4 py-3">${priorityBadge(t.priority)}</td>
              <td class="px-4 py-3 text-sm whitespace-nowrap ${od ? 'text-red-600 font-medium' : 'text-gray-500'}">
                ${formatDate(t.due_date)}
              </td>
              <td class="px-4 py-3 text-center text-sm text-gray-400">
                ${+t.subtask_count > 0
                  ? `<span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">${t.subtask_count}</span>`
                  : '—'}
              </td>
            </tr>`;
        })
      )}
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

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">New Task</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form id="emp-task-form" onsubmit="submitEmpCreateTask(event)" class="p-6 space-y-4">
          <div><label class="label">Title *</label><input name="title" class="input" required /></div>
          <div><label class="label">Description</label><textarea name="description" class="input" rows="3"></textarea></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label">Priority</label>
              <select name="priority" class="input">
                <option value="high">🔴 High</option>
                <option value="medium" selected>🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div><label class="label">Due Date</label>
              <input name="due_date" type="date" class="input" />
            </div>
            <div><label class="label">Project *</label>
              <select name="workflow_id" class="input" id="emp-workflow-sel"
                      onchange="empLoadStages(this.value)" required>
                <option value="">Select a project</option>${wfOptions}
              </select>
            </div>
            <div><label class="label">Stage</label>
              <select name="stage_id" class="input" id="emp-stage-sel">
                <option value="">No stage</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Attachments <span class="text-gray-400 font-normal text-xs">(optional)</span></label>
            <label class="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50 transition-all">
              <i class="fa-solid fa-paperclip text-gray-400 text-sm"></i>
              <span id="modal-attach-label" class="text-sm text-gray-400 flex-1">Choose files…</span>
              <input type="file" id="modal-attach-files" multiple class="hidden"
                     onchange="updateAttachLabel(this,'modal-attach-label')" />
            </label>
          </div>
          <div id="emp-task-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Create Task</button>
          </div>
        </form>
      </div>
    </div>`);

  window._empWorkflows = workflows;

  if (_empSelectedProject) {
    const sel = document.getElementById('emp-workflow-sel');
    if (sel) { sel.value = _empSelectedProject; empLoadStages(_empSelectedProject); }
  }
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

async function submitEmpCreateTask(e) {
  e.preventDefault();
  const data  = Object.fromEntries(new FormData(e.target).entries());
  const errEl = document.getElementById('emp-task-error');
  errEl.classList.add('hidden');
  const fileInput = document.getElementById('modal-attach-files');
  try {
    const task = await api.employee.createTask(data);
    closeModal();
    await uploadFilesAfterCreate(task.id, fileInput, (id, fd) => api.employee.uploadAttachment(id, fd));
    showToast('Task created!');
    navigate('employee-task-detail', { id: task.id });
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}
