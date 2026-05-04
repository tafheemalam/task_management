async function renderManagerWorkflows() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Workflows', 'Define your task stages', `<button class="btn-primary" onclick="openCreateWorkflowModal()"><i class="fa-solid fa-plus"></i> New Workflow</button>`)}
      <div id="workflows-container">Loading...</div>
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
  if (!_workflows.length) { el.innerHTML = emptyState('fa-diagram-project', 'No workflows yet', 'Create a workflow to organize tasks'); return; }
  el.innerHTML = `<div class="space-y-4">${_workflows.map(wf => `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 ${!wf.is_active ? 'opacity-60' : ''}">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600"><i class="fa-solid fa-diagram-project"></i></div>
          <div>
            <div class="font-semibold text-gray-900">${wf.name}</div>
            <div class="text-xs text-gray-400">${wf.stages.length} stages · ${statusDot(wf.is_active)}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-xs" onclick="openEditWorkflowModal(${wf.id})"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-danger text-xs" onclick="deleteWorkflow(${wf.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        ${wf.stages.map((s, i) => `
          <div class="flex items-center gap-1.5">
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white" style="background-color:${s.color}">
              <span class="w-4 h-4 rounded-full bg-white bg-opacity-30 flex items-center justify-center text-[10px] font-bold">${i + 1}</span>
              ${s.name}
            </div>
            ${i < wf.stages.length - 1 ? '<i class="fa-solid fa-arrow-right text-gray-300 text-xs"></i>' : ''}
          </div>`).join('')}
      </div>
    </div>`).join('')}</div>`;
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
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">New Workflow</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="wf-form" onsubmit="submitCreateWorkflow(event)" class="p-6 space-y-4">
          <div><label class="label">Workflow Name *</label><input name="wf_name" class="input" placeholder="e.g. Software Development" required /></div>
          <div>
            <label class="label">Stages</label>
            <div class="text-xs text-gray-400 mb-2">Define the stages tasks will move through</div>
            ${stagesEditor()}
          </div>
          <div id="wf-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Create Workflow</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitCreateWorkflow(e) {
  e.preventDefault();
  const name = e.target.querySelector('[name=wf_name]').value;
  const stages = collectStages();
  if (!stages.length) { document.getElementById('wf-error').textContent = 'Add at least one stage'; document.getElementById('wf-error').classList.remove('hidden'); return; }
  const errEl = document.getElementById('wf-error');
  errEl.classList.add('hidden');
  try {
    await api.manager.createWorkflow({ name, stages });
    showToast('Workflow created!');
    closeModal();
    await loadWorkflows();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

function openEditWorkflowModal(id) {
  const wf = _workflows.find(x => x.id == id);
  if (!wf) return;
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Edit Workflow</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="edit-wf-form" onsubmit="submitEditWorkflow(event,${id})" class="p-6 space-y-4">
          <div><label class="label">Workflow Name *</label><input name="wf_name" class="input" value="${wf.name}" required /></div>
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
    showToast('Workflow updated!');
    closeModal();
    await loadWorkflows();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function deleteWorkflow(id) {
  const wf = _workflows.find(x => x.id == id);
  if (!confirmDialog(`Delete workflow "${wf?.name}"? This cannot be undone.`)) return;
  try {
    await api.manager.deleteWorkflow(id);
    showToast('Workflow deleted!');
    await loadWorkflows();
  } catch (err) { showToast(err.message, 'error'); }
}
