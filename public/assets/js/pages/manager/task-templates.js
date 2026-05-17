// ── Templates Page ────────────────────────────────────────────────────────────
// Renders both Task Templates and Project Templates in a tabbed interface

let _templatesTab = 'task'; // 'task' | 'project'

async function renderTemplates() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Templates', 'Reuse task and project structures', `
        <button class="btn-primary" onclick="openCreateTemplateModal()">
          <i class="fa-solid fa-plus"></i> New Template
        </button>`)}

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        <button id="tab-task" onclick="switchTemplatesTab('task')"
                class="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-white text-gray-800 shadow-sm">
          <i class="fa-solid fa-check-square mr-1"></i> Task Templates
        </button>
        <button id="tab-project" onclick="switchTemplatesTab('project')"
                class="px-4 py-2 rounded-lg text-sm font-semibold transition-all text-gray-500 hover:text-gray-700">
          <i class="fa-solid fa-diagram-project mr-1"></i> Project Templates
        </button>
      </div>

      <div id="templates-content">${skeletonCards(3)}</div>
    </div>`);

  await loadTemplatesTab(_templatesTab);
}

function switchTemplatesTab(tab) {
  _templatesTab = tab;
  const btnTask    = document.getElementById('tab-task');
  const btnProject = document.getElementById('tab-project');
  if (btnTask)    btnTask.className    = `px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'task'    ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`;
  if (btnProject) btnProject.className = `px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'project' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`;
  loadTemplatesTab(tab);
}

async function loadTemplatesTab(tab) {
  const el = document.getElementById('templates-content');
  if (!el) return;
  el.innerHTML = skeletonCards(3);
  try {
    if (tab === 'task') {
      const result = await api.manager.listTaskTemplates();
      renderTaskTemplatesList(result.data || []);
    } else {
      const result = await api.manager.listProjectTemplates();
      renderProjectTemplatesList(result.data || []);
    }
  } catch (err) {
    el.innerHTML = `<div class="text-red-500 text-sm py-8 text-center">${err.message}</div>`;
  }
}

// ── Task Templates ─────────────────────────────────────────────────────────────

function renderTaskTemplatesList(templates) {
  const el = document.getElementById('templates-content');
  if (!templates.length) {
    el.innerHTML = emptyState('fa-wand-magic-sparkles', 'No task templates', 'Save time by creating reusable task templates', `<button class="btn-primary" onclick="openCreateTemplateModal()"><i class="fa-solid fa-plus"></i> Create Task Template</button>`);
    return;
  }

  el.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
      ${templates.map(t => {
        const checklist = t.checklist ? JSON.parse(t.checklist) : [];
        return `
          <div class="card hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-gray-800 truncate">${tplEscHtml(t.name)}</div>
                <div class="text-xs text-gray-400 mt-0.5">by ${tplEscHtml(t.created_by_name || 'Unknown')}</div>
              </div>
              ${priorityBadge(t.priority)}
            </div>
            <div class="text-sm text-gray-600 line-clamp-2 mb-3 min-h-[40px]">
              ${t.description ? tplEscHtml(t.description) : '<em class="text-gray-300">No description</em>'}
            </div>
            <div class="flex items-center gap-3 text-xs text-gray-500 mb-4">
              ${checklist.length ? `<span><i class="fa-solid fa-check-square mr-1 text-indigo-400"></i>${checklist.length} checklist item${checklist.length !== 1 ? 's' : ''}</span>` : ''}
              ${t.estimated_minutes ? `<span><i class="fa-solid fa-clock mr-1 text-blue-400"></i>${formatMinutesTpl(t.estimated_minutes)}</span>` : ''}
            </div>
            <div class="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button class="btn-secondary text-xs flex-1 justify-center" onclick="openEditTaskTemplateModal(${t.id})">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
              <button class="btn-danger text-xs" onclick="deleteTaskTemplate(${t.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function formatMinutesTpl(m) {
  if (!m) return '';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min > 0 ? min + 'm' : ''}` : `${min}m`;
}

function tplEscHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openCreateTemplateModal() {
  if (_templatesTab === 'project') {
    showToast('Save a project as a template from the Projects page.', 'info');
    return;
  }
  openTaskTemplateModal(null);
}

function openTaskTemplateModal(tpl) {
  const isEdit = !!tpl;
  const checklist = tpl?.checklist ? JSON.parse(tpl.checklist) : [];

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">${isEdit ? 'Edit' : 'New'} Task Template</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="tpl-form" onsubmit="submitTaskTemplate(event,${tpl ? tpl.id : 'null'})" class="p-6 space-y-4">
          <div>
            <label class="label">Template Name <span class="text-red-500">*</span></label>
            <input name="name" class="input" value="${tplEscHtml(tpl?.name || '')}" required placeholder="e.g. Bug Fix Process" />
          </div>
          <div>
            <label class="label">Task Title Pattern <span class="text-red-500">*</span></label>
            <input name="title_template" class="input" value="${tplEscHtml(tpl?.title_template || '')}" required placeholder="e.g. Bug Fix: [describe here]" />
          </div>
          <div>
            <label class="label">Description</label>
            <textarea name="description" class="input" rows="3" placeholder="Default description…">${tplEscHtml(tpl?.description || '')}</textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Priority</label>
              <select name="priority" class="input">
                <option value="high"   ${tpl?.priority === 'high'   ? 'selected' : ''}>🔴 High</option>
                <option value="medium" ${(!tpl?.priority || tpl?.priority === 'medium') ? 'selected' : ''}>🟡 Medium</option>
                <option value="low"    ${tpl?.priority === 'low'    ? 'selected' : ''}>🟢 Low</option>
              </select>
            </div>
            <div>
              <label class="label">Estimated Hours</label>
              <input name="estimated_hours" type="number" min="0" step="0.5" class="input"
                     value="${tpl?.estimated_minutes ? (tpl.estimated_minutes / 60) : ''}" placeholder="e.g. 2" />
            </div>
          </div>
          <div>
            <label class="label">Default Checklist Items</label>
            <div id="tpl-checklist" class="space-y-2 mb-2">
              ${checklist.map((item, i) => tplChecklistRow(item, i)).join('')}
            </div>
            <div class="flex items-center gap-2">
              <input id="new-tpl-checklist-item" type="text" class="input flex-1 text-sm" placeholder="Add item…"
                     onkeydown="if(event.key==='Enter'){addTplChecklistItem();event.preventDefault();}" />
              <button type="button" class="btn-secondary text-xs shrink-0" onclick="addTplChecklistItem()">
                <i class="fa-solid fa-plus"></i> Add
              </button>
            </div>
          </div>
          <div id="tpl-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Template'}</button>
          </div>
        </form>
      </div>
    </div>`);
}

function tplChecklistRow(text, i) {
  return `
    <div class="flex items-center gap-2 tpl-checklist-row">
      <i class="fa-solid fa-grip-lines text-gray-300 text-xs"></i>
      <input type="text" name="tpl_checklist_${i}" class="input flex-1 text-sm" value="${tplEscHtml(text)}" placeholder="Checklist item" />
      <button type="button" onclick="this.closest('.tpl-checklist-row').remove()" class="text-gray-400 hover:text-red-500 text-xs p-1">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`;
}

function addTplChecklistItem() {
  const input = document.getElementById('new-tpl-checklist-item');
  const val = input?.value?.trim();
  const list = document.getElementById('tpl-checklist');
  if (!list) return;
  const i = list.querySelectorAll('.tpl-checklist-row').length;
  const div = document.createElement('div');
  div.innerHTML = tplChecklistRow(val || '', i);
  list.appendChild(div.firstElementChild);
  if (input) input.value = '';
}

async function submitTaskTemplate(e, templateId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const hours = parseFloat(data.estimated_hours || '0');
  const estimatedMinutes = hours > 0 ? Math.round(hours * 60) : null;

  // Collect checklist
  const rows = e.target.querySelectorAll('.tpl-checklist-row input[type=text]');
  const checklist = Array.from(rows).map(i => i.value.trim()).filter(Boolean);

  const payload = {
    name: data.name,
    title_template: data.title_template,
    description: data.description || null,
    priority: data.priority,
    estimated_minutes: estimatedMinutes,
    checklist,
  };

  const errEl = document.getElementById('tpl-error');
  errEl.classList.add('hidden');
  try {
    if (templateId) {
      await api.manager.updateTaskTemplate(templateId, payload);
      showToast('Template updated!', 'success');
    } else {
      await api.manager.createTaskTemplate(payload);
      showToast('Template created!', 'success');
    }
    closeModal();
    await loadTemplatesTab('task');
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function openEditTaskTemplateModal(id) {
  try {
    const result = await api.manager.listTaskTemplates();
    const tpl = (result.data || []).find(t => t.id == id);
    if (!tpl) { showToast('Template not found', 'error'); return; }
    openTaskTemplateModal(tpl);
  } catch (err) { showToast(err.message, 'error'); }
}

function deleteTaskTemplate(id) {
  showConfirm({
    title: 'Delete template?',
    message: 'This action cannot be undone.',
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteTaskTemplate(id);
        showToast('Template deleted');
        await loadTemplatesTab('task');
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}

// ── Project Templates ──────────────────────────────────────────────────────────

function renderProjectTemplatesList(templates) {
  const el = document.getElementById('templates-content');
  if (!templates.length) {
    el.innerHTML = emptyState('fa-diagram-project', 'No project templates yet', 'Go to Projects and click "Save Template" on any project', `<button class="btn-secondary" onclick="navigate('manager-workflows')"><i class="fa-solid fa-diagram-project"></i> Go to Projects</button>`);
    return;
  }

  el.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
      ${templates.map(t => {
        const stages = t.stages ? JSON.parse(t.stages) : [];
        const fields = t.custom_fields ? JSON.parse(t.custom_fields) : [];
        return `
          <div class="card hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-gray-800 truncate">${tplEscHtml(t.name)}</div>
              </div>
              <i class="fa-solid fa-diagram-project text-indigo-400 text-lg shrink-0"></i>
            </div>
            ${t.description ? `<div class="text-sm text-gray-500 mb-3 line-clamp-2">${tplEscHtml(t.description)}</div>` : ''}
            <div class="flex flex-wrap gap-1 mb-3">
              ${stages.slice(0, 5).map(s => `
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  ${tplEscHtml(s.name)}
                </span>`).join('')}
              ${stages.length > 5 ? `<span class="text-xs text-gray-400">+${stages.length - 5} more</span>` : ''}
            </div>
            <div class="text-xs text-gray-400 mb-4">
              ${stages.length} stage${stages.length !== 1 ? 's' : ''}
              ${fields.length ? ` &middot; ${fields.length} custom field${fields.length !== 1 ? 's' : ''}` : ''}
            </div>
            <div class="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button class="btn-primary text-xs flex-1 justify-center" onclick="useProjectTemplate(${t.id})">
                <i class="fa-solid fa-plus"></i> Use Template
              </button>
              <button class="btn-danger text-xs" onclick="deleteProjectTemplate(${t.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function useProjectTemplate(templateId) {
  const overlay = document.createElement('div');
  overlay.id = 'use-proj-tpl-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box max-w-sm animate-fade-in-up" style="padding:28px">
      <h3 class="font-semibold text-gray-900 mb-1">Create Project from Template</h3>
      <p class="text-sm text-gray-500 mb-4">Enter a name for the new project.</p>
      <input id="use-proj-tpl-name" type="text" class="input mb-4" placeholder="Project name" />
      <div class="flex gap-2 justify-end">
        <button class="btn-secondary" onclick="document.getElementById('use-proj-tpl-overlay').remove()">Cancel</button>
        <button class="btn-primary" onclick="confirmUseProjectTemplate(${templateId})"><i class="fa-solid fa-plus"></i> Create</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('use-proj-tpl-name')?.focus(), 50);
}

async function confirmUseProjectTemplate(templateId) {
  const name = document.getElementById('use-proj-tpl-name')?.value.trim();
  if (!name) { showToast('Please enter a project name', 'error'); return; }
  document.getElementById('use-proj-tpl-overlay')?.remove();
  try {
    await api.manager.createProjectFromTemplate(templateId, { name });
    showToast('Project created from template!', 'success');
    navigate('manager-workflows');
  } catch (err) { showToast(err.message, 'error'); }
}

function deleteProjectTemplate(id) {
  showConfirm({
    title: 'Delete project template?',
    message: 'This action cannot be undone.',
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteProjectTemplate(id);
        showToast('Template deleted');
        await loadTemplatesTab('project');
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}
