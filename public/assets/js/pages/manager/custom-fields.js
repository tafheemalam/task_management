let _cfWorkflows = [];
let _cfFields    = [];
let _cfWorkflowId = null;

async function renderCustomFields() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6 animate-fade-in-up">
      ${pageHeader('Custom Fields', 'Define custom data fields per project')}
      <div id="cf-content">
        <div class="card animate-pulse"><div class="h-32 bg-gray-100 rounded-lg"></div></div>
      </div>
    </div>`);

  try {
    _cfWorkflows = await api.manager.listWorkflows();
    renderCustomFieldsContent();
  } catch (err) {
    document.getElementById('cf-content').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

function renderCustomFieldsContent() {
  if (!_cfWorkflows.length) {
    document.getElementById('cf-content').innerHTML =
      `<div class="card text-center py-12 text-gray-400">
         <i class="fa-solid fa-diagram-project text-4xl mb-3"></i>
         <p>No projects yet. Create a project first.</p>
       </div>`;
    return;
  }

  document.getElementById('cf-content').innerHTML = `
    <div class="grid lg:grid-cols-3 gap-5">
      <!-- Project Selector -->
      <div class="card">
        <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <i class="fa-solid fa-diagram-project text-indigo-500"></i> Select Project
        </h3>
        <div class="space-y-1">
          ${_cfWorkflows.map(w => `
            <button onclick="loadCustomFields(${w.id}, '${cfEscHtml(w.name)}')"
                    id="cf-wf-btn-${w.id}"
                    class="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 font-medium text-gray-700">
              ${cfEscHtml(w.name)}
            </button>`).join('')}
        </div>
      </div>

      <!-- Fields List -->
      <div class="lg:col-span-2">
        <div id="cf-fields-area">
          <div class="card flex flex-col items-center justify-center py-16 text-gray-400">
            <i class="fa-solid fa-sliders text-4xl mb-3"></i>
            <p class="text-sm">Select a project to manage its custom fields</p>
          </div>
        </div>
      </div>
    </div>`;
}

async function loadCustomFields(workflowId, workflowName) {
  _cfWorkflowId = workflowId;

  document.querySelectorAll('[id^="cf-wf-btn-"]').forEach(btn => {
    btn.className = 'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 font-medium text-gray-700';
  });
  const selBtn = document.getElementById('cf-wf-btn-' + workflowId);
  if (selBtn) selBtn.className = 'w-full text-left px-3 py-2.5 rounded-xl text-sm bg-indigo-600 text-white font-semibold';

  document.getElementById('cf-fields-area').innerHTML =
    `<div class="card animate-pulse"><div class="h-32 bg-gray-100 rounded-lg"></div></div>`;

  try {
    _cfFields = await api.manager.listCustomFields(workflowId);
    renderFieldsList(workflowId, workflowName);
  } catch (err) {
    document.getElementById('cf-fields-area').innerHTML =
      `<div class="card text-red-500 text-sm">${err.message}</div>`;
  }
}

function renderFieldsList(workflowId, workflowName) {
  const typeColors = {
    text: 'bg-blue-100 text-blue-700',
    number: 'bg-purple-100 text-purple-700',
    date: 'bg-green-100 text-green-700',
    select: 'bg-orange-100 text-orange-700',
    checkbox: 'bg-pink-100 text-pink-700',
  };

  document.getElementById('cf-fields-area').innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-5">
        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
          <i class="fa-solid fa-sliders text-indigo-500"></i>
          Fields for: ${cfEscHtml(workflowName)}
        </h3>
        <button class="btn-primary text-sm" onclick="openAddFieldModal(${workflowId})">
          <i class="fa-solid fa-plus"></i> Add Field
        </button>
      </div>

      ${_cfFields.length === 0
        ? `<div class="text-center py-12 text-gray-400">
             <i class="fa-solid fa-sliders text-4xl mb-3"></i>
             <p class="text-sm">No custom fields yet for this project.</p>
             <button class="btn-secondary text-sm mt-3" onclick="openAddFieldModal(${workflowId})">
               <i class="fa-solid fa-plus"></i> Add First Field
             </button>
           </div>`
        : `<div class="space-y-2">
             ${_cfFields.map(f => `
               <div class="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl group border border-gray-100 hover:border-indigo-200 transition-colors">
                 <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                   <i class="fa-solid ${cfTypeIcon(f.field_type)} text-indigo-600 text-xs"></i>
                 </div>
                 <div class="flex-1 min-w-0">
                   <div class="flex items-center gap-2">
                     <span class="text-sm font-semibold text-gray-900">${cfEscHtml(f.name)}</span>
                     <span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColors[f.field_type] || 'bg-gray-100 text-gray-600'}">${f.field_type}</span>
                     ${f.is_required ? '<span class="text-xs text-red-500 font-medium">Required</span>' : ''}
                   </div>
                   ${f.field_type === 'select' && f.options && f.options.length
                     ? `<div class="text-xs text-gray-400 mt-0.5">Options: ${cfEscHtml(f.options.join(', '))}</div>`
                     : ''}
                 </div>
                 <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onclick="openEditFieldModal(${JSON.stringify(f).replace(/"/g, '&quot;')})"
                           class="btn-secondary text-xs">
                     <i class="fa-solid fa-pen"></i> Edit
                   </button>
                   <button onclick="deleteCustomFieldById(${f.id})"
                           class="btn-danger text-xs">
                     <i class="fa-solid fa-trash"></i>
                   </button>
                 </div>
               </div>`).join('')}
           </div>`
      }
    </div>`;
}

function cfTypeIcon(type) {
  return { text: 'fa-t', number: 'fa-hashtag', date: 'fa-calendar', select: 'fa-list', checkbox: 'fa-square-check' }[type] || 'fa-t';
}

function openAddFieldModal(workflowId) {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box p-6">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Custom Field</h3>
        ${cfFieldForm(null)}
        <div id="cf-add-error" class="hidden mb-3 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl"></div>
        <div class="flex gap-3">
          <button class="btn-primary flex-1" onclick="submitAddField(${workflowId})">
            <i class="fa-solid fa-plus"></i> Add Field
          </button>
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
      </div>
    </div>`);
  cfToggleOptionsField();
  setTimeout(() => document.getElementById('cf-field-name')?.focus(), 100);
}

function openEditFieldModal(fieldJson) {
  const f = typeof fieldJson === 'string' ? JSON.parse(fieldJson) : fieldJson;
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box p-6">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Custom Field</h3>
        ${cfFieldForm(f)}
        <div id="cf-add-error" class="hidden mb-3 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl"></div>
        <div class="flex gap-3">
          <button class="btn-primary flex-1" onclick="submitEditField(${f.id})">
            <i class="fa-solid fa-floppy-disk"></i> Save Changes
          </button>
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
      </div>
    </div>`);
  cfToggleOptionsField();
}

function cfFieldForm(field) {
  const types = ['text', 'number', 'date', 'select', 'checkbox'];
  const optionsVal = field && field.options && field.options.length ? field.options.join(', ') : '';
  return `
    <div class="space-y-4 mb-4">
      <div>
        <label class="label">Field Name <span class="text-red-400">*</span></label>
        <input id="cf-field-name" type="text" class="input" placeholder="e.g. Story Points"
               value="${cfEscHtml(field ? field.name : '')}" required />
      </div>
      <div>
        <label class="label">Field Type</label>
        <select id="cf-field-type" class="input" onchange="cfToggleOptionsField()">
          ${types.map(t => `<option value="${t}" ${field && field.field_type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div id="cf-options-row" class="hidden">
        <label class="label">Options <span class="text-gray-400 font-normal">(comma-separated)</span></label>
        <input id="cf-field-options" type="text" class="input"
               placeholder="Option 1, Option 2, Option 3"
               value="${cfEscHtml(optionsVal)}" />
      </div>
      <div>
        <label class="flex items-center gap-3 cursor-pointer">
          <input id="cf-field-required" type="checkbox" class="rounded text-indigo-600"
                 ${field && field.is_required ? 'checked' : ''} />
          <span class="text-sm text-gray-700">Required field</span>
        </label>
      </div>
    </div>`;
}

function cfToggleOptionsField() {
  const type = document.getElementById('cf-field-type')?.value;
  const row  = document.getElementById('cf-options-row');
  if (row) row.classList.toggle('hidden', type !== 'select');
}

async function submitAddField(workflowId) {
  const errEl = document.getElementById('cf-add-error');
  errEl.classList.add('hidden');
  const data = cfBuildFieldData();
  if (!data) return;

  try {
    await api.manager.createCustomField(workflowId, data);
    closeModal();
    showToast('Field added!', 'success');
    await loadCustomFields(workflowId, _cfWorkflows.find(w => w.id === workflowId)?.name || '');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function submitEditField(fieldId) {
  const errEl = document.getElementById('cf-add-error');
  errEl.classList.add('hidden');
  const data = cfBuildFieldData();
  if (!data) return;

  try {
    await api.manager.updateCustomField(fieldId, data);
    closeModal();
    showToast('Field updated!', 'success');
    await loadCustomFields(_cfWorkflowId, _cfWorkflows.find(w => w.id === _cfWorkflowId)?.name || '');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function cfBuildFieldData() {
  const name  = document.getElementById('cf-field-name')?.value?.trim();
  const type  = document.getElementById('cf-field-type')?.value;
  const req   = document.getElementById('cf-field-required')?.checked;
  const opts  = document.getElementById('cf-field-options')?.value?.trim();

  if (!name) {
    const errEl = document.getElementById('cf-add-error');
    errEl.textContent = 'Field name is required';
    errEl.classList.remove('hidden');
    return null;
  }

  const options = type === 'select' && opts
    ? opts.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return { name, field_type: type, options, is_required: req };
}

function deleteCustomFieldById(fieldId) {
  showConfirm({
    title: 'Delete custom field?',
    message: 'All values stored in this field will be permanently deleted.',
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteCustomField(fieldId);
        showToast('Field deleted', 'info');
        await loadCustomFields(_cfWorkflowId, _cfWorkflows.find(w => w.id === _cfWorkflowId)?.name || '');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

function cfEscHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
