function taskLockState(stageName) {
  const n = (stageName || '').toLowerCase();
  const isClosed = n.includes('closed');
  const isDone   = !isClosed && (n.includes('done') || n.includes('complet'));
  return { isDone, isClosed };
}

function renderMentionsEmp(text) {
  if (!text) return '';
  // escHtml for employee is done inline in template strings; apply escaping then mention highlight
  const escaped = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return escaped.replace(/@([\w]+(?:\s[\w]+)?)/g, '<span class="mention-chip">@$1</span>');
}

async function renderEmployeeTaskDetail(params = {}) {
  const taskId = params.id;
  if (!taskId) { navigate('employee-tasks'); return; }

  document.getElementById('app').innerHTML = renderLayout('employee', `
    <div class="p-6">
      <button onclick="navigate('employee-tasks')" class="btn-secondary text-sm mb-4">
        <i class="fa-solid fa-arrow-left"></i> Back to Tasks
      </button>
      <div id="emp-task-detail">
        <div class="animate-pulse space-y-4">
          <div class="h-8 bg-gray-200 rounded w-2/3"></div>
          <div class="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>`);

  await loadEmpTaskDetail(taskId);
}

async function loadEmpTaskDetail(taskId) {
  try {
    const task = await api.employee.getTask(taskId);
    renderEmpTaskDetail(task);
  } catch (err) {
    document.getElementById('emp-task-detail').innerHTML =
      `<div class="text-center py-12 text-red-500">${err.message}</div>`;
  }
}

function renderEmpTaskDetail(task) {
  const lock = taskLockState(task.stage_name);
  // Stage mover: hidden entirely for both done (employee can't move out) and closed
  const stageLocked = lock.isDone || lock.isClosed;

  // ── Build the "Update Status" section before injecting into the template ──
  let moveTaskHtml = '';
  if (task.workflow_stages?.length) {
    if (!stageLocked) {
      const pills = (task.workflow_stages || []).map(s => {
        const active   = task.stage_id == s.id;
        const style    = active ? `background:${s.color};border-color:${s.color}` : '';
        const baseCls  = 'px-3 py-1.5 rounded-lg text-xs font-medium border-2';
        const activeCls = active ? 'text-white border-transparent' : '';
        return `<button onclick="moveTaskStage(${task.id}, ${s.id}, '${s.name}', this)"
                  class="${baseCls} transition-all ${activeCls} ${active ? '' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}"
                  style="${style}">${s.name}</button>`;
      }).join('');
      moveTaskHtml = `
        <div class="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-700 mb-3 text-sm flex items-center gap-2">
            <i class="fa-solid fa-arrows-left-right text-blue-500"></i> Update Status
          </h3>
          <div class="flex flex-wrap gap-2">${pills}</div>
        </div>`;
    }
  }

  // ── Subtasks HTML ──────────────────────────────────────────────────────────
  const canAddSubtask = state.user?.can_create_tasks && !lock.isDone && !lock.isClosed;
  const subtaskItems  = (task.subtasks || []).map(s => `
    <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
         onclick="navigate('employee-task-detail',{id:${s.id}})">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-gray-800 truncate">${s.title}</div>
        <div class="flex gap-2 mt-1">
          ${priorityBadge(s.priority)} ${stageBadge(s.stage_name, s.stage_color)}
        </div>
      </div>
      <div class="text-xs text-gray-400 flex-shrink-0">${s.assignee_name || 'Unassigned'}</div>
    </div>`).join('');

  const subtasksHtml = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-800 flex items-center gap-2">
          <i class="fa-solid fa-bars-staggered text-indigo-500"></i>
          Subtasks <span class="text-xs text-gray-400 font-normal">(${task.subtasks?.length || 0})</span>
        </h3>
        ${canAddSubtask
          ? `<button class="btn-secondary text-xs" onclick="openEmpSubtaskModal(${task.id}, ${task.workflow_id})">
               <i class="fa-solid fa-plus"></i> Add Subtask
             </button>`
          : ''}
      </div>
      ${subtaskItems || '<p class="text-sm text-gray-400 text-center py-4">No subtasks yet</p>'}
    </div>`;

  // ── Attachments HTML ───────────────────────────────────────────────────────
  const attachmentItems = (task.attachments || []).map(a => `
    <div class="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg group">
      <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 text-blue-500">
        ${attachmentIcon(a.mime_type)}
      </div>
      <div class="flex-1 min-w-0">
        <a href="/uploads/attachments/${a.filename}" target="_blank" download="${a.original_name}"
           class="text-sm font-medium text-gray-800 hover:text-blue-600 truncate block">${a.original_name}</a>
        <div class="text-xs text-gray-400">${formatFileSize(a.file_size)} · ${formatDateTime(a.created_at)} · ${a.uploader_name}</div>
      </div>
      ${(!lock.isDone && !lock.isClosed && a.uploaded_by == state.user?.id) ? `
        <button onclick="deleteEmpAttachment(${task.id}, ${a.id}, this)"
                class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1">
          <i class="fa-solid fa-trash"></i>
        </button>` : ''}
    </div>`).join('');

  const attachmentsHtml = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-800 flex items-center gap-2">
          <i class="fa-solid fa-paperclip text-blue-500"></i>
          Attachments <span class="text-xs text-gray-400 font-normal">(${task.attachments?.length || 0})</span>
        </h3>
        ${!lock.isDone && !lock.isClosed ? `
        <label class="btn-secondary text-xs cursor-pointer">
          <i class="fa-solid fa-arrow-up-from-bracket"></i> Upload
          <input type="file" multiple class="hidden" onchange="uploadEmpAttachments(${task.id}, this)" />
        </label>` : ''}
      </div>
      <div id="emp-attachments-list" class="space-y-2">
        ${attachmentItems || '<p class="text-sm text-gray-400 text-center py-4">No attachments yet</p>'}
      </div>
    </div>`;

  // ── Comments HTML ──────────────────────────────────────────────────────────
  const commentItems = task.comments?.length
    ? task.comments.map(c => `
        <div class="flex gap-3">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500
                      flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            ${avatarInitials(c.user_name)}
          </div>
          <div class="flex-1">
            <div class="bg-gray-50 rounded-xl p-3">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-semibold text-gray-800">${c.user_name}</span>
                <span class="text-xs text-gray-400">${formatDateTime(c.created_at)}</span>
              </div>
              <div class="text-sm text-gray-600">${renderMentionsEmp(c.content).replace(/\n/g, '<br>')}</div>
            </div>
          </div>
        </div>`).join('')
    : '<div class="text-center py-4 text-sm text-gray-400">No comments yet. Be the first!</div>';

  // ── Main render ────────────────────────────────────────────────────────────
  document.getElementById('emp-task-detail').innerHTML = `
    ${lock.isClosed ? `
    <div class="mb-4 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium bg-gray-900 text-gray-100">
      <i class="fa-solid fa-lock text-gray-400"></i>
      <span>This task is <strong>Closed</strong> — no further changes can be made.</span>
    </div>` : ''}
    ${lock.isDone ? `
    <div class="mb-4 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium bg-amber-50 border border-amber-200 text-amber-800">
      <i class="fa-solid fa-circle-check text-amber-500"></i>
      <span>This task is <strong>Done</strong> — locked until a manager moves it back to a previous stage.</span>
    </div>` : ''}
    <div class="grid lg:grid-cols-3 gap-6">

      <!-- Main column -->
      <div class="lg:col-span-2 space-y-6">

        <!-- Header -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h1 class="text-xl font-bold text-gray-900 mb-2">${task.title}</h1>
          <div class="flex flex-wrap items-center gap-2 mb-4">
            ${priorityBadge(task.priority)}
            ${stageBadge(task.stage_name, task.stage_color)}
            <span class="text-xs text-gray-400">
              <i class="fa-solid fa-diagram-project mr-1"></i>${task.workflow_name || '—'}
            </span>
            <span class="text-xs text-gray-400">Created by ${task.creator_name}</span>
          </div>
          <div class="text-sm text-gray-600 leading-relaxed">
            ${task.description
              ? task.description.replace(/\n/g, '<br>')
              : '<em class="text-gray-400">No description provided</em>'}
          </div>
        </div>

        <!-- Status update / lock -->
        ${moveTaskHtml}

        <!-- Checklist -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-800 flex items-center gap-2">
              <i class="fa-solid fa-check-square text-indigo-500"></i> Checklist
              <span class="text-xs text-gray-400 font-normal" id="emp-checklist-count">(${(task.checklist || []).length})</span>
            </h3>
          </div>
          <div id="emp-checklist-progress-wrap" class="${(task.checklist || []).length ? '' : 'hidden'} mb-3">
            <div class="text-xs text-gray-500 mb-1" id="emp-checklist-progress-text">${empChecklistProgressText(task.checklist || [])}</div>
            <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div id="emp-checklist-progress-bar" class="h-full bg-indigo-500 rounded-full transition-all"
                   style="width:${empChecklistPct(task.checklist || [])}%"></div>
            </div>
          </div>
          <div id="emp-checklist-list" class="space-y-1 mb-3">
            ${renderEmpChecklistItems(task.checklist || [], task.id, lock.isDone || lock.isClosed)}
          </div>
          ${!lock.isDone && !lock.isClosed ? `
          <div class="flex items-center gap-2">
            <input type="text" id="emp-new-checklist-item" class="input flex-1 text-sm" placeholder="Add checklist item…"
                   onkeydown="if(event.key==='Enter'){addEmpChecklistItem(${task.id});event.preventDefault();}" />
            <button class="btn-secondary text-xs shrink-0" onclick="addEmpChecklistItem(${task.id})">
              <i class="fa-solid fa-plus"></i> Add
            </button>
          </div>` : `<p class="text-xs text-gray-400 mt-2 italic"><i class="fa-solid fa-lock mr-1"></i>Checklist locked</p>`}
        </div>

        <!-- Subtasks -->
        ${subtasksHtml}

        <!-- Attachments -->
        ${attachmentsHtml}

        <!-- Comments -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <i class="fa-solid fa-comments text-orange-500"></i>
            Comments (${task.comments?.length || 0})
          </h3>
          <div id="emp-comments-list" class="space-y-4 mb-4">${commentItems}</div>
          ${!lock.isDone && !lock.isClosed ? `
          <div class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center
                        text-white text-xs font-bold flex-shrink-0">
              ${avatarInitials(state.user?.name)}
            </div>
            <div class="flex-1">
              <textarea id="emp-new-comment" class="input text-sm" rows="2"
                        placeholder="Write a comment..."></textarea>
              <button class="btn-primary text-xs mt-2" onclick="submitEmpComment(${task.id})">
                <i class="fa-solid fa-paper-plane"></i> Post
              </button>
            </div>
          </div>` : `<p class="text-xs text-gray-400 italic"><i class="fa-solid fa-lock mr-1"></i>Comments locked</p>`}
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-4">
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 class="font-semibold text-gray-700 mb-4 text-sm">Details</h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between items-center">
              <span class="text-gray-500">Priority</span>
              ${priorityBadge(task.priority)}
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">Status</span>
              ${stageBadge(task.stage_name, task.stage_color)}
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">Project</span>
              <span class="font-medium text-gray-800 text-right">${task.workflow_name || '—'}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">Assigned to</span>
              <span class="font-medium text-gray-800">${task.assignee_name || '—'}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">Start</span>
              <span class="text-gray-700">${formatDate(task.start_date)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">Due</span>
              <span class="${isOverdue(task.due_date) ? 'text-red-600 font-semibold' : 'text-gray-700'}">
                ${formatDate(task.due_date)}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>`;
}

async function moveTaskStage(taskId, stageId, stageName, btn) {
  try {
    await api.employee.updateStage(taskId, stageId);
    showToast(`Moved to "${stageName}"`);
    await loadEmpTaskDetail(taskId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openEmpSubtaskModal(parentId, workflowId) {
  let stages = [];
  try {
    const wfs = await api.employee.listWorkflows();
    const wf  = wfs.find(w => w.id == workflowId);
    stages    = wf?.stages || [];
  } catch {}

  const stageOptions = stages.map(s =>
    `<option value="${s.id}">${s.name}</option>`
  ).join('');

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Add Subtask</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form id="emp-subtask-form" onsubmit="submitEmpSubtask(event,${parentId},${workflowId})"
              class="p-6 space-y-4">
          <div>
            <label class="label">Title *</label>
            <input name="title" class="input" required />
          </div>
          <div>
            <label class="label">Description</label>
            <textarea name="description" class="input" rows="2"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Priority</label>
              <select name="priority" class="input">
                <option value="medium" selected>🟡 Medium</option>
                <option value="high">🔴 High</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div>
              <label class="label">Due Date</label>
              <input name="due_date" type="date" class="input" />
            </div>
            <div>
              <label class="label">Stage</label>
              <select name="stage_id" class="input">
                <option value="">No stage</option>${stageOptions}
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
          <div id="emp-subtask-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Add Subtask</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitEmpSubtask(e, parentId, workflowId) {
  e.preventDefault();
  const data  = Object.fromEntries(new FormData(e.target).entries());
  data.parent_task_id = parentId;
  data.workflow_id    = workflowId;
  if (!data.stage_id) delete data.stage_id;
  const errEl = document.getElementById('emp-subtask-error');
  errEl.classList.add('hidden');
  const fileInput = document.getElementById('modal-attach-files');
  try {
    const task = await api.employee.createTask(data);
    closeModal();
    await uploadFilesAfterCreate(task.id, fileInput, (id, fd) => api.employee.uploadAttachment(id, fd));
    showToast('Subtask added!');
    await loadEmpTaskDetail(parentId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function submitEmpComment(taskId) {
  const ta = document.getElementById('emp-new-comment');
  const content = ta?.value?.trim();
  if (!content) return;
  try {
    const comment = await api.employee.addComment(taskId, content);
    ta.value = '';
    const list = document.getElementById('emp-comments-list');
    if (list.querySelector('.text-center')) list.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'flex gap-3';
    div.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500
                  flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        ${avatarInitials(comment.user_name)}
      </div>
      <div class="flex-1">
        <div class="bg-gray-50 rounded-xl p-3">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm font-semibold text-gray-800">${comment.user_name}</span>
            <span class="text-xs text-gray-400">Just now</span>
          </div>
          <div class="text-sm text-gray-600">${comment.content.replace(/\n/g, '<br>')}</div>
        </div>
      </div>`;
    list.appendChild(div);
    showToast('Comment posted!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function uploadEmpAttachments(taskId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  let uploaded = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const att = await api.employee.uploadAttachment(taskId, fd);
      prependEmpAttachment(taskId, att);
      uploaded++;
    } catch (err) {
      showToast(`${file.name}: ${err.message}`, 'error');
    }
  }
  if (uploaded) showToast(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`);
  input.value = '';
}

function prependEmpAttachment(taskId, a) {
  const list = document.getElementById('emp-attachments-list');
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
      <a href="/uploads/attachments/${a.filename}" target="_blank" download="${a.original_name}"
         class="text-sm font-medium text-gray-800 hover:text-blue-600 truncate block">${a.original_name}</a>
      <div class="text-xs text-gray-400">${formatFileSize(a.file_size)} · Just now · ${a.uploader_name}</div>
    </div>
    <button onclick="deleteEmpAttachment(${taskId}, ${a.id}, this)"
            class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1">
      <i class="fa-solid fa-trash"></i>
    </button>`;
  list.prepend(div);
}

function deleteEmpAttachment(taskId, attachId, btn) {
  showConfirm({
    title: 'Remove attachment?',
    message: 'This file will be permanently deleted.',
    confirmLabel: 'Remove',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.employee.deleteAttachment(taskId, attachId);
        btn.closest('[data-attach-id]')?.remove();
        showToast('Attachment removed');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

// ── Employee Checklist ────────────────────────────────────────────────────────

function empChecklistPct(items) {
  if (!items || !items.length) return 0;
  const done = items.filter(i => +i.is_done).length;
  return Math.round((done / items.length) * 100);
}

function empChecklistProgressText(items) {
  if (!items || !items.length) return '';
  const done = items.filter(i => +i.is_done).length;
  return `${done} of ${items.length} done`;
}

function renderEmpChecklistItems(items, taskId, locked = false) {
  if (!items || !items.length) {
    return '<p class="text-sm text-gray-400 italic py-2">No checklist items yet</p>';
  }
  return items.map(item => `
    <div class="flex items-center gap-2 py-1.5 group" data-emp-checklist-id="${item.id}">
      <input type="checkbox" class="w-4 h-4 rounded accent-indigo-600 shrink-0 ${locked ? '' : 'cursor-pointer'}"
             ${+item.is_done ? 'checked' : ''}
             ${locked ? 'disabled' : `onchange="toggleEmpChecklistItem(${taskId}, ${item.id}, this.checked)"`} />
      <span class="flex-1 text-sm ${+item.is_done ? 'line-through text-gray-400' : 'text-gray-700'}">${item.title}</span>
      ${locked ? '' : `
      <button onclick="deleteEmpChecklistItem(${taskId}, ${item.id})"
              class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1 shrink-0">
        <i class="fa-solid fa-xmark"></i>
      </button>`}
    </div>`).join('');
}

function updateEmpChecklistUI(items) {
  const pct = empChecklistPct(items);
  const wrap = document.getElementById('emp-checklist-progress-wrap');
  const bar  = document.getElementById('emp-checklist-progress-bar');
  const text = document.getElementById('emp-checklist-progress-text');
  const cnt  = document.getElementById('emp-checklist-count');
  if (wrap) wrap.classList.toggle('hidden', items.length === 0);
  if (bar)  bar.style.width = pct + '%';
  if (text) text.textContent = empChecklistProgressText(items);
  if (cnt)  cnt.textContent = `(${items.length})`;
}

async function addEmpChecklistItem(taskId) {
  const input = document.getElementById('emp-new-checklist-item');
  const title = input?.value?.trim();
  if (!title) return;
  try {
    await api.employee.createSubtask(taskId, { title });
    input.value = '';
    await loadEmpTaskDetail(taskId);
  } catch (err) { showToast(err.message, 'error'); }
}

async function toggleEmpChecklistItem(taskId, subtaskId, isDone) {
  try {
    await api.employee.updateSubtask(taskId, subtaskId, { is_done: isDone ? 1 : 0 });
    const row = document.querySelector(`[data-emp-checklist-id="${subtaskId}"]`);
    if (row) {
      const span = row.querySelector('span');
      if (span) span.className = `flex-1 text-sm ${isDone ? 'line-through text-gray-400' : 'text-gray-700'}`;
    }
    const allChecks = Array.from(document.querySelectorAll('[data-emp-checklist-id]'));
    const items = allChecks.map(el => ({
      id: +el.dataset.empChecklistId,
      is_done: el.querySelector('input[type=checkbox]')?.checked ? 1 : 0,
    }));
    updateEmpChecklistUI(items);
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteEmpChecklistItem(taskId, subtaskId) {
  try {
    await api.employee.deleteSubtask(taskId, subtaskId);
    document.querySelector(`[data-emp-checklist-id="${subtaskId}"]`)?.remove();
    const allChecks = Array.from(document.querySelectorAll('[data-emp-checklist-id]'));
    const items = allChecks.map(el => ({
      id: +el.dataset.empChecklistId,
      is_done: el.querySelector('input[type=checkbox]')?.checked ? 1 : 0,
    }));
    updateEmpChecklistUI(items);
  } catch (err) { showToast(err.message, 'error'); }
}
