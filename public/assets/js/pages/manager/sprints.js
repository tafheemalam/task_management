let _sprints = [];
let _sprintWorkflows = [];
let _sprintDetail = null;
let _burndownChartInst = null;
let _addTasksAll = [];
let _addTasksSprintId = null;

// ── Page Entry ─────────────────────────────────────────────────────────────────

async function renderSprints() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6 animate-fade-in-up">
      ${pageHeader(
        'Sprint Planning',
        'Organise tasks into time-boxed sprints',
        `<button class="btn-primary" onclick="openSprintModal()">
           <i class="fa-solid fa-plus"></i> New Sprint
         </button>`
      )}
      <div id="sprint-content">${skeletonCards(3)}</div>
    </div>`);
  await loadSprints();
}

async function loadSprints() {
  try {
    const [sprintsResp, workflowsResp] = await Promise.all([
      api.manager.listSprints(),
      api.manager.listWorkflows(),
    ]);
    _sprints = sprintsResp.data || [];
    _sprintWorkflows = workflowsResp || [];
    renderSprintListView();
  } catch (err) {
    document.getElementById('sprint-content').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

// ── Sprint List View ───────────────────────────────────────────────────────────

function renderSprintListView() {
  if (_burndownChartInst) { _burndownChartInst.destroy(); _burndownChartInst = null; }
  _sprintDetail = null;
  const content = document.getElementById('sprint-content');
  if (!content) return;

  if (_sprints.length === 0) {
    content.innerHTML = emptyState(
      'fa-flag', 'No sprints yet',
      'Create your first sprint to organise tasks into time-boxed iterations.',
      `<button class="btn-primary" onclick="openSprintModal()"><i class="fa-solid fa-plus"></i> New Sprint</button>`
    );
    return;
  }

  const groups = {
    active:    _sprints.filter(s => s.status === 'active'),
    planning:  _sprints.filter(s => s.status === 'planning'),
    completed: _sprints.filter(s => s.status === 'completed'),
  };

  let html = '';
  if (groups.active.length)    html += sprintGroup('Active',    groups.active,    'green');
  if (groups.planning.length)  html += sprintGroup('Planning',  groups.planning,  'blue');
  if (groups.completed.length) html += sprintGroup('Completed', groups.completed, 'gray');
  content.innerHTML = html;
}

function sprintGroup(label, sprints, color) {
  const cls = {
    green: 'text-green-700 bg-green-50 border-green-200',
    blue:  'text-blue-700 bg-blue-50 border-blue-200',
    gray:  'text-gray-600 bg-gray-50 border-gray-200',
  };
  return `
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls[color]}">${label}</span>
        <span class="text-xs text-gray-400">${sprints.length} sprint${sprints.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="space-y-3">${sprints.map(sprintCard).join('')}</div>
    </div>`;
}

function sprintCard(s) {
  const total     = parseInt(s.total_tasks)     || 0;
  const completed = parseInt(s.completed_tasks) || 0;
  const pct       = total > 0 ? Math.round(completed / total * 100) : 0;
  const today     = new Date().toISOString().split('T')[0];
  const overdue   = s.end_date < today && s.status === 'active';

  return `
    <div class="card border ${overdue ? 'border-orange-200' : 'border-gray-100'}">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <h3 class="font-semibold text-gray-900">${spEsc(s.name)}</h3>
            ${sprintStatusBadge(s.status)}
            ${overdue ? '<span class="text-xs text-orange-600 font-medium"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Overdue</span>' : ''}
          </div>
          ${s.goal ? `<p class="text-sm text-gray-500 mb-2 line-clamp-1">${spEsc(s.goal)}</p>` : ''}
          <div class="flex flex-wrap items-center gap-4 text-xs text-gray-400 mb-3">
            <span><i class="fa-regular fa-calendar mr-1"></i>${formatDate(s.start_date)} → ${formatDate(s.end_date)}</span>
            ${s.workflow_name ? `<span><i class="fa-solid fa-diagram-project mr-1"></i>${spEsc(s.workflow_name)}</span>` : ''}
          </div>
          <div>
            <div class="flex justify-between text-xs text-gray-500 mb-1">
              <span>${completed} / ${total} tasks completed</span>
              <span class="font-semibold">${pct}%</span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-500"
                   style="width:${pct}%;background:linear-gradient(90deg,#6366f1,#3b82f6)"></div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button class="btn-secondary text-xs" onclick="openSprintDetail(${s.id})">
            <i class="fa-solid fa-arrow-right"></i> View
          </button>
          <button class="btn-secondary text-xs" onclick="openSprintModal(${s.id})">
            <i class="fa-regular fa-pen-to-square"></i>
          </button>
          <button class="btn-danger text-xs" onclick="confirmDeleteSprint(${s.id})">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </div>
    </div>`;
}

// ── Sprint Detail View ─────────────────────────────────────────────────────────

async function openSprintDetail(sprintId) {
  const sprint = _sprints.find(s => s.id == sprintId);
  if (!sprint) return;
  _sprintDetail = sprint;

  const content = document.getElementById('sprint-content');
  content.innerHTML = `
    <div class="mb-4">
      <button class="btn-secondary text-sm" onclick="renderSprintListView()">
        <i class="fa-solid fa-arrow-left"></i> All Sprints
      </button>
    </div>
    <div id="sprint-detail-body">${skeletonCards(3)}</div>`;

  try {
    const [tasksResp, burndownResp] = await Promise.all([
      api.manager.listSprintTasks(sprintId),
      api.manager.sprintBurndown(sprintId),
    ]);
    renderSprintDetailBody(sprint, tasksResp.data || [], burndownResp);
  } catch (err) {
    document.getElementById('sprint-detail-body').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

function renderSprintDetailBody(sprint, tasks, burndown) {
  if (_burndownChartInst) { _burndownChartInst.destroy(); _burndownChartInst = null; }

  const completed = tasks.filter(t => /done|complet|closed/i.test(t.stage_name || '')).length;
  const pct       = tasks.length > 0 ? Math.round(completed / tasks.length * 100) : 0;

  document.getElementById('sprint-detail-body').innerHTML = `
    <!-- Sprint header card -->
    <div class="card mb-5">
      <div class="flex flex-wrap items-start gap-4 justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <h2 class="text-lg font-bold text-gray-900">${spEsc(sprint.name)}</h2>
            ${sprintStatusBadge(sprint.status)}
          </div>
          ${sprint.goal ? `<p class="text-sm text-gray-500 mb-2">${spEsc(sprint.goal)}</p>` : ''}
          <div class="flex flex-wrap items-center gap-4 text-xs text-gray-400">
            <span><i class="fa-regular fa-calendar mr-1"></i>${formatDate(sprint.start_date)} → ${formatDate(sprint.end_date)}</span>
            ${sprint.workflow_name ? `<span><i class="fa-solid fa-diagram-project mr-1"></i>${spEsc(sprint.workflow_name)}</span>` : ''}
          </div>
        </div>
        <button class="btn-secondary text-sm" onclick="openSprintModal(${sprint.id})">
          <i class="fa-regular fa-pen-to-square"></i> Edit
        </button>
      </div>
      <div class="mt-4">
        <div class="flex justify-between text-sm text-gray-500 mb-1.5">
          <span>${completed} / ${tasks.length} tasks completed</span>
          <span class="font-semibold">${pct}%</span>
        </div>
        <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all"
               style="width:${pct}%;background:linear-gradient(90deg,#6366f1,#3b82f6)"></div>
        </div>
      </div>
    </div>

    <!-- Tasks + Burndown -->
    <div class="grid lg:grid-cols-5 gap-6">
      <!-- Task list -->
      <div class="lg:col-span-3">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-800">
            Tasks <span class="text-gray-400 font-normal text-sm">(${tasks.length})</span>
          </h3>
          <button class="btn-primary text-sm" onclick="openAddTasksModal(${sprint.id})">
            <i class="fa-solid fa-plus"></i> Add Tasks
          </button>
        </div>
        <div id="sprint-task-list">
          ${tasks.length === 0
            ? `<div class="card text-center py-10 text-gray-400 text-sm">
                 No tasks in this sprint yet.
                 <button class="btn-primary text-xs mt-3 mx-auto flex" onclick="openAddTasksModal(${sprint.id})">
                   <i class="fa-solid fa-plus"></i> Add Tasks
                 </button>
               </div>`
            : tasks.map(t => sprintTaskRow(t, sprint.id)).join('')}
        </div>
      </div>

      <!-- Burndown chart -->
      <div class="lg:col-span-2">
        <div class="card">
          <h3 class="font-semibold text-gray-800 mb-0.5">Burndown Chart</h3>
          <p class="text-xs text-gray-400 mb-4">Tasks remaining vs ideal pace</p>
          <div id="burndown-wrap">
            ${burndown.data && burndown.data.length > 0
              ? `<canvas id="burndown-chart" height="220"></canvas>`
              : `<div class="text-center py-10 text-gray-400 text-sm">
                   Add tasks and mark them complete to see the burndown.
                 </div>`}
          </div>
        </div>
      </div>
    </div>`;

  if (burndown.data && burndown.data.length > 0) {
    requestAnimationFrame(() => renderBurndownChart(burndown));
  }
}

function sprintTaskRow(t, sprintId) {
  const done = /done|complet|closed/i.test(t.stage_name || '');
  return `
    <div class="card mb-2 flex items-start gap-3 ${done ? 'opacity-60' : ''}">
      <div class="mt-0.5 shrink-0">
        ${done
          ? '<i class="fa-solid fa-circle-check text-green-500"></i>'
          : '<i class="fa-regular fa-circle text-gray-300"></i>'}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-medium text-gray-800 ${done ? 'line-through' : ''} cursor-pointer hover:text-indigo-600"
                onclick="navigate('manager-task-detail',{id:${t.id}})">${spEsc(t.title)}</span>
          ${priorityBadge(t.priority)}
        </div>
        <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-400">
          ${stageBadge(t.stage_name, t.stage_color)}
          ${t.assignee_name ? `<span><i class="fa-solid fa-user mr-1"></i>${spEsc(t.assignee_name)}</span>` : ''}
          ${t.project_name  ? `<span><i class="fa-solid fa-diagram-project mr-1"></i>${spEsc(t.project_name)}</span>` : ''}
          ${t.due_date      ? `<span class="${isOverdue(t.due_date) && !done ? 'text-red-500 font-medium' : ''}">
                                 <i class="fa-regular fa-calendar mr-1"></i>${formatDate(t.due_date)}
                               </span>` : ''}
        </div>
      </div>
      <button class="text-gray-300 hover:text-red-400 transition-colors shrink-0 p-1 mt-0.5"
              title="Remove from sprint"
              onclick="spRemoveTask(${sprintId},${t.id},this)">
        <i class="fa-solid fa-xmark text-sm"></i>
      </button>
    </div>`;
}

// ── Burndown Chart ─────────────────────────────────────────────────────────────

function renderBurndownChart(burndown) {
  const ctx = document.getElementById('burndown-chart');
  if (!ctx) return;
  if (_burndownChartInst) { _burndownChartInst.destroy(); }

  _burndownChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: burndown.data.map(d => {
        const dt = new Date(d.date + 'T00:00:00');
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          label: 'Actual',
          data: burndown.data.map(d => d.remaining),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.08)',
          borderWidth: 2.5,
          pointRadius: 3,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Ideal',
          data: burndown.data.map(d => d.ideal),
          borderColor: '#94a3b8',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        x: { ticks: { font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

// ── Add Tasks Modal ────────────────────────────────────────────────────────────

async function openAddTasksModal(sprintId) {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box max-w-2xl" style="max-height:85vh;display:flex;flex-direction:column">
        <div class="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 class="font-semibold text-gray-900">Add Tasks to Sprint</h2>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div class="p-4 border-b border-gray-100">
          <input type="text" id="add-tasks-search" class="input" placeholder="Search tasks…"
                 oninput="spFilterTasks(${sprintId})">
        </div>
        <div id="add-tasks-list" class="p-4 overflow-y-auto flex-1 space-y-2">
          <div class="text-center py-6 text-gray-400">
            <i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading…
          </div>
        </div>
      </div>
    </div>`);

  try {
    const [allResp, sprintResp] = await Promise.all([
      api.manager.listTasks({ per_page: 200 }),
      api.manager.listSprintTasks(sprintId),
    ]);
    const sprintIds = new Set((sprintResp.data || []).map(t => t.id));
    _addTasksAll = (allResp.data || []).filter(t => !sprintIds.has(t.id));
    _addTasksSprintId = sprintId;
    spRenderAddList(_addTasksAll, sprintId);
  } catch (err) {
    document.getElementById('add-tasks-list').innerHTML =
      `<div class="text-center text-red-500 py-4">${err.message}</div>`;
  }
}

function spFilterTasks(sprintId) {
  const q = (document.getElementById('add-tasks-search')?.value || '').toLowerCase();
  const filtered = q ? _addTasksAll.filter(t => t.title.toLowerCase().includes(q)) : _addTasksAll;
  spRenderAddList(filtered, sprintId);
}

function spRenderAddList(tasks, sprintId) {
  const el = document.getElementById('add-tasks-list');
  if (!el) return;
  if (!tasks.length) {
    el.innerHTML = `<div class="text-center text-gray-400 py-6">No tasks available to add</div>`;
    return;
  }
  el.innerHTML = tasks.map(t => `
    <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-gray-800 truncate">${spEsc(t.title)}</div>
        <div class="flex items-center gap-2 mt-0.5">
          ${priorityBadge(t.priority)}
          ${stageBadge(t.stage_name, t.stage_color)}
          ${t.workflow_name ? `<span class="text-xs text-gray-400">${spEsc(t.workflow_name)}</span>` : ''}
        </div>
      </div>
      <button id="add-btn-${t.id}" class="btn-primary text-xs shrink-0"
              onclick="spAddTask(${sprintId},${t.id},this)">
        <i class="fa-solid fa-plus"></i> Add
      </button>
    </div>`).join('');
}

async function spAddTask(sprintId, taskId, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
  try {
    await api.manager.addSprintTask(sprintId, taskId);
    btn.closest('div.flex').remove();
    _addTasksAll = _addTasksAll.filter(t => t.id !== taskId);
    showToast('Task added to sprint');
    // Refresh sprint list stats in background
    api.manager.listSprints().then(r => { _sprints = r.data || []; }).catch(() => {});
    // If detail is open for this sprint, reload it
    if (_sprintDetail && _sprintDetail.id == sprintId) {
      const [tasksResp, burndownResp] = await Promise.all([
        api.manager.listSprintTasks(sprintId),
        api.manager.sprintBurndown(sprintId),
      ]);
      renderSprintDetailBody(_sprintDetail, tasksResp.data || [], burndownResp);
    }
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
  }
}

async function spRemoveTask(sprintId, taskId, btn) {
  btn.disabled = true;
  try {
    await api.manager.removeSprintTask(sprintId, taskId);
    btn.closest('.card').remove();
    showToast('Task removed from sprint');
    api.manager.listSprints().then(r => { _sprints = r.data || []; }).catch(() => {});
    // Refresh burndown
    api.manager.sprintBurndown(sprintId).then(bd => {
      if (bd.data && bd.data.length > 0) {
        requestAnimationFrame(() => renderBurndownChart(bd));
      }
    }).catch(() => {});
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
}

// ── Sprint Modal (Create / Edit) ───────────────────────────────────────────────

function openSprintModal(sprintId = null) {
  const sprint = sprintId ? _sprints.find(s => s.id == sprintId) : null;
  const isEdit = !!sprint;

  const wfOptions = _sprintWorkflows.map(w =>
    `<option value="${w.id}" ${sprint?.workflow_id == w.id ? 'selected' : ''}>${spEsc(w.name)}</option>`
  ).join('');
  const statusOptions = ['planning', 'active', 'completed'].map(st =>
    `<option value="${st}" ${(sprint?.status || 'planning') === st ? 'selected' : ''}>
       ${st.charAt(0).toUpperCase() + st.slice(1)}
     </option>`
  ).join('');

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box animate-fade-in-up">
        <div class="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 class="font-semibold text-gray-900">${isEdit ? 'Edit Sprint' : 'New Sprint'}</h2>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="label">Sprint Name <span class="text-red-400">*</span></label>
            <input id="sp-name" class="input" placeholder="e.g. Sprint 1" value="${spEsc(sprint?.name || '')}">
          </div>
          <div>
            <label class="label">Goal <span class="text-gray-400 font-normal text-xs">(optional)</span></label>
            <input id="sp-goal" class="input" placeholder="What do you want to achieve in this sprint?"
                   value="${spEsc(sprint?.goal || '')}">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Start Date <span class="text-red-400">*</span></label>
              <input id="sp-start" type="date" class="input" value="${sprint?.start_date || ''}">
            </div>
            <div>
              <label class="label">End Date <span class="text-red-400">*</span></label>
              <input id="sp-end" type="date" class="input" value="${sprint?.end_date || ''}">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Status</label>
              <select id="sp-status" class="input">${statusOptions}</select>
            </div>
            <div>
              <label class="label">Project <span class="text-gray-400 font-normal text-xs">(optional)</span></label>
              <select id="sp-workflow" class="input">
                <option value="">All projects</option>
                ${wfOptions}
              </select>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button id="sp-save-btn" class="btn-primary" onclick="saveSprint(${sprintId || 'null'})">
            <i class="fa-solid fa-check"></i> ${isEdit ? 'Save Changes' : 'Create Sprint'}
          </button>
        </div>
      </div>
    </div>`);
}

async function saveSprint(sprintId) {
  const name  = document.getElementById('sp-name')?.value.trim();
  const start = document.getElementById('sp-start')?.value;
  const end   = document.getElementById('sp-end')?.value;
  if (!name)       { showToast('Sprint name is required', 'error'); return; }
  if (!start)      { showToast('Start date is required', 'error'); return; }
  if (!end)        { showToast('End date is required', 'error'); return; }
  if (end < start) { showToast('End date must be after start date', 'error'); return; }

  const payload = {
    name,
    goal:        document.getElementById('sp-goal')?.value.trim() || null,
    start_date:  start,
    end_date:    end,
    status:      document.getElementById('sp-status')?.value || 'planning',
    workflow_id: document.getElementById('sp-workflow')?.value || null,
  };

  const btn = document.getElementById('sp-save-btn');
  setButtonLoading(btn, true);
  try {
    if (sprintId) {
      await api.manager.updateSprint(sprintId, payload);
      showToast('Sprint updated');
    } else {
      await api.manager.createSprint(payload);
      showToast('Sprint created');
    }
    closeModal();
    await loadSprints();
  } catch (err) {
    showToast(err.message, 'error');
    setButtonLoading(btn, false);
  }
}

async function confirmDeleteSprint(id) {
  const sprint = _sprints.find(s => s.id == id);
  showConfirm({
    title: 'Delete Sprint',
    message: `Delete "${spEsc(sprint?.name || 'this sprint')}"? Tasks will not be deleted.`,
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteSprint(id);
        showToast('Sprint deleted');
        if (_sprintDetail?.id == id) _sprintDetail = null;
        await loadSprints();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sprintStatusBadge(status) {
  const map = {
    active:    'bg-green-100 text-green-700',
    planning:  'bg-blue-100 text-blue-700',
    completed: 'bg-gray-100 text-gray-600',
  };
  const label = (status || 'planning');
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[label] || map.planning}">${label.charAt(0).toUpperCase() + label.slice(1)}</span>`;
}

function spEsc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
