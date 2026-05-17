let _webhooks = [];
const WEBHOOK_EVENTS = [
  { value: 'task.created',    label: 'Task Created',  icon: 'fa-plus',    color: '#10b981' },
  { value: 'task.updated',    label: 'Task Updated',  icon: 'fa-pen',     color: '#6366f1' },
  { value: 'comment.created', label: 'Comment Added', icon: 'fa-comment', color: '#f59e0b' },
  { value: 'webhook.test',    label: 'Test Event',    icon: 'fa-vial',    color: '#8b5cf6' },
];

async function renderManagerWebhooks() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Webhooks', 'Send events to external services when things happen in TaskFlow', `
        <button class="btn-primary" onclick="openCreateWebhookModal()">
          <i class="fa-solid fa-plus"></i> New Webhook
        </button>`)}
      <div id="webhooks-list">${skeletonCards(3)}</div>
    </div>`);
  await loadWebhooks();
}

async function loadWebhooks() {
  try {
    _webhooks = await api.manager.listWebhooks();
    renderWebhooksList();
  } catch(err) { showToast(err.message, 'error'); }
}

function renderWebhooksList() {
  const el = document.getElementById('webhooks-list');
  if (!_webhooks.length) {
    el.innerHTML = emptyState('fa-webhook', 'No webhooks yet', 'Connect TaskFlow to other tools via webhooks');
    return;
  }
  el.innerHTML = _webhooks.map(wh => {
    const events = JSON.parse(wh.events || '[]');
    return `
      <div class="bg-white rounded-2xl p-5 mb-4 transition-shadow hover:shadow-md"
           style="border:1px solid rgba(226,232,240,0.8);box-shadow:0 1px 4px rgba(0,0,0,0.06)">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                 style="background:${wh.is_active?'#eef2ff':'#f1f5f9'};color:${wh.is_active?'#6366f1':'#94a3b8'}">
              <i class="fa-solid fa-plug text-sm"></i>
            </div>
            <div>
              <div class="font-semibold text-gray-900">${wh.name}</div>
              <div class="text-xs text-gray-400 font-mono truncate max-w-sm mt-0.5">${wh.url}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold
                         ${wh.is_active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}">
              ${wh.is_active?'Active':'Inactive'}
            </span>
            <button onclick="testWebhook(${wh.id})" class="btn-secondary text-xs">
              <i class="fa-solid fa-vial"></i> Test
            </button>
            <button onclick="openEditWebhookModal(${wh.id})" class="btn-secondary text-xs">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button onclick="deleteWebhook(${wh.id})" class="btn-danger text-xs">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-3 pt-3" style="border-top:1px solid #f1f5f9">
          ${events.map(ev => {
            const meta = WEBHOOK_EVENTS.find(e => e.value === ev);
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style="background:${meta?.color||'#6366f1'}18;color:${meta?.color||'#6366f1'}">
              <i class="fa-solid ${meta?.icon||'fa-bolt'} text-[9px]"></i>${meta?.label||ev}
            </span>`;
          }).join('')}
          ${wh.last_triggered_at?`<span class="ml-auto text-xs text-gray-400">Last triggered: ${formatDateTime(wh.last_triggered_at)}</span>`:''}
        </div>
        <div class="mt-2 text-xs text-gray-400">
          Secret: <code class="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">${wh.secret}</code>
          <span class="text-gray-300 mx-1">·</span>
          Use this to verify webhook signatures with HMAC-SHA256
        </div>
      </div>`;
  }).join('');
}

function webhookFormHtml(wh = {}) {
  const events = JSON.parse(wh.events || '["task.created","task.updated","comment.created"]');
  return `
    <div><label class="label">Webhook Name <span class="text-red-500">*</span></label>
      <input name="name" class="input" placeholder="e.g. Slack Notifications" value="${wh.name||''}" required /></div>
    <div><label class="label">Endpoint URL <span class="text-red-500">*</span></label>
      <input name="url" type="url" class="input" placeholder="https://hooks.example.com/..." value="${wh.url||''}" required /></div>
    <div>
      <label class="label mb-2">Events to send</label>
      <div class="space-y-2">
        ${WEBHOOK_EVENTS.filter(e=>e.value!=='webhook.test').map(e => `
          <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
                 style="border:1px solid #f1f5f9">
            <input type="checkbox" name="event_${e.value}" class="w-4 h-4 rounded accent-indigo-600"
                   ${events.includes(e.value)?'checked':''} />
            <i class="fa-solid ${e.icon}" style="color:${e.color};width:14px"></i>
            <span class="text-sm font-medium text-gray-700">${e.label}</span>
          </label>`).join('')}
      </div>
    </div>
    <div class="flex items-center gap-3">
      <input type="checkbox" name="is_active" id="wh-active" class="w-4 h-4 rounded accent-indigo-600"
             ${wh.is_active!==0?'checked':''} />
      <label for="wh-active" class="text-sm text-gray-700">Webhook is active</label>
    </div>`;
}

function openCreateWebhookModal() {
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900"><i class="fa-solid fa-plug text-indigo-500 mr-2"></i>New Webhook</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="wh-form" onsubmit="submitCreateWebhook(event)" class="p-5 space-y-4">
          ${webhookFormHtml()}
          <div id="wh-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Create Webhook</button>
          </div>
        </form>
      </div>
    </div>`);
  setTimeout(() => {
    const nameInp = document.querySelector('#wh-form [name="name"]');
    const urlInp  = document.querySelector('#wh-form [name="url"]');
    if (nameInp) setupFieldValidation(nameInp, [_validators.required]);
    if (urlInp)  setupFieldValidation(urlInp,  [_validators.required, _validators.url]);
  }, 50);
}

async function submitCreateWebhook(e) {
  e.preventDefault();
  const nameInp = e.target.querySelector('[name="name"]');
  const urlInp  = e.target.querySelector('[name="url"]');
  if (!validateForm([
    ...(nameInp ? [{input: nameInp, rules: [_validators.required]}] : []),
    ...(urlInp  ? [{input: urlInp,  rules: [_validators.required, _validators.url]}] : []),
  ])) return;
  const fd  = new FormData(e.target);
  const events = WEBHOOK_EVENTS.filter(ev => fd.get(`event_${ev.value}`)).map(ev => ev.value);
  const errEl = document.getElementById('wh-error');
  errEl.classList.add('hidden');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) setButtonLoading(submitBtn, true);
  try {
    await api.manager.createWebhook({ name: fd.get('name'), url: fd.get('url'), events, is_active: fd.get('is_active') ? 1 : 0 });
    showToast('Webhook created!');
    closeModal();
    await loadWebhooks();
  } catch(err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    if (submitBtn) setButtonLoading(submitBtn, false);
  }
}

function openEditWebhookModal(id) {
  const wh = _webhooks.find(w => w.id == id);
  if (!wh) return;
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900">Edit Webhook</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="edit-wh-form" onsubmit="submitEditWebhook(event,${id})" class="p-5 space-y-4">
          ${webhookFormHtml(wh)}
          <div id="edit-wh-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitEditWebhook(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const events = WEBHOOK_EVENTS.filter(ev => fd.get(`event_${ev.value}`)).map(ev => ev.value);
  const errEl = document.getElementById('edit-wh-error');
  errEl.classList.add('hidden');
  try {
    await api.manager.updateWebhook(id, { name: fd.get('name'), url: fd.get('url'), events, is_active: fd.get('is_active') ? 1 : 0 });
    showToast('Webhook updated!');
    closeModal();
    await loadWebhooks();
  } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function testWebhook(id) {
  showToast('Sending test event…', 'info');
  try {
    const r = await api.manager.testWebhook(id);
    if (r.success) showToast(`Test delivered! Status: ${r.status}`, 'success');
    else showToast(`Delivery failed (HTTP ${r.status})`, 'error');
  } catch(err) { showToast(err.message, 'error'); }
}

function deleteWebhook(id) {
  const wh = _webhooks.find(w => w.id == id);
  showConfirm({
    title: 'Delete webhook?',
    message: `"${wh?.name}" will be permanently deleted.`,
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteWebhook(id);
        showToast('Webhook deleted');
        await loadWebhooks();
      } catch(err) { showToast(err.message, 'error'); }
    }
  });
}
