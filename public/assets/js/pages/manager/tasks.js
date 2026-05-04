let _allTasks = [], _allWorkflows = [], _allCompanyUsers = [];
let _viewMode = 'board'; // 'board' | 'list'
let _filterWf = '', _filterPriority = '', _filterAssignee = '';
let _dragTaskId = null;

async function renderManagerTasks() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Tasks', 'Manage all company tasks', `
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-xs" onclick="setView('board')" id="btn-board"><i class="fa-solid fa-table-columns"></i> Board</button>
          <button class="btn-secondary text-xs" onclick="setView('list')" id="btn-list"><i class="fa-solid fa-list"></i> List</button>
          <button class="btn-primary" onclick="openCreateTaskModal()"><i class="fa-solid fa-plus"></i> New Task</button>
        </div>`)}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <select id="filter-wf" class="input w-auto text-sm" onchange="applyFilters()"><option value="">All Workflows</option></select>
        <select id="filter-priority" class="input w-auto text-sm" onchange="applyFilters()">
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select id="filter-assignee" class="input w-auto text-sm" onchange="applyFilters()"><option value="">All Assignees</option></select>
        <input type="text" id="filter-search" class="input w-auto text-sm" placeholder="Search tasks..." oninput="applyFilters()" />
      </div>
      <div id="tasks-view">Loading...</div>
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
  const wf = document.getElementById('filter-wf')?.value;
  const prio = document.getElementById('filter-priority')?.value;
  const ass = document.getElementById('filter-assignee')?.value;
  const search = document.getElementById('filter-search')?.value?.toLowerCase();
  let filtered = _allTasks.filter(t => {
    if (wf && t.workflow_id != wf) return false;
    if (prio && t.priority !== prio) return false;
    if (ass && t.assignee_id != ass) return false;
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

function renderList(tasks) {
  document.getElementById('tasks-view').innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
      ${tableWrapper(
        ['Task', 'Priority', 'Stage', 'Assignee', 'Due Date', 'Subtasks', 'Actions'],
        tasks.map(t => `
          <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('manager-task-detail',{id:${t.id}})">
            <td class="px-4 py-3">
              <div class="font-medium text-gray-900">${t.title}</div>
              <div class="text-xs text-gray-400">${t.workflow_name || 'No workflow'}</div>
            </td>
            <td class="px-4 py-3">${priorityBadge(t.priority)}</td>
            <td class="px-4 py-3">${stageBadge(t.stage_name, t.stage_color)}</td>
            <td class="px-4 py-3">
              ${t.assignee_name ? `<div class="flex items-center gap-2"><div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">${avatarInitials(t.assignee_name)}</div><span class="text-sm text-gray-700">${t.assignee_name}</span></div>` : '<span class="text-sm text-gray-400">Unassigned</span>'}
            </td>
            <td class="px-4 py-3 text-sm ${isOverdue(t.due_date) ? 'text-red-600 font-medium' : 'text-gray-600'}">${formatDate(t.due_date)}</td>
            <td class="px-4 py-3 text-sm text-gray-500">${t.subtask_count || 0}</td>
            <td class="px-4 py-3" onclick="event.stopPropagation()">
              <div class="flex items-center gap-2">
                <button class="text-sm text-blue-600 hover:underline" onclick="navigate('manager-task-detail',{id:${t.id}})">View</button>
                <button class="text-sm text-red-600 hover:underline" onclick="deleteTask(${t.id})">Delete</button>
              </div>
            </td>
          </tr>`)
      )}
    </div>`;
}

function taskCard(t) {
  return `
    <div class="task-card select-none"
      draggable="true"
      data-task-id="${t.id}"
      ondragstart="startDrag(event, ${t.id})"
      ondragend="endDrag(event)"
      onclick="navigate('manager-task-detail',{id:${t.id}})">
      <div class="text-sm font-medium text-gray-800 mb-2 line-clamp-2">${t.title}</div>
      <div class="flex items-center gap-1.5 mb-2">${priorityBadge(t.priority)}</div>
      <div class="flex items-center justify-between">
        ${t.assignee_name
          ? `<div class="flex items-center gap-1.5">
               <div class="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold">${avatarInitials(t.assignee_name)}</div>
               <span class="text-xs text-gray-500">${t.assignee_name}</span>
             </div>`
          : '<span class="text-xs text-gray-400">Unassigned</span>'}
        ${t.due_date ? `<span class="text-xs ${isOverdue(t.due_date) ? 'text-red-500 font-medium' : 'text-gray-400'}">${formatDate(t.due_date)}</span>` : ''}
      </div>
      ${t.subtask_count > 0 ? `<div class="mt-2 text-xs text-gray-400"><i class="fa-solid fa-bars-staggered mr-1"></i>${t.subtask_count} subtask${t.subtask_count > 1 ? 's' : ''}</div>` : ''}
    </div>`;
}

function taskFormFields(t = {}, workflows, users) {
  const wfOptions = workflows.map(w => `<option value="${w.id}" ${t.workflow_id == w.id ? 'selected' : ''}>${w.name}</option>`).join('');
  const userOptions = users.map(u => `<option value="${u.id}" ${t.assignee_id == u.id ? 'selected' : ''}>${u.name}</option>`).join('');
  return `
    <div><label class="label">Task Title *</label><input name="title" class="input" value="${t.title || ''}" required /></div>
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
      <div><label class="label">Project *</label>
        <select name="workflow_id" class="input" id="task-workflow-sel" onchange="loadStagesForTask(this.value,'${t.stage_id || ''}')" required>
          <option value="">Select a project</option>${wfOptions}
        </select>
      </div>
      <div><label class="label">Stage</label>
        <select name="stage_id" class="input" id="task-stage-sel"><option value="">No stage</option></select>
      </div>
      <div><label class="label">Start Date</label><input name="start_date" type="date" class="input" value="${t.start_date || ''}" /></div>
      <div><label class="label">Due Date</label><input name="due_date" type="date" class="input" value="${t.due_date || ''}" /></div>
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
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
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
