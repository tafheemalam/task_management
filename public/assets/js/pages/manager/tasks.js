let _allTasks = [], _allWorkflows = [], _allCompanyUsers = [];
let _viewMode = 'board'; // 'board' | 'list'
let _filterWf = '', _filterPriority = '', _filterAssignee = '';
let _dragTaskId = null;
let _mgrSortField = 'due_date';
let _mgrSortDir   = 'asc';

async function renderManagerTasks() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Tasks', 'Manage all company tasks', `
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-xs" onclick="setView('board')" id="btn-board"><i class="fa-solid fa-table-columns"></i> Board</button>
          <button class="btn-secondary text-xs" onclick="setView('list')" id="btn-list"><i class="fa-solid fa-list"></i> List</button>
          <button class="btn-secondary text-xs" onclick="navigate('manager-gantt')"><i class="fa-solid fa-chart-gantt"></i> Gantt</button>
          <button class="btn-secondary text-xs" onclick="exportTasksToCSV(_allTasks, 'tasks.csv')"><i class="fa-solid fa-download"></i> CSV</button>
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
                   placeholder="Search tasks by title…" oninput="applyFilters()" />
          </div>
          <!-- Project -->
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider mb-1" style="color:#6366f1">
              <i class="fa-solid fa-diagram-project mr-1"></i> Project
            </label>
            <select id="filter-wf" class="input text-sm" onchange="applyFilters()"><option value="">All Projects</option></select>
          </div>
          <!-- Assignee -->
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider mb-1" style="color:#6366f1">
              <i class="fa-solid fa-user mr-1"></i> Assignee
            </label>
            <select id="filter-assignee" class="input text-sm" onchange="applyFilters()"><option value="">All Assignees</option></select>
          </div>
          <!-- Priority -->
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider mb-1" style="color:#6366f1">
              <i class="fa-solid fa-flag mr-1"></i> Priority
            </label>
            <select id="filter-priority" class="input text-sm" onchange="applyFilters()">
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
            <select id="filter-stage" class="input text-sm" onchange="applyFilters()">
              <option value="">All Stages</option>
            </select>
          </div>
        </div>
      </div>
      <div id="tasks-view">Loading...</div>
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
    [_allTasks, _allWorkflows, _allCompanyUsers] = await Promise.all([
      api.manager.listTasks(),
      api.manager.listWorkflows(),
      api.manager.listCompanyUsers(),
    ]);
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

  const stageSel = document.getElementById('filter-stage');
  const seen = new Set();
  _allTasks.forEach(t => {
    if (t.stage_name && !seen.has(t.stage_name)) {
      seen.add(t.stage_name);
      const o = document.createElement('option'); o.value = t.stage_name; o.textContent = t.stage_name; stageSel.appendChild(o);
    }
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

function applyFilters() {
  const wf     = document.getElementById('filter-wf')?.value;
  const prio   = document.getElementById('filter-priority')?.value;
  const ass    = document.getElementById('filter-assignee')?.value;
  const stage  = document.getElementById('filter-stage')?.value;
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  let filtered = _allTasks.filter(t => {
    if (wf     && t.workflow_id != wf)                    return false;
    if (prio   && t.priority !== prio)                    return false;
    if (ass    && t.assignee_id != ass)                   return false;
    if (stage  && (t.stage_name || '') !== stage)         return false;
    if (search && !t.title.toLowerCase().includes(search)) return false;
    return true;
  });
  _viewMode === 'board' ? renderBoard(filtered) : renderList(filtered);
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
              ? `<div class="kanban-drop-hint flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-gray-200 text-xs text-gray-300">Drop here</div>`
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
    viewEl.innerHTML = emptyState('fa-list-check', 'No tasks found', 'Try adjusting your filters');
    return;
  }

  // Sort
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const sorted = [...tasks].sort((a, b) => {
    let av, bv;
    if (_mgrSortField === 'priority') {
      av = priorityRank[a.priority] ?? 1;
      bv = priorityRank[b.priority] ?? 1;
    } else if (_mgrSortField === 'due_date') {
      av = a.due_date || '9999-99-99';
      bv = b.due_date || '9999-99-99';
    } else {
      av = (a[_mgrSortField] || '').toString().toLowerCase();
      bv = (b[_mgrSortField] || '').toString().toLowerCase();
    }
    if (av < bv) return _mgrSortDir === 'asc' ? -1 : 1;
    if (av > bv) return _mgrSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  viewEl.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
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

function taskCard(t) {
  const priorityAccent = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
  const accent = priorityAccent[t.priority] || '#6366f1';
  const od = isOverdue(t.due_date) && !['Done','Closed'].includes(t.stage_name);

  return `
    <div class="task-card select-none group"
         style="border-left:3px solid ${accent}"
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
}

function openCreateTaskModal(parentId = null) {
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">${parentId ? 'New Subtask' : 'New Task'}</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="task-form" onsubmit="submitCreateTask(event,${parentId || 'null'})" class="p-6 space-y-4">
          ${taskFormFields({}, _allWorkflows, _allCompanyUsers)}
          ${parentId ? `<input type="hidden" name="parent_task_id" value="${parentId}" />` : ''}
          <div>
            <label class="label">Attachments <span class="text-gray-400 font-normal text-xs">(optional)</span></label>
            <label class="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50 transition-all">
              <i class="fa-solid fa-paperclip text-gray-400 text-sm"></i>
              <span id="modal-attach-label" class="text-sm text-gray-400 flex-1">Choose files…</span>
              <input type="file" id="modal-attach-files" multiple class="hidden"
                     onchange="updateAttachLabel(this,'modal-attach-label')" />
            </label>
          </div>
          <div id="task-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Create Task</button>
          </div>
        </form>
      </div>
    </div>`);

  // Load stages for any pre-selected workflow
  const wfSel = document.getElementById('task-workflow-sel');
  if (wfSel?.value) loadStagesForTask(wfSel.value);
}

async function submitCreateTask(e, parentId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (!data.assignee_id) delete data.assignee_id;
  if (!data.workflow_id) delete data.workflow_id;
  if (!data.stage_id) delete data.stage_id;
  if (parentId) data.parent_task_id = parentId;
  const errEl = document.getElementById('task-error');
  errEl.classList.add('hidden');
  const fileInput = document.getElementById('modal-attach-files');
  try {
    const task = await api.manager.createTask(data);
    closeModal();
    await uploadFilesAfterCreate(task.id, fileInput, (id, fd) => api.manager.uploadAttachment(id, fd));
    showToast('Task created!');
    if (parentId) {
      navigate('manager-task-detail', { id: parentId });
    } else {
      navigate('manager-task-detail', { id: task.id });
    }
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function deleteTask(id) {
  if (!confirmDialog('Delete this task?')) return;
  try {
    await api.manager.deleteTask(id);
    showToast('Task deleted!');
    _allTasks = _allTasks.filter(t => t.id != id);
    applyFilters();
  } catch (err) { showToast(err.message, 'error'); }
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
