// Module-level state — avoids fragile JSON.stringify in onclick attributes
let _currentTask      = null;
let _currentWorkflows = [];
let _currentUsers     = [];

async function renderManagerTaskDetail(params = {}) {
  const taskId = params.id;
  if (!taskId) { navigate('manager-tasks'); return; }

  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6 max-w-6xl">
      <button onclick="navigate('manager-tasks')" class="btn-secondary text-sm mb-5">
        <i class="fa-solid fa-arrow-left"></i> Back to Tasks
      </button>
      <div id="task-detail-content">
        <div class="grid lg:grid-cols-3 gap-5">
          <div class="lg:col-span-2 space-y-4">
            ${skeletonBlock('h-48')}
            ${skeletonBlock('h-32')}
            ${skeletonBlock('h-40')}
          </div>
          <div>${skeletonBlock('h-64')}</div>
        </div>
      </div>
    </div>`);

  await loadTaskDetail(taskId);
}

function skeletonBlock(h) {
  return `<div class="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
    <div class="${h} bg-gray-100 rounded-lg"></div>
  </div>`;
}

async function loadTaskDetail(taskId) {
  try {
    [_currentTask, _currentWorkflows, _currentUsers] = await Promise.all([
      api.manager.getTask(taskId),
      api.manager.listWorkflows(),
      api.manager.listCompanyUsers(),
    ]);

    if (!_currentTask || !_currentTask.id) {
      document.getElementById('task-detail-content').innerHTML =
        `<div class="text-center py-12 text-red-500">Task not found or could not be loaded.</div>`;
      return;
    }

    renderTaskDetail();
  } catch (err) {
    document.getElementById('task-detail-content').innerHTML =
      `<div class="text-center py-12 text-red-500">${err.message}</div>`;
  }
}

function renderTaskDetail() {
  const task         = _currentTask;
  const workflows    = _currentWorkflows;
  const companyUsers = _currentUsers;

  const stageOptions = (task.workflow_stages || []).map(s =>
    `<option value="${s.id}" ${task.stage_id == s.id ? 'selected' : ''}>${s.name}</option>`
  ).join('');

  document.getElementById('task-detail-content').innerHTML = `
    <div class="grid lg:grid-cols-3 gap-5">

      <!-- ── Main ─────────────────────────────────────────────── -->
      <div class="lg:col-span-2 space-y-4">

        <!-- Header card -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div class="flex-1 min-w-0">
              <h1 class="text-xl font-bold text-gray-900 leading-snug mb-2">${escHtml(task.title || '(no title)')}</h1>
              <div class="flex flex-wrap items-center gap-2">
                ${priorityBadge(task.priority)}
                ${stageBadge(task.stage_name, task.stage_color)}
                <span class="text-xs text-gray-400">
                  <i class="fa-solid fa-user-pen mr-1"></i>by ${escHtml(task.creator_name || 'Unknown')}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button class="btn-secondary text-xs" onclick="openEditTaskModal()">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
              <button class="btn-danger text-xs" onclick="deleteTaskFromDetail(${task.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="text-sm text-gray-600 leading-relaxed">
            ${task.description
              ? escHtml(task.description).replace(/\n/g, '<br>')
              : '<em class="text-gray-400">No description provided</em>'}
          </div>
        </div>

        <!-- Stage mover (quick pill buttons) -->
        ${(task.workflow_stages || []).length ? `
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <i class="fa-solid fa-arrows-left-right text-blue-500"></i> Move to Stage
            </div>
            <div class="flex flex-wrap gap-2">
              ${(task.workflow_stages || []).map(s => `
                <button onclick="moveStageFromDetail(${task.id}, ${s.id})"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all
                    ${task.stage_id == s.id
                      ? 'text-white border-transparent'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}"
                  style="${task.stage_id == s.id ? `background:${s.color};border-color:${s.color}` : ''}">
                  ${escHtml(s.name)}
                </button>`).join('')}
            </div>
          </div>` : ''}

        <!-- Subtasks -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-800 flex items-center gap-2">
              <i class="fa-solid fa-bars-staggered text-indigo-500"></i> Subtasks
              <span class="text-xs text-gray-400 font-normal">(${task.subtasks?.length || 0})</span>
            </h3>
            <button class="btn-secondary text-xs" onclick="openCreateSubtaskModal(${task.id})">
              <i class="fa-solid fa-plus"></i> Add Subtask
            </button>
          </div>
          <div id="subtasks-list">
            ${task.subtasks?.length
              ? task.subtasks.map(s => `
                  <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-gray-800">${escHtml(s.title)}</div>
                      <div class="flex items-center gap-2 mt-1">
                        ${priorityBadge(s.priority)}
                        ${stageBadge(s.stage_name, s.stage_color)}
                      </div>
                    </div>
                    <div class="text-xs text-gray-400">${escHtml(s.assignee_name || 'Unassigned')}</div>
                    <div class="text-xs text-gray-400">${formatDate(s.due_date)}</div>
                  </div>`).join('')
              : `<div class="flex flex-col items-center py-8 text-center">
                   <i class="fa-solid fa-bars-staggered text-2xl text-gray-200 mb-2"></i>
                   <p class="text-sm text-gray-400">No subtasks yet</p>
                 </div>`}
          </div>
        </div>

        <!-- Attachments -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-800 flex items-center gap-2">
              <i class="fa-solid fa-paperclip text-blue-500"></i> Attachments
              <span class="text-xs text-gray-400 font-normal">(${task.attachments?.length || 0})</span>
            </h3>
            <label class="btn-secondary text-xs cursor-pointer">
              <i class="fa-solid fa-arrow-up-from-bracket"></i> Upload
              <input type="file" multiple class="hidden" onchange="uploadMgrAttachments(${task.id}, this)" />
            </label>
          </div>
          <div id="mgr-attachments-list" class="space-y-2">
            ${(task.attachments || []).length
              ? (task.attachments || []).map(a => `
                  <div class="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg group" data-attach-id="${a.id}">
                    <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 text-blue-500">
                      ${attachmentIcon(a.mime_type)}
                    </div>
                    <div class="flex-1 min-w-0">
                      <a href="/uploads/attachments/${a.filename}" target="_blank" download="${escHtml(a.original_name)}"
                         class="text-sm font-medium text-gray-800 hover:text-blue-600 truncate block">${escHtml(a.original_name)}</a>
                      <div class="text-xs text-gray-400">${formatFileSize(a.file_size)} · ${formatDateTime(a.created_at)} · ${escHtml(a.uploader_name)}</div>
                    </div>
                    <button onclick="deleteMgrAttachment(${task.id}, ${a.id}, this)"
                            class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>`).join('')
              : '<p class="text-sm text-gray-400 text-center py-4">No attachments yet</p>'}
          </div>
        </div>

        <!-- Comments -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <i class="fa-solid fa-comments text-orange-500"></i> Comments
            <span class="text-xs text-gray-400 font-normal">(${task.comments?.length || 0})</span>
          </h3>
          <div id="comments-list" class="space-y-4 mb-5">
            ${task.comments?.length
              ? task.comments.map(c => commentHtml(c)).join('')
              : '<p class="text-center text-sm text-gray-400 py-4">No comments yet</p>'}
          </div>
          <div class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              ${avatarInitials(state.user?.name)}
            </div>
            <div class="flex-1">
              <textarea id="new-comment" class="input text-sm" rows="2" placeholder="Write a comment…"></textarea>
              <button class="btn-primary text-xs mt-2" onclick="submitComment(${task.id})">
                <i class="fa-solid fa-paper-plane"></i> Post
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Sidebar ────────────────────────────────────────────── -->
      <div class="space-y-4">
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Task Details</h3>
          <div class="space-y-3 text-sm">

            <div>
              <span class="text-xs text-gray-400 uppercase tracking-wider">Stage</span>
              <div class="mt-1">
                <select class="input text-xs" onchange="moveStageFromDetail(${task.id}, this.value)">
                  <option value="">No stage</option>
                  ${stageOptions}
                </select>
              </div>
            </div>

            ${detailRow('Priority', priorityBadge(task.priority))}
            ${detailRow('Assignee', `<span class="font-medium text-gray-800">${escHtml(task.assignee_name || '—')}</span>`)}
            ${detailRow('Start Date', `<span class="text-gray-700">${formatDate(task.start_date)}</span>`)}
            ${detailRow('Due Date', `<span class="${isOverdue(task.due_date) ? 'text-red-600 font-semibold' : 'text-gray-700'}">${formatDate(task.due_date)}</span>`)}
            ${detailRow('Workflow', `<span class="text-gray-700">${escHtml(task.workflow_name || '—')}</span>`)}
            ${detailRow('Created', `<span class="text-gray-500">${formatDate(task.created_at)}</span>`)}
            ${detailRow('Creator', `<span class="text-gray-700">${escHtml(task.creator_name || '—')}</span>`)}
          </div>
        </div>
      </div>

    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detailRow(label, valueHtml) {
  return `
    <div class="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
      <span class="text-gray-400 text-xs">${label}</span>
      <div class="text-right">${valueHtml}</div>
    </div>`;
}

function commentHtml(c) {
  return `
    <div class="flex gap-3">
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
        ${avatarInitials(c.user_name)}
      </div>
      <div class="flex-1">
        <div class="bg-gray-50 rounded-xl p-3">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm font-semibold text-gray-800">${escHtml(c.user_name)}</span>
            <span class="text-xs text-gray-400">${formatDateTime(c.created_at)}</span>
          </div>
          <div class="text-sm text-gray-600">${escHtml(c.content).replace(/\n/g, '<br>')}</div>
        </div>
      </div>
    </div>`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function moveStageFromDetail(taskId, stageId) {
  try {
    await api.manager.updateTask(taskId, { ..._currentTask, stage_id: stageId || null });
    showToast('Stage updated');
    await loadTaskDetail(taskId);
  } catch (err) { showToast(err.message, 'error'); }
}

async function submitComment(taskId) {
  const ta      = document.getElementById('new-comment');
  const content = ta?.value?.trim();
  if (!content) return;
  try {
    const comment = await api.manager.addComment(taskId, content);
    ta.value = '';
    const list = document.getElementById('comments-list');
    const emptyMsg = list.querySelector('p');
    if (emptyMsg) list.innerHTML = '';
    const div = document.createElement('div');
    div.innerHTML = commentHtml({ ...comment, user_name: comment.user_name || state.user?.name });
    list.appendChild(div.firstElementChild);
    showToast('Comment added');
  } catch (err) { showToast(err.message, 'error'); }
}

function openEditTaskModal() {
  const task         = _currentTask;
  const workflows    = _currentWorkflows;
  const companyUsers = _currentUsers;
  if (!task) return;

  const wfOptions = workflows.map(w =>
    `<option value="${w.id}" ${task.workflow_id == w.id ? 'selected' : ''}>${escHtml(w.name)}</option>`
  ).join('');
  const userOptions = companyUsers.map(u =>
    `<option value="${u.id}" ${task.assignee_id == u.id ? 'selected' : ''}>${escHtml(u.name)}</option>`
  ).join('');
  const stageOptions = (task.workflow_stages || []).map(s =>
    `<option value="${s.id}" ${task.stage_id == s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Edit Task</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="edit-task-form" onsubmit="submitEditTask(event,${task.id})" class="p-6 space-y-4">
          <div><label class="label">Title *</label>
            <input name="title" class="input" value="${escHtml(task.title)}" required /></div>
          <div><label class="label">Description</label>
            <textarea name="description" class="input" rows="3">${escHtml(task.description || '')}</textarea></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label">Priority</label>
              <select name="priority" class="input">
                <option value="high"   ${task.priority === 'high'   ? 'selected' : ''}>🔴 High</option>
                <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>🟡 Medium</option>
                <option value="low"    ${task.priority === 'low'    ? 'selected' : ''}>🟢 Low</option>
              </select></div>
            <div><label class="label">Assignee</label>
              <select name="assignee_id" class="input">
                <option value="">Unassigned</option>${userOptions}
              </select></div>
            <div><label class="label">Workflow</label>
              <select name="workflow_id" class="input" id="edit-wf-sel" onchange="loadEditStages(this.value)">
                <option value="">No workflow</option>${wfOptions}
              </select></div>
            <div><label class="label">Stage</label>
              <select name="stage_id" class="input" id="edit-stage-sel">
                <option value="">No stage</option>${stageOptions}
              </select></div>
            <div><label class="label">Start Date</label>
              <input name="start_date" type="date" class="input" value="${task.start_date || ''}" /></div>
            <div><label class="label">Due Date</label>
              <input name="due_date" type="date" class="input" value="${task.due_date || ''}" /></div>
          </div>
          <div id="edit-task-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>`);
}

function loadEditStages(wfId) {
  const wf  = _currentWorkflows.find(w => w.id == wfId);
  const sel = document.getElementById('edit-stage-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">No stage</option>';
  (wf?.stages || []).forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });
}

async function submitEditTask(e, taskId) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (!data.assignee_id) data.assignee_id = null;
  if (!data.workflow_id) data.workflow_id = null;
  if (!data.stage_id)    data.stage_id    = null;
  const errEl = document.getElementById('edit-task-error');
  errEl.classList.add('hidden');
  try {
    await api.manager.updateTask(taskId, data);
    showToast('Task updated');
    closeModal();
    await loadTaskDetail(taskId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function deleteTaskFromDetail(taskId) {
  if (!confirmDialog('Delete this task and all its subtasks?')) return;
  try {
    await api.manager.deleteTask(taskId);
    showToast('Task deleted');
    navigate('manager-tasks');
  } catch (err) { showToast(err.message, 'error'); }
}

function openCreateSubtaskModal(parentId) {
  const parentWorkflowId = _currentTask?.workflow_id;
  const wfOptions   = _currentWorkflows.map(w =>
    `<option value="${w.id}" ${w.id == parentWorkflowId ? 'selected' : ''}>${escHtml(w.name)}</option>`
  ).join('');
  const userOptions = _currentUsers.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('');

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Add Subtask</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="subtask-form" onsubmit="submitCreateSubtask(event,${parentId})" class="p-6 space-y-4">
          <div><label class="label">Title *</label><input name="title" class="input" required /></div>
          <div><label class="label">Description</label><textarea name="description" class="input" rows="2"></textarea></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label">Priority</label>
              <select name="priority" class="input">
                <option value="medium" selected>🟡 Medium</option>
                <option value="high">🔴 High</option>
                <option value="low">🟢 Low</option>
              </select></div>
            <div><label class="label">Assignee</label>
              <select name="assignee_id" class="input"><option value="">Unassigned</option>${userOptions}</select></div>
            <div><label class="label">Project *</label>
              <select name="workflow_id" class="input" id="sub-wf-sel" onchange="loadSubStages(this.value)" required>
                <option value="">Select a project</option>${wfOptions}
              </select></div>
            <div><label class="label">Stage</label>
              <select name="stage_id" class="input" id="sub-stage-sel"><option value="">No stage</option></select></div>
            <div><label class="label">Start Date</label><input name="start_date" type="date" class="input" /></div>
            <div><label class="label">Due Date</label><input name="due_date" type="date" class="input" /></div>
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
          <div id="subtask-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Add Subtask</button>
          </div>
        </form>
      </div>
    </div>`);

  // Pre-load stages for the parent task's workflow
  if (parentWorkflowId) loadSubStages(parentWorkflowId);
}

function loadSubStages(wfId) {
  const wf  = _currentWorkflows.find(w => w.id == wfId);
  const sel = document.getElementById('sub-stage-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">No stage</option>';
  (wf?.stages || []).forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });
}

async function submitCreateSubtask(e, parentId) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  data.parent_task_id = parentId;
  if (!data.assignee_id) delete data.assignee_id;
  if (!data.stage_id)    delete data.stage_id;
  const errEl = document.getElementById('subtask-error');
  errEl.classList.add('hidden');
  const fileInput = document.getElementById('modal-attach-files');
  try {
    const task = await api.manager.createTask(data);
    closeModal();
    await uploadFilesAfterCreate(task.id, fileInput, (id, fd) => api.manager.uploadAttachment(id, fd));
    showToast('Subtask added');
    await loadTaskDetail(parentId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function uploadMgrAttachments(taskId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  let uploaded = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const att = await api.manager.uploadAttachment(taskId, fd);
      prependMgrAttachment(taskId, att);
      uploaded++;
    } catch (err) {
      showToast(`${file.name}: ${err.message}`, 'error');
    }
  }
  if (uploaded) showToast(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`);
  input.value = '';
}

function prependMgrAttachment(taskId, a) {
  const list = document.getElementById('mgr-attachments-list');
  if (!list) return;
  const empty = list.querySelector('p');
  if (empty) list.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg group';
  div.dataset.attachId = a.id;
  div.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 text-blue-500">
      ${attachmentIcon(a.mime_type)}
    </div>
    <div class="flex-1 min-w-0">
      <a href="/uploads/attachments/${a.filename}" target="_blank" download="${escHtml(a.original_name)}"
         class="text-sm font-medium text-gray-800 hover:text-blue-600 truncate block">${escHtml(a.original_name)}</a>
      <div class="text-xs text-gray-400">${formatFileSize(a.file_size)} · Just now · ${escHtml(a.uploader_name)}</div>
    </div>
    <button onclick="deleteMgrAttachment(${taskId}, ${a.id}, this)"
            class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1">
      <i class="fa-solid fa-trash"></i>
    </button>`;
  list.prepend(div);
}

async function deleteMgrAttachment(taskId, attachId, btn) {
  if (!confirmDialog('Remove this attachment?')) return;
  try {
    await api.manager.deleteAttachment(taskId, attachId);
    btn.closest('[data-attach-id]')?.remove();
    showToast('Attachment removed');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
