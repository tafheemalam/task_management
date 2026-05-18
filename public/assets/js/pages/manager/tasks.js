let _allTasks = [], _allWorkflows = [], _allCompanyUsers = [];
let _viewMode = 'board'; // 'board' | 'list'
let _filterWf = '', _filterPriority = '', _filterAssignee = '';
let _dragTaskId = null;
let _mgrSortField = 'due_date';
let _mgrSortDir   = 'asc';
let _mgrPage = 1;
let _mgrPerPage = 50;
let _mgrTotal = 0;
let _mgrPages = 1;

async function renderManagerTasks() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Tasks', 'Manage all company tasks', `
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-xs" onclick="setView('board')" id="btn-board"><i class="fa-solid fa-table-columns"></i> Board</button>
          <button class="btn-secondary text-xs" onclick="setView('list')" id="btn-list"><i class="fa-solid fa-list"></i> List</button>
          <button class="btn-secondary text-xs" onclick="navigate('manager-gantt')"><i class="fa-solid fa-chart-gantt"></i> Gantt</button>
          <div class="relative" id="export-menu-wrapper">
            <button class="btn-secondary text-xs" onclick="toggleExportMenu()">
              <i class="fa-solid fa-download"></i> Export <i class="fa-solid fa-chevron-down text-[10px] ml-0.5"></i>
            </button>
            <div id="export-menu" class="hidden absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 min-w-36">
              <button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onclick="toggleExportMenu();exportTasksToCSV(_allTasks,'tasks.csv')">
                <i class="fa-solid fa-file-csv text-green-600 w-4"></i> CSV
              </button>
              <button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onclick="toggleExportMenu();exportTasksToPDF(_allTasks,'Task Report')">
                <i class="fa-solid fa-file-pdf text-red-500 w-4"></i> PDF
              </button>
            </div>
          </div>
          <button class="btn-primary" onclick="openCreateTaskModal()"><i class="fa-solid fa-plus"></i> New Task</button>
        </div>`)}
      <div class="rounded-2xl p-4 mb-4" style="background:linear-gradient(135deg,#eef2ff 0%,#f8fafc 100%);border:1px solid #e0e7ff">
        <div class="grid grid-cols-2 gap-3">
          <!-- Search -->
          <div class="col-span-2 flex items-center gap-2.5 bg-white rounded-xl px-3.5 py-2.5"
               style="border:1px solid #e0e7ff;box-shadow:0 1px 3px rgba(99,102,241,0.08)"
               onfocusin="this.style.boxShadow='0 0 0 3px rgba(99,102,241,0.15),0 1px 3px rgba(99,102,241,0.08)'"
               onfocusout="this.style.boxShadow='0 1px 3px rgba(99,102,241,0.08)'">
            <i class="fa-solid fa-magnifying-glass text-sm shrink-0" style="color:#6366f1"></i>
            <input id="filter-search" type="text" class="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
                   placeholder="Search tasks by title…" oninput="resetAndFilter()" />
          </div>
          <!-- Project -->
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider mb-1" style="color:#6366f1">
              <i class="fa-solid fa-diagram-project mr-1"></i> Project
            </label>
            <select id="filter-wf" class="input text-sm" onchange="resetAndFilter()"><option value="">All Projects</option></select>
          </div>
          <!-- Assignee -->
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider mb-1" style="color:#6366f1">
              <i class="fa-solid fa-user mr-1"></i> Assignee
            </label>
            <select id="filter-assignee" class="input text-sm" onchange="resetAndFilter()"><option value="">All Assignees</option></select>
          </div>
          <!-- Priority -->
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider mb-1" style="color:#6366f1">
              <i class="fa-solid fa-flag mr-1"></i> Priority
            </label>
            <select id="filter-priority" class="input text-sm" onchange="resetAndFilter()">
              <option value="">All Priorities</option>
              <option value="high">🔴 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
          </div>
          <!-- Stage -->
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider mb-1" style="color:#6366f1">
              <i class="fa-solid fa-circle-dot mr-1"></i> Stage
            </label>
            <select id="filter-stage" class="input text-sm" onchange="resetAndFilter()">
              <option value="">All Stages</option>
            </select>
          </div>
        </div>
      </div>
      <div id="tasks-view">${skeletonTable(5, 7)}</div>
      <div id="bulk-action-bar" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40
           bg-gray-900 text-white rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4">
        <span id="bulk-count" class="text-sm font-medium"></span>
        <select id="bulk-stage-sel" class="text-sm bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white">
          <option value="">Move to stage…</option>
        </select>
        <button onclick="bulkChangeStage()" class="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors">Apply</button>
        <button onclick="clearBulkSelection()" class="text-sm text-gray-400 hover:text-white px-2">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>`);

  try {
    const [tasksResp, workflows, users] = await Promise.all([
      api.manager.listTasks({ page: 1, per_page: _mgrPerPage }),
      api.manager.listWorkflows(),
      api.manager.listCompanyUsers(),
    ]);
    _allTasks = tasksResp.data ?? tasksResp;
    _mgrTotal = tasksResp.meta?.total ?? _allTasks.length;
    _mgrPages = tasksResp.meta?.pages ?? 1;
    _allWorkflows = workflows;
    _allCompanyUsers = users;
    populateFilters();
    applyFilters();
    setView(_viewMode);
  } catch (err) { showToast(err.message, 'error'); }
}

function populateFilters() {
  const wfSel = document.getElementById('filter-wf');
  _allWorkflows.forEach(w => { const o = document.createElement('option'); o.value = w.id; o.textContent = w.name; wfSel.appendChild(o); });

  const asSel = document.getElementById('filter-assignee');
  _allCompanyUsers.forEach(u => { const o = document.createElement('option'); o.value = u.id; o.textContent = u.name; asSel.appendChild(o); });

  // Build stage list from all workflow stages (not from paginated tasks)
  const stageSel = document.getElementById('filter-stage');
  const seen = new Set();
  _allWorkflows.forEach(wf => {
    (wf.stages || []).forEach(s => {
      if (s.name && !seen.has(s.name)) {
        seen.add(s.name);
        const o = document.createElement('option'); o.value = s.name; o.textContent = s.name; stageSel.appendChild(o);
      }
    });
  });
}

function setView(mode) {
  _viewMode = mode;
  const btnB = document.getElementById('btn-board');
  const btnL = document.getElementById('btn-list');
  if (btnB) btnB.className = mode === 'board' ? 'btn-primary text-xs' : 'btn-secondary text-xs';
  if (btnL) btnL.className = mode === 'list' ? 'btn-primary text-xs' : 'btn-secondary text-xs';
  applyFilters();
}

function resetAndFilter() {
  _mgrPage = 1;
  applyFilters();
}

async function applyFilters() {
  const wf     = document.getElementById('filter-wf')?.value;
  const prio   = document.getElementById('filter-priority')?.value;
  const ass    = document.getElementById('filter-assignee')?.value;
  const stage  = document.getElementById('filter-stage')?.value;
  const search = document.getElementById('filter-search')?.value || '';

  // Build server-side params
  const params = { page: _mgrPage, per_page: _mgrPerPage, sort: _mgrSortField, dir: _mgrSortDir };
  if (wf)     params.workflow_id = wf;
  if (prio)   params.priority    = prio;
  if (ass)    params.assignee_id = ass;
  if (search) params.search      = search;
  // stage filter: convert stage name to stage_id via workflow data
  if (stage) {
    for (const wfObj of _allWorkflows) {
      const found = (wfObj.stages || []).find(s => s.name === stage);
      if (found) { params.stage_id = found.id; break; }
    }
  }

  try {
    const resp = await api.manager.listTasks(params);
    _allTasks  = resp.data ?? resp;
    _mgrTotal  = resp.meta?.total ?? _allTasks.length;
    _mgrPages  = resp.meta?.pages ?? 1;
    _mgrPage   = resp.meta?.page  ?? 1;
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  _viewMode === 'board' ? renderBoard(_allTasks) : renderList(_allTasks);
  renderMgrPagination();
}

function renderBoard(tasks) {
  // Group by workflow's stages
  const wfId = document.getElementById('filter-wf')?.value;
  let workflow = wfId ? _allWorkflows.find(w => w.id == wfId) : _allWorkflows[0];

  if (!workflow || !workflow.stages?.length) {
    // No workflow — show ungrouped
    document.getElementById('tasks-view').innerHTML = `
      <div class="grid gap-4">
        ${tasks.length ? tasks.map(t => taskCard(t)).join('') : emptyState('fa-list-check', 'No tasks found')}
      </div>`;
    return;
  }

  const stages = workflow.stages.sort((a, b) => a.order_index - b.order_index);
  const tasksByStage = {};
  stages.forEach(s => tasksByStage[s.id] = []);
  tasksByStage['none'] = [];
  tasks.forEach(t => {
    const sid = t.stage_id || 'none';
    if (tasksByStage[sid]) tasksByStage[sid].push(t);
    else tasksByStage['none'].push(t);
  });

  document.getElementById('tasks-view').innerHTML = `
    <div class="flex gap-4 overflow-x-auto pb-4">
      ${stages.map(s => `
        <div class="kanban-col flex-shrink-0 w-72 bg-gray-50 rounded-xl border border-gray-200 flex flex-col"
          data-stage-id="${s.id}"
          ondragover="handleDragOver(event, this)"
          ondragleave="handleDragLeave(this)"
          ondrop="handleDrop(event, ${s.id})">
          <div class="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
            <div class="w-3 h-3 rounded-full shrink-0" style="background:${s.color}"></div>
            <span class="text-sm font-semibold text-gray-700">${s.name}</span>
            <span class="ml-auto text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">${(tasksByStage[s.id] || []).length}</span>
          </div>
          <div class="flex-1 p-2 space-y-2 min-h-[120px]">
            ${(tasksByStage[s.id] || []).map(t => taskCard(t)).join('')}
            ${!tasksByStage[s.id]?.length
              ? emptyColumnState()
              : ''}
          </div>
        </div>`).join('')}
      ${tasksByStage['none'].length ? `
        <div class="kanban-col flex-shrink-0 w-72 bg-gray-50 rounded-xl border border-gray-200 flex flex-col"
          data-stage-id="none"
          ondragover="handleDragOver(event, this)"
          ondragleave="handleDragLeave(this)"
          ondrop="handleDrop(event, null)">
          <div class="flex items-center gap-2 px-3 pt-3 pb-2">
            <div class="w-3 h-3 rounded-full bg-gray-300 shrink-0"></div>
            <span class="text-sm font-semibold text-gray-500">No Stage</span>
            <span class="ml-auto text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">${tasksByStage['none'].length}</span>
          </div>
          <div class="flex-1 p-2 space-y-2 min-h-[120px]">
            ${tasksByStage['none'].map(t => taskCard(t)).join('')}
          </div>
        </div>` : ''}
    </div>`;
}

function setMgrSort(field) {
  if (_mgrSortField === field) {
    _mgrSortDir = _mgrSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _mgrSortField = field;
    _mgrSortDir   = 'asc';
  }
  _mgrPage = 1;
  applyFilters();
}

function _mgrSortTh(label, field) {
  const active = _mgrSortField === field;
  const icon   = active ? (_mgrSortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
  return `<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider
                      cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap group"
               onclick="setMgrSort('${field}')">
    <span class="flex items-center gap-1.5">
      ${label}
      <i class="fa-solid ${icon} text-[10px] ${active ? 'text-blue-500' : 'text-gray-300 group-hover:text-gray-400'}"></i>
    </span>
  </th>`;
}

function renderList(tasks) {
  const viewEl = document.getElementById('tasks-view');

  if (!tasks.length) {
    viewEl.innerHTML = emptyState('fa-list-check', 'No tasks found', 'Try adjusting your filters or create a new task', `<button class="btn-primary" onclick="openCreateTaskModal()"><i class="fa-solid fa-plus"></i> New Task</button>`);
    return;
  }

  // Sorting is handled server-side; render tasks as received
  const sorted = tasks;

  viewEl.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div style="overflow-y:auto; max-height:calc(100vh - 240px); border-radius:12px;">
        <table class="w-full">
          <thead style="position:sticky;top:0;z-index:10;background:#f8fafc;" class="border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 w-10 text-left">
                <input type="checkbox" class="w-4 h-4 rounded accent-blue-600" onchange="bulkSelectAll(this.checked)" />
              </th>
              ${_mgrSortTh('Task', 'title')}
              ${_mgrSortTh('Priority', 'priority')}
              ${_mgrSortTh('Stage', 'stage_name')}
              ${_mgrSortTh('Assignee', 'assignee_name')}
              ${_mgrSortTh('Due Date', 'due_date')}
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Subtasks</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${sorted.map(t => {
              const od = isOverdue(t.due_date) && !['Done','Closed'].includes(t.stage_name);
              return `
                <tr class="${od ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'} cursor-pointer transition-colors"
                    onclick="navigate('manager-task-detail',{id:${t.id}})">
                  <td class="px-4 py-3 w-10" onclick="event.stopPropagation()">
                    <input type="checkbox" class="task-bulk-cb w-4 h-4 rounded accent-blue-600" value="${t.id}"
                           onchange="updateBulkBar()" />
                  </td>
                  <td class="px-4 py-3 max-w-xs">
                    <div class="font-medium text-gray-900 truncate">${t.title}</div>
                    <div class="text-xs text-gray-400 mt-0.5">${t.workflow_name || '—'}</div>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">${priorityBadge(t.priority)}</td>
                  <td class="px-4 py-3 whitespace-nowrap">${stageBadge(t.stage_name, t.stage_color)}</td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    ${t.assignee_name
                      ? `<div class="flex items-center gap-2">
                           <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">${avatarInitials(t.assignee_name)}</div>
                           <span class="text-sm text-gray-700">${t.assignee_name}</span>
                         </div>`
                      : '<span class="text-sm text-gray-400">Unassigned</span>'}
                  </td>
                  <td class="px-4 py-3 text-sm whitespace-nowrap ${od ? 'text-red-600 font-medium' : 'text-gray-600'}">
                    ${formatDate(t.due_date)}
                  </td>
                  <td class="px-4 py-3 text-center">
                    ${+t.subtask_count > 0
                      ? `<span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">${t.subtask_count}</span>`
                      : '<span class="text-gray-300 text-xs">—</span>'}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap" onclick="event.stopPropagation()">
                    <div class="flex items-center gap-3">
                      <button class="text-xs font-medium text-blue-600 hover:underline"
                              onclick="navigate('manager-task-detail',{id:${t.id}})">View</button>
                      <button class="text-xs font-medium text-red-500 hover:underline"
                              onclick="deleteTask(${t.id})">Delete</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

const _CARD_PALETTE = [
  '#f97316', // orange
  '#6366f1', // indigo
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
];

function taskCard(t) {
  const accent = _CARD_PALETTE[t.id % _CARD_PALETTE.length];
  const od = isOverdue(t.due_date) && !['Done','Closed'].includes(t.stage_name);

  return `
    <div class="task-card select-none group"
         style="border-left:4px solid ${accent}"
         draggable="true"
         data-task-id="${t.id}"
         ondragstart="startDrag(event, ${t.id})"
         ondragend="endDrag(event)"
         onclick="navigate('manager-task-detail',{id:${t.id}})">

      <!-- Title -->
      <div class="text-sm font-semibold text-gray-800 line-clamp-2 mb-1.5 pr-1">${t.title}</div>

      <!-- Project pill -->
      ${t.workflow_name ? `
        <div class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full mb-2"
             style="background:#eef2ff;color:#6366f1">
          <i class="fa-solid fa-diagram-project text-[9px]"></i> ${t.workflow_name}
        </div>` : ''}

      <!-- Badges -->
      <div class="flex items-center gap-1.5 flex-wrap mb-2.5">
        ${priorityBadge(t.priority)}
        ${stageBadge(t.stage_name, t.stage_color)}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between pt-2" style="border-top:1px solid #f1f5f9">
        ${t.assignee_name
          ? `<div class="flex items-center gap-1.5">
               <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
                 ${avatarInitials(t.assignee_name)}
               </div>
               <span class="text-xs text-gray-600 truncate max-w-[90px]">${t.assignee_name}</span>
             </div>`
          : '<span class="text-xs text-gray-400 italic">Unassigned</span>'}
        ${t.due_date
          ? `<span class="text-[11px] font-medium ${od ? 'text-red-500' : 'text-gray-400'}">
               ${od ? '<i class="fa-solid fa-clock mr-0.5"></i>' : ''}${formatDate(t.due_date)}
             </span>`
          : ''}
      </div>

      ${t.subtask_count > 0
        ? `<div class="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
             <i class="fa-solid fa-bars-staggered"></i>
             ${t.subtask_count} subtask${t.subtask_count > 1 ? 's' : ''}
           </div>`
        : ''}
    </div>`;
}

function taskFormFields(t = {}, workflows, users) {
  const wfOptions = workflows.map(w => `<option value="${w.id}" ${t.workflow_id == w.id ? 'selected' : ''}>${w.name}</option>`).join('');
  const userOptions = users.map(u => `<option value="${u.id}" ${t.assignee_id == u.id ? 'selected' : ''}>${u.name}</option>`).join('');
  return `
    <div><label class="label">Task Title <span class="text-red-500">*</span></label><input name="title" class="input" value="${t.title || ''}" required /></div>
    <div><label class="label">Description</label><textarea name="description" class="input" rows="3">${t.description || ''}</textarea></div>
    <div class="grid grid-cols-2 gap-4">
      <div><label class="label">Priority</label>
        <select name="priority" class="input">
          <option value="high" ${t.priority === 'high' ? 'selected' : ''}>🔴 High</option>
          <option value="medium" ${(!t.priority || t.priority === 'medium') ? 'selected' : ''}>🟡 Medium</option>
          <option value="low" ${t.priority === 'low' ? 'selected' : ''}>🟢 Low</option>
        </select>
      </div>
      <div><label class="label">Assignee</label>
        <select name="assignee_id" class="input"><option value="">Unassigned</option>${userOptions}</select>
      </div>
      <div><label class="label">Project <span class="text-red-500">*</span></label>
        <select name="workflow_id" class="input" id="task-workflow-sel" onchange="loadStagesForTask(this.value,'${t.stage_id || ''}')" required>
          <option value="">Select a project</option>${wfOptions}
        </select>
      </div>
      <div><label class="label">Stage</label>
        <select name="stage_id" class="input" id="task-stage-sel"><option value="">No stage</option></select>
      </div>
      <div><label class="label">Start Date</label><input name="start_date" type="date" class="input" value="${t.start_date || ''}" /></div>
      <div><label class="label">Due Date <span class="text-red-500">*</span></label><input name="due_date" type="date" class="input" value="${t.due_date || ''}" required /></div>
      <div><label class="label">Recurrence</label>
        <select name="recurrence_rule" class="input" id="task-recurrence" onchange="document.getElementById('recurrence-end-wrap').style.display=this.value!=='none'?'':'none'">
          <option value="none" ${(!t.recurrence_rule || t.recurrence_rule === 'none') ? 'selected' : ''}>Does not repeat</option>
          <option value="daily"   ${t.recurrence_rule === 'daily'   ? 'selected' : ''}>Daily</option>
          <option value="weekly"  ${t.recurrence_rule === 'weekly'  ? 'selected' : ''}>Weekly</option>
          <option value="monthly" ${t.recurrence_rule === 'monthly' ? 'selected' : ''}>Monthly</option>
        </select>
      </div>
      <div id="recurrence-end-wrap" style="display:${t.recurrence_rule && t.recurrence_rule !== 'none' ? '' : 'none'}">
        <label class="label">Recurrence End Date (optional)</label>
        <input name="recurrence_end_date" type="date" class="input" value="${t.recurrence_end_date || ''}" />
      </div>
    </div>`;
}

function loadStagesForTask(wfId, selectedStageId = '') {
  const wf = _allWorkflows.find(w => w.id == wfId);
  const sel = document.getElementById('task-stage-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">No stage</option>';
  if (wf?.stages) {
    wf.stages.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name;
      if (s.id == selectedStageId) o.selected = true;
      sel.appendChild(o);
    });
  }
  // Load custom fields for this workflow
  if (wfId) {
    loadTaskFormCustomFields(wfId);
  } else {
    const cfArea = document.getElementById('task-custom-fields-area');
    if (cfArea) cfArea.innerHTML = '';
  }
}

async function loadTaskFormCustomFields(wfId) {
  const cfArea = document.getElementById('task-custom-fields-area');
  if (!cfArea) return;
  try {
    const fields = await api.manager.listCustomFields(wfId);
    if (!fields.length) { cfArea.innerHTML = ''; return; }
    cfArea.innerHTML = `
      <div class="border-t border-gray-100 pt-4 mt-2">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          <i class="fa-solid fa-sliders mr-1"></i> Custom Fields
        </p>
        ${fields.map(f => `
          <div class="mb-3">
            <label class="label">${taskEscHtml(f.name)}${f.is_required ? ' <span class="text-red-400">*</span>' : ''}</label>
            ${taskRenderCfInput(f)}
          </div>`).join('')}
      </div>`;
  } catch (_) {
    cfArea.innerHTML = '';
  }
}

function taskRenderCfInput(f) {
  switch (f.field_type) {
    case 'number':   return `<input type="number" name="cf_${f.id}" class="input" />`;
    case 'date':     return `<input type="date" name="cf_${f.id}" class="input" />`;
    case 'checkbox': return `<label class="flex items-center gap-2"><input type="checkbox" name="cf_${f.id}" value="1" class="rounded" /> <span class="text-sm text-gray-700">Yes</span></label>`;
    case 'select':   return `<select name="cf_${f.id}" class="input"><option value="">— Select —</option>${(f.options||[]).map(o=>`<option value="${taskEscHtml(o)}">${taskEscHtml(o)}</option>`).join('')}</select>`;
    default:         return `<input type="text" name="cf_${f.id}" class="input" />`;
  }
}

function taskEscHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openCreateTaskModal(parentId = null) {
  const wfOptions  = _allWorkflows.map(w => `<option value="${w.id}">${taskEscHtml(w.name)}</option>`).join('');
  const userOptions = _allCompanyUsers.map(u => `<option value="${u.id}">${taskEscHtml(u.name)}</option>`).join('');

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:820px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
              <i class="fa-solid fa-plus text-white text-sm"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-900">${parentId ? 'New Subtask' : 'Create New Task'}</h3>
          </div>
          <button onclick="closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body: 2-column -->
        <form id="task-form" onsubmit="submitCreateTask(event,${parentId || 'null'})" style="flex:1;overflow-y:auto;display:flex;min-height:0">

          <!-- LEFT — content -->
          <div class="flex-1 p-6 space-y-4 overflow-y-auto" style="min-width:0;border-right:1px solid #f1f5f9">
            ${!parentId ? `
            <button type="button" class="btn-secondary w-full justify-center text-sm" onclick="openTemplatePickerForTask()">
              <i class="fa-solid fa-wand-magic-sparkles text-indigo-400"></i> Use Template
            </button>` : ''}

            <div>
              <label class="label">Task Title <span class="text-red-500">*</span></label>
              <input name="title" class="input text-base" placeholder="What needs to be done?" required />
            </div>

            <div>
              <label class="label">Description</label>
              <textarea name="description" class="input" rows="5" placeholder="Add details, steps, or context…"></textarea>
            </div>

            <div id="task-custom-fields-area"></div>

            <div>
              <label class="label" style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Attachments</label>
              <label class="flex items-center gap-2.5 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                <i class="fa-solid fa-paperclip text-gray-400"></i>
                <span id="modal-attach-label" class="text-sm text-gray-400 flex-1">Choose files…</span>
                <input type="file" id="modal-attach-files" multiple class="hidden"
                       onchange="updateAttachLabel(this,'modal-attach-label')" />
              </label>
            </div>

            <div id="task-error" class="hidden p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
              <i class="fa-solid fa-circle-exclamation mr-1.5"></i><span></span>
            </div>
          </div>

          <!-- RIGHT — metadata -->
          <div class="p-5 space-y-4 overflow-y-auto shrink-0" style="width:216px;background:#f8fafc">

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-diagram-project mr-1 text-indigo-400"></i> Project <span class="text-red-500">*</span>
              </label>
              <select name="workflow_id" class="input text-sm" id="task-workflow-sel"
                      onchange="loadStagesForTask(this.value,'')" required>
                <option value="">Select project…</option>${wfOptions}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-circle-dot mr-1 text-blue-400"></i> Stage
              </label>
              <select name="stage_id" class="input text-sm" id="task-stage-sel">
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
                <i class="fa-solid fa-user mr-1 text-green-400"></i> Assignee
              </label>
              <select name="assignee_id" class="input text-sm">
                <option value="">Unassigned</option>${userOptions}
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

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                <i class="fa-solid fa-rotate mr-1 text-purple-400"></i> Recurrence
              </label>
              <select name="recurrence_rule" class="input text-sm" id="task-recurrence"
                      onchange="document.getElementById('recurrence-end-wrap').style.display=this.value!=='none'?'block':'none'">
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div id="recurrence-end-wrap" style="display:none">
              <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">End Date</label>
              <input name="recurrence_end_date" type="date" class="input text-sm" />
            </div>

            ${parentId ? `<input type="hidden" name="parent_task_id" value="${parentId}" />` : ''}
          </div>
        </form>

        <!-- Footer -->
        <div class="px-6 py-3.5 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-white">
          <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" form="task-form" class="btn-primary">
            <i class="fa-solid fa-plus"></i> Create Task
          </button>
        </div>

      </div>
    </div>`);

  window._pendingChecklist = []; // reset on new modal open

  const wfSel = document.getElementById('task-workflow-sel');
  if (wfSel?.value) loadStagesForTask(wfSel.value);

  const titleInput  = document.querySelector('#task-form [name="title"]');
  const dueDateInput = document.querySelector('#task-form [name="due_date"]');
  if (titleInput)   setupFieldValidation(titleInput,   [_validators.required]);
  if (dueDateInput) setupFieldValidation(dueDateInput, [_validators.required]);
}

async function submitCreateTask(e, parentId) {
  e.preventDefault();

  // Validate required fields
  const titleInput = document.querySelector('#task-form [name="title"]');
  const dueDateInput = document.querySelector('#task-form [name="due_date"]');
  const valid = validateForm([
    ...(titleInput ? [{input: titleInput, rules: [_validators.required]}] : []),
    ...(dueDateInput ? [{input: dueDateInput, rules: [_validators.required]}] : []),
  ]);
  if (!valid) return;

  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (!data.assignee_id) delete data.assignee_id;
  if (!data.workflow_id) delete data.workflow_id;
  if (!data.stage_id) delete data.stage_id;
  if (parentId) data.parent_task_id = parentId;
  const errEl = document.getElementById('task-error');
  errEl.classList.add('hidden');
  const fileInput = document.getElementById('modal-attach-files');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) setButtonLoading(submitBtn, true);
  try {
    const resp = await api.manager.createTask(data);
    const taskId = resp.data?.id || resp.id;
    closeModal();
    await uploadFilesAfterCreate(taskId, fileInput, (id, fd) => api.manager.uploadAttachment(id, fd));

    // Create checklist items from template
    if (window._pendingChecklist?.length) {
      await Promise.all(
        window._pendingChecklist.map((title, i) =>
          api.manager.createSubtask(taskId, { title, sort_order: i })
        )
      );
      window._pendingChecklist = [];
    }

    showToast('Task created!');
    if (parentId) {
      navigate('manager-task-detail', { id: parentId });
    } else {
      navigate('manager-task-detail', { id: taskId });
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    if (submitBtn) setButtonLoading(submitBtn, false);
  }
}

function deleteTask(id) {
  showConfirm({
    title: 'Delete task?',
    message: 'This action cannot be undone.',
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteTask(id);
        showToast('Task deleted!');
        applyFilters();
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}

// ── Pagination ────────────────────────────────────────────────────────────────

function renderMgrPagination() {
  const existing = document.getElementById('mgr-pagination');
  if (existing) existing.remove();
  if (_mgrPages <= 1) return;

  const bar = document.createElement('div');
  bar.id = 'mgr-pagination';
  bar.className = 'flex items-center justify-between mt-4 px-1';
  bar.innerHTML = `
    <p class="text-sm text-gray-500">
      Showing ${((_mgrPage-1)*_mgrPerPage)+1}–${Math.min(_mgrPage*_mgrPerPage,_mgrTotal)} of <strong>${_mgrTotal}</strong> tasks
    </p>
    <div class="flex items-center gap-1">
      <button onclick="goMgrPage(${_mgrPage-1})" ${_mgrPage<=1?'disabled':''} class="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      ${Array.from({length: Math.min(_mgrPages,7)}, (_,i) => {
        const p = _mgrPages <= 7 ? i+1 : (
          _mgrPage <= 4 ? i+1 :
          _mgrPage >= _mgrPages-3 ? _mgrPages-6+i :
          _mgrPage-3+i
        );
        return `<button onclick="goMgrPage(${p})" class="${p===_mgrPage?'btn-primary':'btn-secondary'} text-xs px-3 py-1.5">${p}</button>`;
      }).join('')}
      <button onclick="goMgrPage(${_mgrPage+1})" ${_mgrPage>=_mgrPages?'disabled':''} class="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>`;

  const tasksView = document.getElementById('tasks-view');
  tasksView?.parentNode?.insertBefore(bar, tasksView.nextSibling);
}

function goMgrPage(page) {
  if (page < 1 || page > _mgrPages) return;
  _mgrPage = page;
  applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

function startDrag(event, taskId) {
  _dragTaskId = taskId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', taskId);
  // Dim the card being dragged
  setTimeout(() => {
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) el.style.opacity = '0.4';
  }, 0);
}

function endDrag(event) {
  // Restore opacity on all cards
  document.querySelectorAll('[data-task-id]').forEach(el => el.style.opacity = '');
  // Clear all column highlights
  document.querySelectorAll('[data-stage-id]').forEach(col => {
    col.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');
  });
}

function handleDragOver(event, col) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  col.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50');
}

function handleDragLeave(col) {
  col.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');
}

async function handleDrop(event, stageId) {
  event.preventDefault();
  const col = event.currentTarget;
  col.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');

  const taskId = _dragTaskId;
  _dragTaskId  = null;
  if (!taskId) return;

  const idx = _allTasks.findIndex(t => t.id == taskId);
  if (idx < 0) return;

  const task        = _allTasks[idx];
  const prevStageId = task.stage_id;
  if (prevStageId == stageId) return; // no change

  // Optimistic update so board re-renders immediately
  _allTasks[idx] = { ...task, stage_id: stageId ?? null };
  applyFilters();

  try {
    await api.manager.updateTask(taskId, { ...task, stage_id: stageId ?? null });
    showToast('Task moved');
  } catch (err) {
    // Roll back on failure
    _allTasks[idx] = { ...task, stage_id: prevStageId };
    applyFilters();
    showToast(err.message, 'error');
  }
}

// ── Bulk Actions ──────────────────────────────────────────────────────────────

function updateBulkBar() {
  const checked = document.querySelectorAll('.task-bulk-cb:checked');
  const bar = document.getElementById('bulk-action-bar');
  const count = document.getElementById('bulk-count');
  if (!bar) return;
  if (checked.length > 0) {
    bar.classList.remove('hidden');
    count.textContent = `${checked.length} task${checked.length > 1 ? 's' : ''} selected`;
    // Populate stages from first workflow
    const stageSel = document.getElementById('bulk-stage-sel');
    if (stageSel && stageSel.options.length <= 1 && _allWorkflows.length) {
      const stages = _allWorkflows[0].stages || [];
      stages.forEach(s => {
        const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; stageSel.appendChild(o);
      });
    }
  } else {
    bar.classList.add('hidden');
  }
}

function bulkSelectAll(checked) {
  document.querySelectorAll('.task-bulk-cb').forEach(cb => { cb.checked = checked; });
  updateBulkBar();
}

function clearBulkSelection() {
  document.querySelectorAll('.task-bulk-cb').forEach(cb => { cb.checked = false; });
  const bar = document.getElementById('bulk-action-bar');
  if (bar) bar.classList.add('hidden');
}

function toggleExportMenu() {
  const m = document.getElementById('export-menu');
  if (m) m.classList.toggle('hidden');
  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('click', () => document.getElementById('export-menu')?.classList.add('hidden'), { once: true });
  }, 0);
}

async function openTemplatePickerForTask() {
  let templates = [];
  try {
    const result = await api.manager.listTaskTemplates();
    templates = result.data || [];
  } catch (err) { showToast(err.message, 'error'); return; }

  if (!templates.length) { showToast('No task templates yet. Create one from Templates page.', 'info'); return; }

  window._taskTemplates = templates;

  // Render as a floating panel inside the modal — does NOT replace the modal
  const existing = document.getElementById('template-picker-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'template-picker-panel';
  panel.style.cssText = 'position:absolute;top:56px;left:16px;right:16px;z-index:9999;background:#fff;border:1px solid #e0e7ff;border-radius:14px;box-shadow:0 8px 32px rgba(99,102,241,0.18);max-height:320px;overflow-y:auto';
  panel.innerHTML = `
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
      <span class="text-sm font-semibold text-gray-800"><i class="fa-solid fa-wand-magic-sparkles text-indigo-500 mr-2"></i>Choose a Template</span>
      <button onclick="document.getElementById('template-picker-panel').remove()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="p-3 space-y-1.5">
      ${templates.map(t => `
        <div onclick="applyTaskTemplate(${t.id})"
             class="p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
          <div class="font-medium text-gray-800 text-sm">${taskEscHtml(t.name)}</div>
          <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
            ${priorityBadge(t.priority)}
            ${t.checklist ? `<span><i class="fa-solid fa-check-square mr-0.5"></i>${JSON.parse(t.checklist||'[]').length} items</span>` : ''}
            ${t.estimated_minutes ? `<span><i class="fa-solid fa-clock mr-0.5"></i>${Math.round(t.estimated_minutes/60*10)/10}h</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`;

  // Attach to the modal-box so it's positioned relative to it
  const modalBox = document.querySelector('.modal-box');
  if (modalBox) { modalBox.style.position = 'relative'; modalBox.appendChild(panel); }
}

function applyTaskTemplate(templateId) {
  const tpl = (window._taskTemplates || []).find(t => t.id == templateId);
  if (!tpl) return;

  document.getElementById('template-picker-panel')?.remove();

  const form = document.getElementById('task-form');
  if (!form) return;

  const titleEl = form.querySelector('[name=title]');
  const descEl  = form.querySelector('[name=description]');
  const prioEl  = form.querySelector('[name=priority]');
  if (titleEl) titleEl.value = tpl.title_template || '';
  if (descEl)  descEl.value  = tpl.description    || '';
  if (prioEl)  prioEl.value  = tpl.priority        || 'medium';

  // Store checklist for creation after task is saved
  const checklist = JSON.parse(tpl.checklist || '[]');
  window._pendingChecklist = checklist;

  // Show preview in the form
  if (checklist.length) {
    const cfArea = document.getElementById('task-custom-fields-area');
    if (cfArea) {
      cfArea.querySelector('#tpl-checklist-preview')?.remove();
      const preview = document.createElement('div');
      preview.id = 'tpl-checklist-preview';
      preview.className = 'p-3 bg-indigo-50 rounded-xl border border-indigo-100';
      preview.innerHTML = `<p class="text-xs font-semibold text-indigo-600 mb-2"><i class="fa-solid fa-list-check mr-1"></i> ${checklist.length} checklist item${checklist.length > 1 ? 's' : ''} will be added</p>` +
        checklist.map(item => `<p class="text-xs text-gray-600 flex items-center gap-1.5 mb-1"><i class="fa-regular fa-square text-gray-400"></i>${taskEscHtml(item)}</p>`).join('');
      cfArea.prepend(preview);
    }
  }

  showToast('Template applied!', 'success');
}

async function bulkChangeStage() {
  const stageId = document.getElementById('bulk-stage-sel')?.value;
  if (!stageId) { showToast('Please select a stage', 'error'); return; }
  const ids = Array.from(document.querySelectorAll('.task-bulk-cb:checked')).map(cb => +cb.value);
  if (!ids.length) return;
  try {
    await Promise.all(ids.map(id => {
      const t = _allTasks.find(x => x.id === id);
      return t ? api.manager.updateTask(id, { ...t, stage_id: +stageId }) : Promise.resolve();
    }));
    ids.forEach(id => {
      const idx = _allTasks.findIndex(t => t.id === id);
      if (idx >= 0) _allTasks[idx].stage_id = +stageId;
    });
    showToast(`${ids.length} task${ids.length > 1 ? 's' : ''} moved`);
    clearBulkSelection();
    applyFilters();
  } catch(err) { showToast(err.message, 'error'); }
}
