async function renderManagerWorkflows() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Projects', 'Manage your company projects and team members', `
        <div class="flex items-center gap-2">
          <button class="btn-secondary" onclick="openNewProjectFromTemplateModal()">
            <i class="fa-solid fa-wand-magic-sparkles"></i> New from Template
          </button>
          <button class="btn-primary" onclick="openCreateWorkflowModal()">
            <i class="fa-solid fa-plus"></i> New Project
          </button>
        </div>`)}
      <div id="workflows-container">${skeletonCards(3)}</div>
    </div>`);
  await loadWorkflows();
}

let _workflows = [];

async function loadWorkflows() {
  try {
    _workflows = await api.manager.listWorkflows();
    renderWorkflows();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderWorkflows() {
  const el = document.getElementById('workflows-container');
  if (!_workflows.length) { el.innerHTML = emptyState('fa-diagram-project', 'No projects yet', 'Create your first project to get started', `<button class="btn-primary" onclick="openCreateWorkflowModal()"><i class="fa-solid fa-plus"></i> New Project</button>`); return; }
  el.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">${_workflows.map(wf => wfCard(wf)).join('')}</div>`;
}

function wfCard(wf) {
  const members  = wf.members || [];
  const stages   = wf.stages  || [];
  const accent   = stages[0]?.color || '#6366f1';
  const accentEnd= stages[stages.length - 1]?.color || accent;

  const memberAvatars = members.slice(0, 5).map((m, i) => `
    <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold border-2 border-white shrink-0"
         style="background:linear-gradient(135deg,#6366f1,#3b82f6);${i > 0 ? 'margin-left:-10px' : ''}"
         title="${escHtml(m.name)}">${avatarInitials(m.name)}</div>`).join('');
  const extraCount = members.length > 5
    ? `<div class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold border-2 border-white shrink-0" style="margin-left:-10px">+${members.length - 5}</div>`
    : '';

  return `
    <div class="bg-white rounded-2xl overflow-hidden transition-shadow hover:shadow-lg ${!wf.is_active ? 'opacity-60' : ''}"
         style="box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid rgba(226,232,240,0.8)">

      <!-- Gradient accent bar -->
      <div class="h-1.5" style="background:linear-gradient(90deg,${accent},${accentEnd})"></div>

      <div class="p-5">
        <!-- Header -->
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                 style="background:${accent}18;color:${accent}">
              <i class="fa-solid fa-diagram-project text-lg"></i>
            </div>
            <div>
              <div class="font-bold text-gray-900 text-base leading-snug">${escHtml(wf.name)}</div>
              <div class="flex items-center gap-2 mt-0.5">
                ${statusDot(wf.is_active)}
                <span class="text-xs text-gray-400">${stages.length} stage${stages.length !== 1 ? 's' : ''} · ${members.length} member${members.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
            <button class="btn-secondary text-xs" onclick="saveWorkflowAsTemplate(${wf.id}, '${escHtml(wf.name).replace(/'/g, "\\'")}')">
              <i class="fa-solid fa-floppy-disk"></i> Save Template
            </button>
            <button class="btn-secondary text-xs" onclick="openEditWorkflowModal(${wf.id})">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn-danger text-xs" onclick="deleteWorkflow(${wf.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

        <!-- Stage pipeline -->
        <div class="flex flex-wrap gap-1.5 mb-4 p-3 rounded-xl" style="background:#f8fafc">
          ${stages.length ? stages.map((s, i) => `
            <div class="flex items-center gap-1">
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white shadow-sm"
                    style="background:${s.color}">
                <span class="w-3.5 h-3.5 rounded-full bg-white/25 flex items-center justify-center text-[9px] font-bold">${i + 1}</span>
                ${escHtml(s.name)}
              </span>
              ${i < stages.length - 1 ? '<i class="fa-solid fa-chevron-right text-gray-300 text-[9px]"></i>' : ''}
            </div>`).join('')
          : '<span class="text-xs text-gray-400 italic">No stages defined</span>'}
        </div>

        <!-- Footer: members + action -->
        <div class="flex items-center justify-between pt-3" style="border-top:1px solid #f1f5f9">
          <div class="flex items-center gap-2">
            ${members.length
              ? `<div class="flex items-center">${memberAvatars}${extraCount}</div>
                 <span class="text-xs text-gray-500 ml-1">${members.length} member${members.length !== 1 ? 's' : ''}</span>`
              : '<span class="text-xs text-gray-400 italic">No members yet</span>'}
          </div>
          <button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                  style="background:#eef2ff;color:#6366f1"
                  onmouseover="this.style.background='#e0e7ff'"
                  onmouseout="this.style.background='#eef2ff'"
                  onclick="openMembersModal(${wf.id})">
            <i class="fa-solid fa-user-plus"></i> Manage Members
          </button>
        </div>
      </div>
    </div>`;
}

const DEFAULT_STAGES = [
  { name: 'To Do', color: '#64748b' },
  { name: 'In Progress', color: '#3b82f6' },
  { name: 'QA', color: '#a855f7' },
  { name: 'Done', color: '#22c55e' },
  { name: 'Closed', color: '#6b7280' },
];

function stagesEditor(stages = DEFAULT_STAGES) {
  return `
    <div id="stages-list" class="space-y-2">
      ${stages.map((s, i) => stageRow(s, i)).join('')}
    </div>
    <button type="button" class="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1" onclick="addStageRow()">
      <i class="fa-solid fa-plus"></i> Add Stage
    </button>`;
}

function stageRow(s, i) {
  return `
    <div class="flex items-center gap-2 stage-row" data-index="${i}">
      <input type="text" name="stage_name_${i}" class="input flex-1 text-sm" placeholder="Stage name" value="${s.name || ''}" required />
      <input type="color" name="stage_color_${i}" class="w-8 h-8 rounded cursor-pointer border border-gray-300" value="${s.color || '#6366f1'}" />
      <button type="button" class="text-gray-400 hover:text-red-500" onclick="this.closest('.stage-row').remove(); reindexStages()"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
}

let _stageCount = 0;
function addStageRow() {
  const list = document.getElementById('stages-list');
  _stageCount = list.querySelectorAll('.stage-row').length;
  const div = document.createElement('div');
  div.innerHTML = stageRow({ name: '', color: '#6366f1' }, _stageCount);
  list.appendChild(div.firstElementChild);
}

function reindexStages() {
  document.querySelectorAll('.stage-row').forEach((row, i) => {
    row.dataset.index = i;
    row.querySelector('input[type=text]').name = `stage_name_${i}`;
    row.querySelector('input[type=color]').name = `stage_color_${i}`;
  });
}

function collectStages() {
  const rows = document.querySelectorAll('.stage-row');
  return Array.from(rows).map((row, i) => ({
    name: row.querySelector('input[type=text]').value,
    color: row.querySelector('input[type=color]').value,
    order_index: i,
  })).filter(s => s.name.trim());
}

function openCreateWorkflowModal() {
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">New Project</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="wf-form" onsubmit="submitCreateWorkflow(event)" class="p-6 space-y-4">
          <div><label class="label">Project Name <span class="text-red-500">*</span></label><input name="wf_name" class="input" placeholder="e.g. Software Development" required /></div>
          <div>
            <label class="label">Stages</label>
            <div class="text-xs text-gray-400 mb-2">Define the stages tasks will move through</div>
            ${stagesEditor()}
          </div>
          <div id="wf-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Create Project</button>
          </div>
        </form>
      </div>
    </div>`);
  setTimeout(() => _setupWorkflowFormValidation('wf-form'), 50);
}

function _setupWorkflowFormValidation(formId) {
  const nameInput = document.querySelector(`#${formId} [name="wf_name"]`);
  if (nameInput) setupFieldValidation(nameInput, [_validators.required]);
}

async function submitCreateWorkflow(e) {
  e.preventDefault();
  const nameInput = e.target.querySelector('[name=wf_name]');
  if (!validateForm([{input: nameInput, rules: [_validators.required]}])) return;
  const name = nameInput.value;
  const stages = collectStages();
  if (!stages.length) { document.getElementById('wf-error').textContent = 'Add at least one stage'; document.getElementById('wf-error').classList.remove('hidden'); return; }
  const errEl = document.getElementById('wf-error');
  errEl.classList.add('hidden');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) setButtonLoading(submitBtn, true);
  try {
    await api.manager.createWorkflow({ name, stages });
    showToast('Project created!');
    closeModal();
    await loadWorkflows();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    if (submitBtn) setButtonLoading(submitBtn, false);
  }
}

function openEditWorkflowModal(id) {
  const wf = _workflows.find(x => x.id == id);
  if (!wf) return;
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Edit Project</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="edit-wf-form" onsubmit="submitEditWorkflow(event,${id})" class="p-6 space-y-4">
          <div><label class="label">Project Name <span class="text-red-500">*</span></label><input name="wf_name" class="input" value="${wf.name}" required /></div>
          <div>
            <label class="label">Stages</label>
            ${stagesEditor(wf.stages)}
          </div>
          <div><label class="label">Status</label>
            <select name="wf_is_active" class="input max-w-xs">
              <option value="1" ${wf.is_active ? 'selected' : ''}>Active</option>
              <option value="0" ${!wf.is_active ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
          <div id="edit-wf-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitEditWorkflow(e, id) {
  e.preventDefault();
  const name = e.target.querySelector('[name=wf_name]').value;
  const isActive = e.target.querySelector('[name=wf_is_active]').value;
  const stages = collectStages();
  const errEl = document.getElementById('edit-wf-error');
  errEl.classList.add('hidden');
  if (!stages.length) { errEl.textContent = 'Add at least one stage'; errEl.classList.remove('hidden'); return; }
  try {
    await api.manager.updateWorkflow(id, { name, is_active: isActive, stages });
    showToast('Project updated!');
    closeModal();
    await loadWorkflows();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

function deleteWorkflow(id) {
  const wf = _workflows.find(x => x.id == id);
  showConfirm({
    title: `Delete project?`,
    message: `"${wf?.name}" will be permanently deleted. This cannot be undone.`,
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteWorkflow(id);
        showToast('Project deleted!');
        await loadWorkflows();
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}

// ── Member management ─────────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function openMembersModal(wfId) {
  const wf = _workflows.find(w => w.id == wfId);
  if (!wf) return;

  let allUsers = [], members = [];
  try {
    [allUsers, members] = await Promise.all([
      api.manager.listUsers(),
      api.manager.listProjectMembers(wfId),
    ]);
  } catch (err) { showToast(err.message, 'error'); return; }

  if (!allUsers.length) {
    showToast('No employees in this company yet. Add employees first.', 'info');
    return;
  }

  const memberIds = new Set(members.map(m => m.id));

  const rows = allUsers.map(u => {
    const checked = memberIds.has(u.id);
    return `
      <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-gray-50
                    ${checked ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent'}"
             id="member-label-${u.id}">
        <input type="checkbox" class="member-cb w-4 h-4 rounded accent-blue-600 shrink-0"
               value="${u.id}" ${checked ? 'checked' : ''}
               onchange="toggleMemberLabel(this)" />
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500
                    flex items-center justify-center text-white text-xs font-bold shrink-0">
          ${avatarInitials(u.name)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-800">${escHtml(u.name)}</div>
          <div class="text-xs text-gray-400 truncate">${escHtml(u.email)}</div>
        </div>
        ${checked ? '<i class="fa-solid fa-circle-check text-blue-500 text-sm shrink-0"></i>' : '<i class="fa-solid fa-circle text-gray-200 text-sm shrink-0"></i>'}
      </label>`;
  }).join('');

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box max-w-lg">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Manage Members</h3>
            <p class="text-xs text-gray-400 mt-0.5">${escHtml(wf.name)} · ${members.length} of ${allUsers.length} selected</p>
          </div>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Search -->
        <div class="px-6 pt-4">
          <div class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input id="member-search" type="text" class="input pl-9 text-sm" placeholder="Search employees…"
                   oninput="filterMemberList(this.value)" />
          </div>
        </div>

        <!-- Quick actions -->
        <div class="px-6 pt-3 flex gap-2">
          <button onclick="selectAllMembers(true)"  class="text-xs text-blue-600 hover:underline">Select all</button>
          <span class="text-gray-300">·</span>
          <button onclick="selectAllMembers(false)" class="text-xs text-blue-600 hover:underline">Deselect all</button>
        </div>

        <!-- Employee checklist -->
        <div id="member-checklist" class="px-6 py-4 space-y-2 max-h-72 overflow-y-auto">
          ${rows}
        </div>

        <div id="member-save-err" class="hidden mx-6 mb-2 p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>

        <div class="p-6 border-t border-gray-100 flex items-center justify-between gap-3">
          <span class="text-xs text-gray-400" id="member-sel-count">${members.length} member${members.length !== 1 ? 's' : ''} selected</span>
          <div class="flex gap-2">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="saveMemberChanges(${wfId})">
              <i class="fa-solid fa-floppy-disk"></i> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>`);
}

function toggleMemberLabel(cb) {
  const label = document.getElementById(`member-label-${cb.value}`);
  if (!label) return;
  const icon = label.querySelector('i.fa-solid');
  if (cb.checked) {
    label.className = label.className.replace('bg-gray-50 border-transparent', 'bg-blue-50 border-blue-200');
    if (icon) { icon.className = 'fa-solid fa-circle-check text-blue-500 text-sm shrink-0'; }
  } else {
    label.className = label.className.replace('bg-blue-50 border-blue-200', 'bg-gray-50 border-transparent');
    if (icon) { icon.className = 'fa-solid fa-circle text-gray-200 text-sm shrink-0'; }
  }
  const total = document.querySelectorAll('.member-cb:checked').length;
  const cntEl = document.getElementById('member-sel-count');
  if (cntEl) cntEl.textContent = `${total} member${total !== 1 ? 's' : ''} selected`;
}

function selectAllMembers(checked) {
  document.querySelectorAll('.member-cb').forEach(cb => {
    cb.checked = checked;
    toggleMemberLabel(cb);
  });
}

function filterMemberList(q) {
  const term = q.toLowerCase();
  document.querySelectorAll('#member-checklist label').forEach(label => {
    const text = label.textContent.toLowerCase();
    label.style.display = text.includes(term) ? '' : 'none';
  });
}

function saveWorkflowAsTemplate(wfId, wfName) {
  const overlay = document.createElement('div');
  overlay.id = 'save-tpl-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box max-w-sm animate-fade-in-up" style="padding:28px">
      <h3 class="font-semibold text-gray-900 mb-1">Save as Template</h3>
      <p class="text-sm text-gray-500 mb-4">Enter a name for this project template.</p>
      <input id="save-tpl-name" type="text" class="input mb-4" value="Template: ${escHtml(wfName)}" placeholder="Template name" />
      <div class="flex gap-2 justify-end">
        <button class="btn-secondary" onclick="document.getElementById('save-tpl-overlay').remove()">Cancel</button>
        <button class="btn-primary" onclick="confirmSaveWorkflowTemplate(${wfId})"><i class="fa-solid fa-floppy-disk"></i> Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { const inp = document.getElementById('save-tpl-name'); if (inp) { inp.focus(); inp.select(); } }, 50);
}

async function confirmSaveWorkflowTemplate(wfId) {
  const name = document.getElementById('save-tpl-name')?.value.trim();
  if (!name) { showToast('Please enter a template name', 'error'); return; }
  document.getElementById('save-tpl-overlay')?.remove();
  try {
    await api.manager.saveProjectAsTemplate(wfId, { template_name: name });
    showToast('Project saved as template!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

async function openNewProjectFromTemplateModal() {
  let templates = [];
  try {
    const result = await api.manager.listProjectTemplates();
    templates = result.data || [];
  } catch (err) { showToast(err.message, 'error'); return; }

  if (!templates.length) {
    showToast('No project templates yet. Save a project as a template first.', 'info');
    return;
  }

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box max-w-lg">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900"><i class="fa-solid fa-wand-magic-sparkles text-indigo-500 mr-2"></i>New Project from Template</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="label">Choose Template</label>
            <div class="space-y-2 max-h-48 overflow-y-auto" id="proj-tpl-list">
              ${templates.map(t => `
                <label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                  <input type="radio" name="proj_tpl" value="${t.id}" class="accent-indigo-600" />
                  <div>
                    <div class="font-medium text-sm text-gray-800">${escHtml(t.name)}</div>
                    <div class="text-xs text-gray-500 mt-0.5">
                      ${JSON.parse(t.stages||'[]').length} stages &middot;
                      ${JSON.parse(t.custom_fields||'[]').length} custom fields
                    </div>
                  </div>
                </label>`).join('')}
            </div>
          </div>
          <div>
            <label class="label">New Project Name <span class="text-red-500">*</span></label>
            <input id="proj-from-tpl-name" type="text" class="input" placeholder="Enter project name" required />
          </div>
          <div>
            <label class="label">Description (optional)</label>
            <textarea id="proj-from-tpl-desc" class="input" rows="2" placeholder="Project description…"></textarea>
          </div>
          <div id="proj-tpl-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="submitCreateProjectFromTemplate()">
              <i class="fa-solid fa-plus"></i> Create Project
            </button>
          </div>
        </div>
      </div>
    </div>`);
}

async function submitCreateProjectFromTemplate() {
  const tplId = document.querySelector('[name=proj_tpl]:checked')?.value;
  const name  = document.getElementById('proj-from-tpl-name')?.value.trim();
  const desc  = document.getElementById('proj-from-tpl-desc')?.value.trim();
  const errEl = document.getElementById('proj-tpl-error');
  errEl.classList.add('hidden');
  if (!tplId) { errEl.textContent = 'Please select a template'; errEl.classList.remove('hidden'); return; }
  if (!name)  { errEl.textContent = 'Project name is required'; errEl.classList.remove('hidden'); return; }
  try {
    await api.manager.createProjectFromTemplate(tplId, { name, description: desc });
    showToast('Project created from template!', 'success');
    closeModal();
    await loadWorkflows();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function saveMemberChanges(wfId) {
  const wf = _workflows.find(w => w.id == wfId);
  if (!wf) return;

  const errEl = document.getElementById('member-save-err');
  errEl.classList.add('hidden');

  const currentMemberIds = new Set((wf.members || []).map(m => m.id));
  const selectedIds = new Set(
    Array.from(document.querySelectorAll('.member-cb:checked')).map(cb => +cb.value)
  );

  const toAdd    = [...selectedIds].filter(id => !currentMemberIds.has(id));
  const toRemove = [...currentMemberIds].filter(id => !selectedIds.has(id));

  if (!toAdd.length && !toRemove.length) { closeModal(); return; }

  const btn = document.querySelector('[onclick="saveMemberChanges(' + wfId + ')"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

  try {
    await Promise.all([
      ...toAdd.map(id => api.manager.addProjectMember(wfId, id)),
      ...toRemove.map(id => api.manager.removeProjectMember(wfId, id)),
    ]);

    // Refresh local members cache
    const fresh = await api.manager.listProjectMembers(wfId);
    if (wf) wf.members = fresh;
    renderWorkflows();

    const added   = toAdd.length;
    const removed = toRemove.length;
    const parts   = [];
    if (added)   parts.push(`${added} added`);
    if (removed) parts.push(`${removed} removed`);
    showToast('Members updated — ' + parts.join(', '));
    closeModal();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes'; }
  }
}
