// Module-level state — avoids fragile JSON.stringify in onclick attributes
let _currentTask      = null;
let _currentWorkflows = [];
let _currentUsers     = [];

function taskLockState(stageName) {
  const n = (stageName || '').toLowerCase();
  const isClosed = n.includes('closed');
  const isDone   = !isClosed && (n.includes('done') || n.includes('complet'));
  return { isDone, isClosed };
}

function renderMentions(text) {
  if (!text) return '';
  return escHtml(text).replace(/@([\w]+(?:\s[\w]+)?)/g,
    '<span class="mention-chip">@$1</span>');
}

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
    loadAndRenderActivityLog(taskId);
    loadTimeLogs(taskId);
    loadKudos(taskId);
    initMentionAutocomplete('new-comment', _currentUsers);
  } catch (err) {
    document.getElementById('task-detail-content').innerHTML =
      `<div class="text-center py-12 text-red-500">${err.message}</div>`;
  }
}

function renderTaskDetail() {
  const task         = _currentTask;
  const lock         = taskLockState(task.stage_name);

  const stageOptions = (task.workflow_stages || []).map(s =>
    `<option value="${s.id}" ${task.stage_id == s.id ? 'selected' : ''}>${s.name}</option>`
  ).join('');

  const sectionLabel = (color, icon, label) => `
    <div class="flex items-center gap-2 mb-3 px-1">
      <div class="w-1 h-4 rounded-full" style="background:${color}"></div>
      <i class="${icon} text-xs" style="color:${color}"></i>
      <span class="text-xs font-bold uppercase tracking-widest" style="color:#94a3b8">${label}</span>
    </div>`;

  document.getElementById('task-detail-content').innerHTML = `
    ${lock.isClosed ? `
    <div class="mb-5 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium bg-gray-900 text-gray-100">
      <i class="fa-solid fa-lock text-gray-400"></i>
      <span>This task is <strong>Closed</strong> — no further changes can be made.</span>
    </div>` : ''}
    ${lock.isDone ? `
    <div class="mb-5 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium bg-amber-50 border border-amber-200 text-amber-800">
      <i class="fa-solid fa-circle-check text-amber-500"></i>
      <span>This task is <strong>Done</strong> — checklist, attachments and comments are locked. Move it back to unlock.</span>
    </div>` : ''}

    <div class="grid lg:grid-cols-3 gap-6">

      <!-- ── Main ─────────────────────────────────────────────── -->
      <div class="lg:col-span-2 space-y-6">

        <!-- ▸ HEADER CARD -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="p-6 pb-5">
            <!-- badges row -->
            <div class="flex flex-wrap items-center gap-2 mb-3">
              ${priorityBadge(task.priority)}
              ${stageBadge(task.stage_name, task.stage_color)}
              ${task.recurrence_rule && task.recurrence_rule !== 'none' ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-purple-100 text-purple-700">
                  <i class="fa-solid fa-rotate"></i> Repeats ${task.recurrence_rule}
                </span>` : ''}
              <span class="ml-auto text-xs text-gray-400">
                <i class="fa-solid fa-user-pen mr-1"></i>by ${escHtml(task.creator_name || 'Unknown')}
              </span>
            </div>
            <!-- Title — full width, no competing siblings -->
            <h1 class="text-2xl font-bold text-gray-900 leading-tight mb-4">${escHtml(task.title || '(no title)')}</h1>
            <!-- Description -->
            <div class="text-sm text-gray-600 leading-relaxed">
              ${task.description
                ? escHtml(task.description).replace(/\n/g, '<br>')
                : '<em class="text-gray-400">No description provided</em>'}
            </div>
          </div>
          <!-- Action toolbar — separated visually -->
          <div class="px-6 py-3 flex items-center gap-2 flex-wrap" style="background:#f8fafc;border-top:1px solid #f1f5f9">
            <button class="btn-secondary text-xs" onclick="FocusMode.open(_currentTask)"
                    title="Start a Pomodoro focus session"
                    style="border-color:#6366f1;color:#6366f1">
              <i class="fa-solid fa-crosshairs"></i> Focus
            </button>
            ${!lock.isClosed ? `
            <button class="btn-secondary text-xs" onclick="openEditTaskModal()">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn-secondary text-xs" onclick="duplicateTask(${task.id})">
              <i class="fa-solid fa-copy"></i> Duplicate
            </button>
            <button class="btn-secondary text-xs" onclick="saveCurrentTaskAsTemplate(${task.id})">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Template
            </button>` : ''}
            <span class="flex-1"></span>
            <button class="btn-danger text-xs" onclick="deleteTaskFromDetail(${task.id})">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </div>

        <!-- ▸ SECTION: PROGRESS -->
        ${!lock.isClosed && (task.workflow_stages || []).length ? `
        <div>
          ${sectionLabel('#3b82f6', 'fa-solid fa-arrows-left-right', 'Progress')}
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
          </div>
        </div>` : ''}

        <!-- ▸ SECTION: WORK -->
        <div>
          ${sectionLabel('#6366f1', 'fa-solid fa-list-check', 'Work')}
          <div class="space-y-4">

            <!-- Checklist -->
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-gray-800 flex items-center gap-2">
                  <i class="fa-solid fa-check-square text-indigo-500"></i> Checklist
                  <span class="text-xs text-gray-400 font-normal" id="checklist-count">(${(task.checklist || []).length})</span>
                </h3>
              </div>
              <div id="checklist-progress-wrap" class="${(task.checklist || []).length ? '' : 'hidden'} mb-3">
                <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span id="checklist-progress-text">${checklistProgressText(task.checklist || [])}</span>
                  <span class="text-indigo-600 font-semibold">${checklistPct(task.checklist || [])}%</span>
                </div>
                <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div id="checklist-progress-bar" class="h-full rounded-full transition-all"
                       style="width:${checklistPct(task.checklist || [])}%;background:linear-gradient(90deg,#6366f1,#818cf8)"></div>
                </div>
              </div>
              <div id="checklist-list" class="space-y-0.5 mb-3">
                ${renderChecklistItems(task.checklist || [], task.id, lock.isDone || lock.isClosed)}
              </div>
              ${!lock.isDone && !lock.isClosed ? `
              <div class="flex items-center gap-2 pt-2" style="border-top:1px solid #f8fafc">
                <input type="text" id="new-checklist-item" class="input flex-1 text-sm" placeholder="Add checklist item…"
                       onkeydown="if(event.key==='Enter'){addChecklistItem(${task.id});event.preventDefault();}" />
                <button class="btn-secondary text-xs shrink-0" onclick="addChecklistItem(${task.id})">
                  <i class="fa-solid fa-plus"></i> Add
                </button>
              </div>` : `<p class="text-xs text-gray-400 mt-2 italic"><i class="fa-solid fa-lock mr-1"></i>Checklist locked</p>`}
            </div>

            <!-- Sub-Tasks -->
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-800 flex items-center gap-2">
                  <i class="fa-solid fa-bars-staggered text-indigo-500"></i> Sub-Tasks
                  <span class="text-xs text-gray-400 font-normal">(${task.subtasks?.length || 0})</span>
                </h3>
                ${!lock.isDone && !lock.isClosed ? `
                <button class="btn-secondary text-xs" onclick="openCreateSubtaskModal(${task.id})">
                  <i class="fa-solid fa-plus"></i> Add Sub-Task
                </button>` : ''}
              </div>
              <div id="subtasks-list">
                ${task.subtasks?.length
                  ? task.subtasks.map(s => `
                      <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-gray-800 cursor-pointer hover:text-indigo-600 truncate"
                               onclick="navigate('manager-task-detail',{id:${s.id}})">${escHtml(s.title)}</div>
                          <div class="flex items-center gap-2 mt-1">
                            ${priorityBadge(s.priority)}
                            ${stageBadge(s.stage_name, s.stage_color)}
                          </div>
                        </div>
                        <div class="text-xs text-gray-400 shrink-0">${escHtml(s.assignee_name || '—')}</div>
                        <div class="text-xs text-gray-400 shrink-0">${formatDate(s.due_date)}</div>
                      </div>`).join('')
                  : `<div class="flex flex-col items-center py-8 text-center">
                       <i class="fa-solid fa-bars-staggered text-2xl text-gray-200 mb-2"></i>
                       <p class="text-sm text-gray-400">No sub-tasks yet</p>
                     </div>`}
              </div>
            </div>

          </div>
        </div>

        <!-- ▸ SECTION: COLLABORATION -->
        <div>
          ${sectionLabel('#f97316', 'fa-solid fa-comments', 'Collaboration')}
          <div class="space-y-4">

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
              ${!lock.isDone && !lock.isClosed ? `
              <div class="flex gap-3 pt-4" style="border-top:1px solid #f1f5f9">
                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  ${avatarInitials(state.user?.name)}
                </div>
                <div class="flex-1">
                  <textarea id="new-comment" class="input text-sm" rows="2" placeholder="Write a comment… Use @name to mention someone"></textarea>
                  <button class="btn-primary text-xs mt-2" onclick="submitComment(${task.id})">
                    <i class="fa-solid fa-paper-plane"></i> Post Comment
                  </button>
                </div>
              </div>` : `<p class="text-xs text-gray-400 italic"><i class="fa-solid fa-lock mr-1"></i>Comments locked</p>`}
            </div>

            <!-- Attachments -->
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-800 flex items-center gap-2">
                  <i class="fa-solid fa-paperclip text-blue-500"></i> Attachments
                  <span class="text-xs text-gray-400 font-normal">(${task.attachments?.length || 0})</span>
                </h3>
                ${!lock.isDone && !lock.isClosed ? `
                <label class="btn-secondary text-xs cursor-pointer">
                  <i class="fa-solid fa-arrow-up-from-bracket"></i> Upload
                  <input type="file" multiple class="hidden" onchange="uploadMgrAttachments(${task.id}, this)" />
                </label>` : ''}
              </div>
              <div id="mgr-attachments-list" class="space-y-2">
                ${(task.attachments || []).length
                  ? (task.attachments || []).map(a => `
                      <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl group" data-attach-id="${a.id}">
                        <div class="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 text-blue-500">
                          ${attachmentIcon(a.mime_type)}
                        </div>
                        <div class="flex-1 min-w-0">
                          <a href="/uploads/attachments/${a.filename}" target="_blank" download="${escHtml(a.original_name)}"
                             class="text-sm font-medium text-gray-800 hover:text-blue-600 truncate block">${escHtml(a.original_name)}</a>
                          <div class="text-xs text-gray-400 mt-0.5">${formatFileSize(a.file_size)} · ${formatDateTime(a.created_at)} · ${escHtml(a.uploader_name)}</div>
                        </div>
                        ${!lock.isDone && !lock.isClosed ? `
                        <button onclick="deleteMgrAttachment(${task.id}, ${a.id}, this)"
                                class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1">
                          <i class="fa-solid fa-trash"></i>
                        </button>` : ''}
                      </div>`).join('')
                  : `<label class="flex flex-col items-center gap-2 py-8 text-center cursor-pointer rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                       <i class="fa-solid fa-cloud-arrow-up text-2xl text-gray-300"></i>
                       <span class="text-sm text-gray-400">Drop files or click to upload</span>
                       ${!lock.isDone && !lock.isClosed ? `<input type="file" multiple class="hidden" onchange="uploadMgrAttachments(${task.id}, this)" />` : ''}
                     </label>`}
              </div>
            </div>

          </div>
        </div>

        <!-- ▸ SECTION: TRACKING -->
        <div>
          ${sectionLabel('#10b981', 'fa-solid fa-clock', 'Tracking')}
          <div class="space-y-4">

            <!-- Time Tracking -->
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-800 flex items-center gap-2">
                  <i class="fa-solid fa-stopwatch text-emerald-500"></i> Time Tracking
                </h3>
                <button class="btn-secondary text-xs" onclick="openLogTimeModal(${task.id})">
                  <i class="fa-solid fa-plus"></i> Log Time
                </button>
              </div>
              <div id="time-logs-list">
                <div class="text-sm text-gray-400 text-center py-4">Loading…</div>
              </div>
            </div>

            <!-- Activity Log -->
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <i class="fa-solid fa-clock-rotate-left text-gray-400"></i> Activity
              </h3>
              <div id="activity-log-list">
                <div class="text-sm text-gray-400 text-center py-4">Loading…</div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- ── Sidebar ────────────────────────────────────────────── -->
      <div class="space-y-4">

        <!-- Task Details -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 flex items-center gap-2" style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-bottom:1px solid #e2e8f0">
            <i class="fa-solid fa-circle-info text-indigo-400 text-xs"></i>
            <h3 class="text-sm font-bold text-gray-700">Task Details</h3>
          </div>
          <div class="p-5 space-y-3 text-sm">
            ${!lock.isClosed ? `
            <div>
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Stage</div>
              <select class="input text-xs" onchange="moveStageFromDetail(${task.id}, this.value)">
                <option value="">No stage</option>
                ${stageOptions}
              </select>
            </div>` : ''}
            ${detailRow('Priority', priorityBadge(task.priority))}
            ${detailRow('Assignee', `<span class="font-semibold text-gray-800">${escHtml(task.assignee_name || '—')}</span>`)}
            ${detailRow('Start Date', `<span class="text-gray-700">${formatDate(task.start_date)}</span>`)}
            ${detailRow('Due Date', `<span class="${isOverdue(task.due_date) ? 'text-red-600 font-semibold' : 'text-gray-700'}">${formatDate(task.due_date)}</span>`)}
            ${detailRow('Project', `<span class="text-gray-700 text-right">${escHtml(task.workflow_name || '—')}</span>`)}
            ${detailRow('Created', `<span class="text-gray-500">${formatDate(task.created_at)}</span>`)}
            ${detailRow('Time Logged', `<span id="total-time-display" class="font-semibold text-gray-700">—</span>`)}
          </div>
        </div>

        <!-- Tags -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 flex items-center justify-between" style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-bottom:1px solid #e2e8f0">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-tags text-blue-400 text-xs"></i>
              <h3 class="text-sm font-bold text-gray-700">Tags</h3>
            </div>
            <button onclick="openTagManager(${task.id})" class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
              <i class="fa-solid fa-pen text-[10px]"></i> Manage
            </button>
          </div>
          <div class="p-4">
            <div class="flex flex-wrap gap-1.5" id="task-tags-display">
              ${(task.tags || []).map(t => tagBadge(t)).join('') || '<span class="text-xs text-gray-400 italic">No tags yet</span>'}
            </div>
          </div>
        </div>

        <!-- Blocked By -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 flex items-center justify-between" style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-bottom:1px solid #e2e8f0">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-link text-rose-400 text-xs"></i>
              <h3 class="text-sm font-bold text-gray-700">Blocked By</h3>
            </div>
            <button onclick="openAddDependencyModal(${task.id})" class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
              <i class="fa-solid fa-plus text-[10px]"></i> Add
            </button>
          </div>
          <div class="p-4">
            <div id="deps-list">
              ${(task.dependencies || []).length
                ? (task.dependencies || []).map(d => `
                    <div class="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 group">
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium text-gray-700 truncate">${escHtml(d.title)}</div>
                        <div class="mt-0.5">${stageBadge(d.stage_name, d.stage_color)}</div>
                      </div>
                      <button onclick="removeDep(${task.id}, ${d.id})"
                              class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-xs">
                        <i class="fa-solid fa-xmark"></i>
                      </button>
                    </div>`).join('')
                : '<p class="text-xs text-gray-400 italic">No blockers</p>'}
            </div>
          </div>
        </div>

        <!-- Custom Fields -->
        ${(task.custom_values || []).length ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 flex items-center gap-2" style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-bottom:1px solid #e2e8f0">
            <i class="fa-solid fa-sliders text-indigo-400 text-xs"></i>
            <h3 class="text-sm font-bold text-gray-700">Custom Fields</h3>
          </div>
          <div class="p-5 space-y-3">
            ${(task.custom_values || []).map(cv => `
              <div>
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                  ${escHtml(cv.name)} ${cv.is_required ? '<span class="text-red-400">*</span>' : ''}
                </label>
                ${renderCustomFieldInput(task.id, cv)}
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- Kudos -->
        ${task.assignee_id ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="kudos-card">
          <div class="px-5 py-3.5 flex items-center gap-2" style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-bottom:1px solid #fde68a">
            <span class="text-base leading-none">🎉</span>
            <h3 class="text-sm font-bold text-amber-800">Kudos</h3>
          </div>
          <div class="p-4">
            <div id="kudos-content" class="mb-3">
              <div class="text-xs text-gray-400 text-center py-2">Loading…</div>
            </div>
            <div class="space-y-2" id="kudos-give-area">
              <input type="text" id="kudos-msg" class="input text-xs"
                     placeholder="Add a message (optional)…" maxlength="200" />
              <button id="kudos-btn" onclick="submitKudos(${task.id})"
                      class="w-full text-sm font-semibold py-2 rounded-xl transition-all"
                      style="background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;border:1px solid #fcd34d">
                🎉 Give Kudos to ${escHtml(task.assignee_name)}
              </button>
            </div>
          </div>
        </div>` : ''}

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
          <div class="text-sm text-gray-600">${renderMentions(c.content).replace(/\n/g, '<br>')}</div>
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

function renderCustomFieldInput(taskId, cv) {
  const val = cv.value != null ? cv.value : '';
  const onchange = `saveCustomFieldValue(${taskId}, ${cv.field_id}, this)`;

  switch (cv.field_type) {
    case 'number':
      return `<input type="number" class="input text-sm" value="${escHtml(val)}" onblur="${onchange}" />`;
    case 'date':
      return `<input type="date" class="input text-sm" value="${escHtml(val)}" onchange="${onchange}" />`;
    case 'checkbox':
      return `<label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" class="rounded text-indigo-600" ${val === '1' || val === 'true' ? 'checked' : ''}
               onchange="saveCustomFieldValue(${taskId}, ${cv.field_id}, {value: this.checked ? '1' : '0'})" />
        <span class="text-sm text-gray-600">Checked</span>
      </label>`;
    case 'select':
      return `<select class="input text-sm" onchange="${onchange}">
        <option value="">— Select —</option>
        ${(cv.options || []).map(opt => `<option value="${escHtml(opt)}" ${val === opt ? 'selected' : ''}>${escHtml(opt)}</option>`).join('')}
      </select>`;
    default: // text
      return `<input type="text" class="input text-sm" value="${escHtml(val)}" onblur="${onchange}" />`;
  }
}

async function saveCustomFieldValue(taskId, fieldId, input) {
  const value = input.value !== undefined ? input.value : input;
  try {
    await api.manager.updateTask(taskId, {
      ..._currentTask,
      custom_values: { [fieldId]: value },
    });
  } catch (err) {
    showToast('Failed to save field: ' + err.message, 'error');
  }
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
    <div class="modal-overlay">
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
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Recurrence</label>
              <select name="recurrence_rule" class="input" id="edit-recurrence-sel"
                      onchange="document.getElementById('edit-recurrence-end-wrap').style.display=this.value!=='none'?'':'none'">
                <option value="none" ${(!task.recurrence_rule || task.recurrence_rule === 'none') ? 'selected' : ''}>Does not repeat</option>
                <option value="daily"   ${task.recurrence_rule === 'daily'   ? 'selected' : ''}>Daily</option>
                <option value="weekly"  ${task.recurrence_rule === 'weekly'  ? 'selected' : ''}>Weekly</option>
                <option value="monthly" ${task.recurrence_rule === 'monthly' ? 'selected' : ''}>Monthly</option>
              </select>
            </div>
            <div id="edit-recurrence-end-wrap" style="display:${task.recurrence_rule && task.recurrence_rule !== 'none' ? '' : 'none'}">
              <label class="label">Recurrence End Date</label>
              <input name="recurrence_end_date" type="date" class="input" value="${task.recurrence_end_date || ''}" />
            </div>
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

function deleteTaskFromDetail(taskId) {
  showConfirm({
    title: 'Delete task?',
    message: 'This task and all its subtasks will be permanently deleted.',
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteTask(taskId);
        showToast('Task deleted');
        navigate('manager-tasks');
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}

function openCreateSubtaskModal(parentId) {
  const parentWorkflowId = _currentTask?.workflow_id;
  const wfOptions   = _currentWorkflows.map(w =>
    `<option value="${w.id}" ${w.id == parentWorkflowId ? 'selected' : ''}>${escHtml(w.name)}</option>`
  ).join('');
  const userOptions = _currentUsers.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('');

  openModal(`
    <div class="modal-overlay">
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

function deleteMgrAttachment(taskId, attachId, btn) {
  showConfirm({
    title: 'Remove attachment?',
    message: 'This file will be permanently deleted.',
    confirmLabel: 'Remove',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteAttachment(taskId, attachId);
        btn.closest('[data-attach-id]')?.remove();
        showToast('Attachment removed');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

// ── Activity Log ──────────────────────────────────────────────────────────────

async function loadAndRenderActivityLog(taskId) {
  try {
    const log = await api.manager.getActivityLog(taskId);
    const el = document.getElementById('activity-log-list');
    if (!el) return;
    if (!log.length) { el.innerHTML = '<p class="text-sm text-gray-400 text-center py-2">No activity yet</p>'; return; }
    el.innerHTML = log.map(entry => `
      <div class="flex gap-3 py-2.5 border-b border-gray-50 last:border-0 animate-fade-in-up">
        <div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0 text-xs font-bold">
          ${avatarInitials(entry.user_name)}
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium text-gray-700">${escHtml(entry.user_name)}</span>
          <span class="text-sm text-gray-500"> — ${escHtml(entry.action)}</span>
          ${entry.detail ? `<div class="text-xs text-gray-400 truncate mt-0.5">${escHtml(entry.detail)}</div>` : ''}
          <div class="text-xs text-gray-400 mt-0.5">${formatDateTime(entry.created_at)}</div>
        </div>
      </div>`).join('');
  } catch {}
}

// ── Tag Manager ───────────────────────────────────────────────────────────────

async function openTagManager(taskId) {
  let allTags = [], taskTags = [];
  try {
    [allTags, { tags: taskTags }] = await Promise.all([
      api.manager.listTags(),
      api.manager.getTask(taskId).then(t => ({ tags: t.tags || [] })),
    ]);
  } catch(err) { showToast(err.message, 'error'); return; }

  const taskTagIds = new Set(taskTags.map(t => t.id));

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box max-w-sm">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900">Manage Tags</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <div class="flex flex-wrap gap-2 min-h-8" id="tag-current">
            ${taskTags.map(t => `
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                    style="background:${t.color}22;color:${t.color};border:1px solid ${t.color}44">
                ${escHtml(t.name)}
                <button onclick="detachTag(${taskId}, ${t.id})" class="ml-0.5 opacity-70 hover:opacity-100">
                  <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
              </span>`).join('') || '<span class="text-xs text-gray-400">No tags on this task</span>'}
          </div>
          <hr/>
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Available Tags</p>
          <div class="flex flex-wrap gap-2">
            ${allTags.filter(t => !taskTagIds.has(t.id)).map(t => `
              <button onclick="attachTag(${taskId}, ${t.id})"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                      style="background:${t.color}22;color:${t.color};border:1px solid ${t.color}44">
                <i class="fa-solid fa-plus text-[10px]"></i> ${escHtml(t.name)}
              </button>`).join('') || '<span class="text-xs text-gray-400">All tags applied</span>'}
          </div>
          <hr/>
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Create New Tag</p>
          <div class="flex items-center gap-2">
            <input id="new-tag-name" type="text" class="input flex-1 text-sm" placeholder="Tag name…" />
            <input id="new-tag-color" type="color" class="w-9 h-9 rounded cursor-pointer border border-gray-300" value="#6366f1" />
            <button onclick="createAndAttachTag(${taskId})" class="btn-primary text-xs shrink-0">Add</button>
          </div>
        </div>
      </div>
    </div>`);
}

async function attachTag(taskId, tagId) {
  try {
    await api.manager.addTagToTask(taskId, tagId);
    showToast('Tag added');
    closeModal();
    await loadTaskDetail(taskId);
  } catch(err) { showToast(err.message, 'error'); }
}

async function detachTag(taskId, tagId) {
  try {
    await api.manager.removeTagFromTask(taskId, tagId);
    showToast('Tag removed');
    closeModal();
    await loadTaskDetail(taskId);
  } catch(err) { showToast(err.message, 'error'); }
}

async function createAndAttachTag(taskId) {
  const name  = document.getElementById('new-tag-name')?.value.trim();
  const color = document.getElementById('new-tag-color')?.value || '#6366f1';
  if (!name) { showToast('Enter a tag name', 'error'); return; }
  try {
    const tag = await api.manager.createTag({ name, color });
    await api.manager.addTagToTask(taskId, tag.id);
    showToast('Tag created & added');
    closeModal();
    await loadTaskDetail(taskId);
  } catch(err) { showToast(err.message, 'error'); }
}

// ── Task Dependencies ─────────────────────────────────────────────────────────

async function openAddDependencyModal(taskId) {
  const tasks = await api.manager.listTasks().catch(() => []);
  const others = tasks.filter(t => t.id !== taskId);

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box max-w-md">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900">Add Blocker Task</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <p class="text-sm text-gray-500">Select a task that must be completed before this one:</p>
          <div class="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-indigo-300">
            <i class="fa-solid fa-magnifying-glass text-gray-400 text-sm"></i>
            <input type="text" id="dep-search" class="flex-1 text-sm outline-none" placeholder="Search tasks…"
                   oninput="filterDepList(this.value)" />
          </div>
          <div id="dep-list" class="max-h-72 overflow-y-auto space-y-1">
            ${others.map(t => `
              <div class="dep-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors"
                   data-title="${escHtml(t.title).toLowerCase()}"
                   onclick="selectDep(${taskId}, ${t.id})">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800 truncate">${escHtml(t.title)}</div>
                  <div class="flex items-center gap-1.5 mt-0.5">${stageBadge(t.stage_name, t.stage_color)} <span class="text-xs text-gray-400">${escHtml(t.workflow_name||'')}</span></div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`);
}

function filterDepList(q) {
  document.querySelectorAll('.dep-item').forEach(el => {
    el.style.display = el.dataset.title.includes(q.toLowerCase()) ? '' : 'none';
  });
}

async function selectDep(taskId, depId) {
  try {
    await api.manager.addDependency(taskId, depId);
    showToast('Blocker added');
    closeModal();
    await loadTaskDetail(taskId);
  } catch(err) { showToast(err.message, 'error'); }
}

async function removeDep(taskId, depId) {
  try {
    await api.manager.removeDependency(taskId, depId);
    showToast('Blocker removed');
    await loadTaskDetail(taskId);
  } catch(err) { showToast(err.message, 'error'); }
}

// ── Time Tracking ─────────────────────────────────────────────────────────────

function formatMinutes(m) {
  if (!m) return '0h 0m';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

async function loadTimeLogs(taskId) {
  try {
    const logs = await api.manager.listTimeLogs(taskId);
    const el = document.getElementById('time-logs-list');
    const totalEl = document.getElementById('total-time-display');
    if (!el) return;

    const totalMins = logs.reduce((s, l) => s + (parseInt(l.minutes) || 0), 0);
    if (totalEl) totalEl.textContent = formatMinutes(totalMins);

    if (!logs.length) {
      el.innerHTML = '<p class="text-sm text-gray-400 text-center py-2">No time logged yet</p>';
      return;
    }
    el.innerHTML = logs.map(l => `
      <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 group">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
             style="background:linear-gradient(135deg,#6366f1,#3b82f6)">${avatarInitials(l.user_name)}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-indigo-600">${formatMinutes(l.minutes)}</span>
            <span class="text-xs text-gray-400">${l.user_name}</span>
          </div>
          ${l.description ? `<div class="text-xs text-gray-500 truncate mt-0.5">${escHtml(l.description)}</div>` : ''}
          <div class="text-xs text-gray-400 mt-0.5">${formatDate(l.logged_date)}</div>
        </div>
        <button onclick="deleteTimeLog(${taskId}, ${l.id})"
                class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`).join('');
  } catch {}
}

function openLogTimeModal(taskId) {
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box max-w-sm">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900"><i class="fa-solid fa-clock text-indigo-500 mr-2"></i>Log Time</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Hours</label>
              <input id="log-hours" type="number" min="0" max="24" class="input" placeholder="0" value="0" />
            </div>
            <div>
              <label class="label">Minutes <span class="text-red-500">*</span></label>
              <input id="log-mins" type="number" min="0" max="59" class="input" placeholder="30" value="30" required />
            </div>
          </div>
          <div>
            <label class="label">Date</label>
            <input id="log-date" type="date" class="input" value="${new Date().toISOString().split('T')[0]}" />
          </div>
          <div>
            <label class="label">Description <span class="text-gray-400 font-normal text-xs">(optional)</span></label>
            <input id="log-desc" type="text" class="input" placeholder="What did you work on?" />
          </div>
          <div id="log-time-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="submitTimeLog(${taskId})">
              <i class="fa-solid fa-check"></i> Log Time
            </button>
          </div>
        </div>
      </div>
    </div>`);
}

async function submitTimeLog(taskId) {
  const hours   = parseInt(document.getElementById('log-hours')?.value || '0');
  const mins    = parseInt(document.getElementById('log-mins')?.value  || '0');
  const total   = hours * 60 + mins;
  const date    = document.getElementById('log-date')?.value;
  const desc    = document.getElementById('log-desc')?.value;
  const errEl   = document.getElementById('log-time-error');
  if (total <= 0) { errEl.textContent = 'Please enter a time greater than 0'; errEl.classList.remove('hidden'); return; }
  try {
    await api.manager.addTimeLog(taskId, { minutes: total, logged_date: date, description: desc });
    showToast(`${formatMinutes(total)} logged!`);
    closeModal();
    await loadTimeLogs(taskId);
  } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function deleteTimeLog(taskId, logId) {
  try {
    await api.manager.deleteTimeLog(taskId, logId);
    showToast('Log removed');
    await loadTimeLogs(taskId);
  } catch(err) { showToast(err.message, 'error'); }
}

// ── @Mention Autocomplete ─────────────────────────────────────────────────────

function initMentionAutocomplete(textareaId, users) {
  const ta = document.getElementById(textareaId);
  if (!ta || !users?.length) return;

  let dropdown = null;

  ta.addEventListener('input', () => {
    const val = ta.value;
    const cursor = ta.selectionStart;
    const textBefore = val.substring(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);

    if (dropdown) { dropdown.remove(); dropdown = null; }
    if (!atMatch) return;

    const query = atMatch[1].toLowerCase();
    const matches = users.filter(u => u.name.toLowerCase().includes(query)).slice(0, 5);
    if (!matches.length) return;

    dropdown = document.createElement('div');
    dropdown.className = 'absolute z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden';
    dropdown.style.cssText = 'min-width:200px;max-width:280px';

    matches.forEach(u => {
      const item = document.createElement('div');
      item.className = 'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-indigo-50 transition-colors';
      item.innerHTML = `
        <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
             style="background:linear-gradient(135deg,#6366f1,#3b82f6)">${avatarInitials(u.name)}</div>
        <span class="text-sm font-medium text-gray-700">${u.name}</span>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const start  = textBefore.lastIndexOf('@');
        const before = val.substring(0, start);
        const after  = val.substring(cursor);
        ta.value = before + '@' + u.name + ' ' + after;
        ta.focus();
        if (dropdown) { dropdown.remove(); dropdown = null; }
      });
      dropdown.appendChild(item);
    });

    const rect = ta.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
    dropdown.style.left = (rect.left  + window.scrollX) + 'px';
    document.body.appendChild(dropdown);
  });

  document.addEventListener('click', () => { if (dropdown) { dropdown.remove(); dropdown = null; } }, { capture: true });
}

// ── Checklist ─────────────────────────────────────────────────────────────────

function checklistPct(items) {
  if (!items || !items.length) return 0;
  const done = items.filter(i => +i.is_done).length;
  return Math.round((done / items.length) * 100);
}

function checklistProgressText(items) {
  if (!items || !items.length) return '';
  const done = items.filter(i => +i.is_done).length;
  return `${done} of ${items.length} done`;
}

function renderChecklistItems(items, taskId, locked = false) {
  if (!items || !items.length) {
    return '<p class="text-sm text-gray-400 italic py-2">No checklist items yet</p>';
  }
  return items.map(item => `
    <div class="flex items-center gap-2 py-1.5 group" data-checklist-id="${item.id}">
      <input type="checkbox" class="w-4 h-4 rounded accent-indigo-600 shrink-0 ${locked ? '' : 'cursor-pointer'}"
             ${+item.is_done ? 'checked' : ''}
             ${locked ? 'disabled' : `onchange="toggleChecklistItem(${taskId}, ${item.id}, this.checked)"`} />
      <span class="flex-1 text-sm ${+item.is_done ? 'line-through text-gray-400' : 'text-gray-700'}">${escHtml(item.title)}</span>
      ${locked ? '' : `
      <button onclick="deleteChecklistItem(${taskId}, ${item.id})"
              class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1 shrink-0">
        <i class="fa-solid fa-xmark"></i>
      </button>`}
    </div>`).join('');
}

function updateChecklistUI(items) {
  const pct = checklistPct(items);
  const progressWrap = document.getElementById('checklist-progress-wrap');
  const progressBar  = document.getElementById('checklist-progress-bar');
  const progressText = document.getElementById('checklist-progress-text');
  const countEl      = document.getElementById('checklist-count');
  if (progressWrap) progressWrap.classList.toggle('hidden', items.length === 0);
  if (progressBar)  progressBar.style.width = pct + '%';
  if (progressText) progressText.textContent = checklistProgressText(items);
  if (countEl)      countEl.textContent = `(${items.length})`;
}

async function addChecklistItem(taskId) {
  const input = document.getElementById('new-checklist-item');
  const title = input?.value?.trim();
  if (!title) return;
  try {
    const user = state.user || {};
    const apiObj = user.role === 'manager' ? api.manager : api.employee;
    await apiObj.createSubtask(taskId, { title });
    input.value = '';
    // Reload task detail to refresh checklist
    await loadTaskDetail(taskId);
  } catch (err) { showToast(err.message, 'error'); }
}

async function toggleChecklistItem(taskId, subtaskId, isDone) {
  try {
    const user = state.user || {};
    const apiObj = user.role === 'manager' ? api.manager : api.employee;
    await apiObj.updateSubtask(taskId, subtaskId, { is_done: isDone ? 1 : 0 });
    // Update UI locally
    const row = document.querySelector(`[data-checklist-id="${subtaskId}"]`);
    if (row) {
      const span = row.querySelector('span');
      if (span) span.className = `flex-1 text-sm ${isDone ? 'line-through text-gray-400' : 'text-gray-700'}`;
    }
    // Recalculate progress
    const allChecks = Array.from(document.querySelectorAll('[data-checklist-id]'));
    const items = allChecks.map(el => ({
      id: +el.dataset.checklistId,
      is_done: el.querySelector('input[type=checkbox]')?.checked ? 1 : 0,
    }));
    updateChecklistUI(items);
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteChecklistItem(taskId, subtaskId) {
  try {
    const user = state.user || {};
    const apiObj = user.role === 'manager' ? api.manager : api.employee;
    await apiObj.deleteSubtask(taskId, subtaskId);
    document.querySelector(`[data-checklist-id="${subtaskId}"]`)?.remove();
    // Recalculate progress
    const allChecks = Array.from(document.querySelectorAll('[data-checklist-id]'));
    const items = allChecks.map(el => ({
      id: +el.dataset.checklistId,
      is_done: el.querySelector('input[type=checkbox]')?.checked ? 1 : 0,
    }));
    updateChecklistUI(items);
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Duplicate Task ────────────────────────────────────────────────────────────

function duplicateTask(taskId) {
  showConfirm({
    title: 'Duplicate task?',
    message: 'A copy of this task will be created.',
    confirmLabel: 'Duplicate',
    confirmClass: 'btn-primary',
    onConfirm: async () => {
      try {
        const user = state.user || {};
        const apiObj = user.role === 'manager' ? api.manager : api.employee;
        const data = await apiObj.duplicateTask(taskId);
        showToast('Task duplicated!', 'success');
        navigate(user.role === 'manager' ? 'manager-task-detail' : 'employee-task-detail', { id: data.data.id });
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}

// ── Save as Template ──────────────────────────────────────────────────────────

function saveCurrentTaskAsTemplate(taskId) {
  const taskTitle = _currentTask?.title || '';
  const overlay = document.createElement('div');
  overlay.id = 'save-task-tpl-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box max-w-sm animate-fade-in-up" style="padding:28px">
      <h3 class="font-semibold text-gray-900 mb-1">Save as Task Template</h3>
      <p class="text-sm text-gray-500 mb-4">Enter a name for this template.</p>
      <input id="save-task-tpl-name" type="text" class="input mb-4" value="Template: ${escHtml(taskTitle)}" placeholder="Template name" />
      <div class="flex gap-2 justify-end">
        <button class="btn-secondary" onclick="document.getElementById('save-task-tpl-overlay').remove()">Cancel</button>
        <button class="btn-primary" onclick="confirmSaveTaskTemplate(${taskId})"><i class="fa-solid fa-floppy-disk"></i> Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { const inp = document.getElementById('save-task-tpl-name'); if (inp) { inp.focus(); inp.select(); } }, 50);
}

async function confirmSaveTaskTemplate(taskId) {
  const name = document.getElementById('save-task-tpl-name')?.value.trim();
  if (!name) { showToast('Please enter a template name', 'error'); return; }
  document.getElementById('save-task-tpl-overlay')?.remove();
  try {
    await api.manager.saveTaskAsTemplate(taskId, { template_name: name });
    showToast('Saved as template!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Kudos ─────────────────────────────────────────────────────────────────────

async function loadKudos(taskId) {
  const card = document.getElementById('kudos-content');
  if (!card) return;
  try {
    const { kudos, has_given } = await api.manager.getTaskKudos(taskId);
    renderKudosContent(kudos, has_given, taskId);
  } catch (_) {
    const el = document.getElementById('kudos-content');
    if (el) el.innerHTML = '';
  }
}

function renderKudosContent(kudos, hasGiven, taskId) {
  const contentEl = document.getElementById('kudos-content');
  const giveArea  = document.getElementById('kudos-give-area');
  if (!contentEl) return;

  if (!kudos.length) {
    contentEl.innerHTML = `<p class="text-xs text-gray-400 italic text-center py-1">No kudos yet — be the first!</p>`;
  } else {
    contentEl.innerHTML = kudos.map(k => `
      <div class="flex items-start gap-2 mb-2">
        <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
             style="background:linear-gradient(135deg,#f97316,#f59e0b)">
          ${avatarInitials(k.giver_name)}
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-xs font-semibold text-gray-700">${escHtml(k.giver_name)}</span>
          <span class="text-[11px] text-gray-400 ml-1">${formatDateTime(k.created_at)}</span>
          ${k.message ? `<p class="text-xs text-gray-600 mt-0.5 italic">"${escHtml(k.message)}"</p>` : ''}
        </div>
        <span class="text-base leading-none shrink-0">🎉</span>
      </div>`).join('');
  }

  // Update button state
  const btn = document.getElementById('kudos-btn');
  if (btn && hasGiven) {
    btn.disabled = true;
    btn.textContent = '🎉 Kudos Given!';
    btn.style.background = '#f0fdf4';
    btn.style.color = '#16a34a';
    btn.style.borderColor = '#86efac';
    btn.style.cursor = 'not-allowed';
  }
}

async function submitKudos(taskId) {
  const btn     = document.getElementById('kudos-btn');
  const message = document.getElementById('kudos-msg')?.value.trim() || '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await api.manager.giveKudos(taskId, message);
    if (document.getElementById('kudos-msg')) document.getElementById('kudos-msg').value = '';
    const { kudos, has_given } = await api.manager.getTaskKudos(taskId);
    renderKudosContent(kudos, has_given, taskId);
    showToast('Kudos sent! 🎉', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🎉 Give Kudos'; }
  }
}
