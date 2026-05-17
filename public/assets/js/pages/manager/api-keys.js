let _apiKeys = [];

async function renderApiKeys() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6 animate-fade-in-up">
      ${pageHeader('API Keys', 'Manage REST API access keys for integrations', `
        <button class="btn-primary" onclick="openCreateApiKeyModal()">
          <i class="fa-solid fa-plus"></i> New API Key
        </button>`)}
      <div id="api-keys-content">${skeletonTable(4, 5)}</div>
    </div>`);

  await refreshApiKeys();
}

async function refreshApiKeys() {
  try {
    _apiKeys = await api.manager.listApiKeys();
    renderApiKeysList();
  } catch (err) {
    document.getElementById('api-keys-content').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

function renderApiKeysList() {
  const container = document.getElementById('api-keys-content');
  container.innerHTML = `
    <div class="space-y-4">
      <!-- Keys List -->
      ${_apiKeys.length === 0
        ? `<div class="card">${emptyState('fa-key', 'No API keys', 'Generate a key to access the TaskFlow REST API', `<button class="btn-primary" onclick="openCreateApiKeyModal()"><i class="fa-solid fa-plus"></i> Create First API Key</button>`)}</div>`
        : `<div class="card overflow-hidden p-0">
             <div class="overflow-x-auto">
               <table class="w-full">
                 <thead>
                   <tr class="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                     <th class="text-left px-5 py-3.5">Name</th>
                     <th class="text-left px-5 py-3.5">Key Prefix</th>
                     <th class="text-left px-5 py-3.5">Permissions</th>
                     <th class="text-left px-5 py-3.5">Last Used</th>
                     <th class="text-left px-5 py-3.5">Status</th>
                     <th class="text-right px-5 py-3.5">Actions</th>
                   </tr>
                 </thead>
                 <tbody class="divide-y divide-gray-50">
                   ${_apiKeys.map(k => `
                     <tr class="hover:bg-gray-50 transition-colors group">
                       <td class="px-5 py-3.5">
                         <span class="font-semibold text-gray-900 text-sm">${escApiHtml(k.name)}</span>
                       </td>
                       <td class="px-5 py-3.5">
                         <code class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono">${escApiHtml(k.key_prefix)}…</code>
                       </td>
                       <td class="px-5 py-3.5">
                         <div class="flex flex-wrap gap-1">
                           ${(k.permissions || []).length
                             ? k.permissions.map(p => `<span class="inline-flex px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">${escApiHtml(p)}</span>`).join('')
                             : '<span class="text-xs text-gray-400">All permissions</span>'}
                         </div>
                       </td>
                       <td class="px-5 py-3.5 text-sm text-gray-500">
                         ${k.last_used_at ? formatDateTime(k.last_used_at) : '<span class="text-gray-300">Never</span>'}
                       </td>
                       <td class="px-5 py-3.5">
                         ${k.is_active
                           ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Active</span>'
                           : '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-red-100 text-red-600"><span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>Inactive</span>'}
                       </td>
                       <td class="px-5 py-3.5 text-right">
                         <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onclick="toggleApiKeyById(${k.id})"
                                   class="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
                             ${k.is_active ? 'Disable' : 'Enable'}
                           </button>
                           <button onclick="deleteApiKeyById(${k.id})"
                                   class="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                             <i class="fa-solid fa-trash"></i>
                           </button>
                         </div>
                       </td>
                     </tr>`).join('')}
                 </tbody>
               </table>
             </div>
           </div>`
      }

      <!-- API Documentation -->
      <div class="card">
        <h3 class="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <i class="fa-solid fa-book text-blue-500"></i> API Documentation
        </h3>
        <div class="space-y-4 text-sm">
          <div>
            <span class="font-medium text-gray-700">Base URL:</span>
            <code class="ml-2 bg-gray-100 px-2 py-0.5 rounded font-mono text-indigo-700">http://localhost:8080/api/v1</code>
          </div>
          <div>
            <span class="font-medium text-gray-700">Authentication:</span>
            <code class="ml-2 bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-600">Authorization: Bearer &lt;your-api-key&gt;</code>
          </div>
          <div>
            <p class="font-medium text-gray-700 mb-2">Example — List Tasks:</p>
            <pre class="bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">curl -X GET "http://localhost:8080/api/v1/tasks?per_page=20&page=1" \\
  -H "Authorization: Bearer tf_your_api_key_here" \\
  -H "Content-Type: application/json"</pre>
          </div>
          <div>
            <p class="font-medium text-gray-700 mb-2">Example — Create Task:</p>
            <pre class="bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">curl -X POST "http://localhost:8080/api/v1/tasks" \\
  -H "Authorization: Bearer tf_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Fix login bug","priority":"high","workflow_id":1}'</pre>
          </div>
          <div>
            <p class="font-medium text-gray-700 mb-2">Available endpoints:</p>
            <div class="space-y-1">
              ${[
                ['GET',   '/api/v1/tasks',          'List tasks (supports ?page, ?per_page, ?project_id, ?status)'],
                ['POST',  '/api/v1/tasks',          'Create task'],
                ['GET',   '/api/v1/tasks/{id}',     'Get single task'],
                ['PATCH', '/api/v1/tasks/{id}',     'Update task'],
                ['GET',   '/api/v1/projects',       'List projects'],
              ].map(([m, p, d]) => `
                <div class="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold shrink-0 font-mono
                    ${m === 'GET' ? 'bg-green-100 text-green-700' : m === 'POST' ? 'bg-blue-100 text-blue-700' : m === 'PATCH' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">
                    ${m}
                  </span>
                  <code class="text-xs text-indigo-700 font-mono shrink-0">${p}</code>
                  <span class="text-xs text-gray-500">${d}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function openCreateApiKeyModal() {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box p-6">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Create New API Key</h3>

        <div class="mb-4">
          <label class="label">Key Name <span class="text-red-400">*</span></label>
          <input id="ak-name" type="text" class="input" placeholder="e.g. Zapier Integration" required />
        </div>

        <div class="mb-5">
          <label class="label">Permissions</label>
          <p class="text-xs text-gray-400 mb-2">Leave all unchecked to grant full access.</p>
          <div class="grid grid-cols-2 gap-2">
            ${['read:tasks', 'write:tasks', 'read:projects', 'write:projects'].map(perm => `
              <label class="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
                <input type="checkbox" name="ak-perm" value="${perm}" class="rounded text-indigo-600" />
                <span class="text-sm text-gray-700">${perm}</span>
              </label>`).join('')}
          </div>
        </div>

        <div id="ak-create-error" class="hidden mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl"></div>

        <div class="flex gap-3">
          <button class="btn-primary flex-1" onclick="submitCreateApiKey()">
            <i class="fa-solid fa-key"></i> Generate Key
          </button>
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
      </div>
    </div>`);
  setTimeout(() => {
    const inp = document.getElementById('ak-name');
    if (inp) {
      inp.focus();
      setupFieldValidation(inp, [_validators.required]);
    }
  }, 100);
}

async function submitCreateApiKey() {
  const nameInput = document.getElementById('ak-name');
  const name  = nameInput?.value?.trim();
  const errEl = document.getElementById('ak-create-error');
  errEl.classList.add('hidden');

  if (!validateForm([...(nameInput ? [{input: nameInput, rules: [_validators.required]}] : [])])) return;

  if (!name) {
    errEl.textContent = 'Key name is required';
    errEl.classList.remove('hidden');
    return;
  }

  const submitBtn = document.querySelector('[onclick="submitCreateApiKey()"]');
  if (submitBtn) setButtonLoading(submitBtn, true);

  const perms = Array.from(document.querySelectorAll('input[name="ak-perm"]:checked')).map(el => el.value);

  try {
    const result = await api.manager.createApiKey({ name, permissions: perms });
    closeModal();
    showNewKeyModal(result);
    await refreshApiKeys();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    if (submitBtn) setButtonLoading(submitBtn, false);
  }
}

function showNewKeyModal(keyData) {
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box p-6">
        <div class="text-center mb-5">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 bg-green-100">
            <i class="fa-solid fa-check-circle text-green-600 text-3xl"></i>
          </div>
          <h3 class="text-lg font-bold text-gray-900">API Key Created!</h3>
          <p class="text-sm text-gray-500 mt-1">"${escApiHtml(keyData.name)}"</p>
        </div>

        <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-xl mb-4">
          <div class="flex items-center gap-2 mb-2 text-yellow-800 font-semibold text-sm">
            <i class="fa-solid fa-triangle-exclamation"></i>
            Store this key securely — it won't be shown again!
          </div>
          <code class="block text-sm font-mono text-gray-800 break-all leading-relaxed bg-white p-3 rounded-lg border border-yellow-200">${escApiHtml(keyData.key)}</code>
        </div>

        <button class="btn-primary w-full mb-3" onclick="copyApiKey('${escApiHtml(keyData.key)}')">
          <i class="fa-solid fa-copy"></i> Copy API Key
        </button>
        <button class="btn-secondary w-full" onclick="closeModal()">I've saved it — Close</button>
      </div>
    </div>`);
}

function copyApiKey(key) {
  navigator.clipboard.writeText(key).then(() => showToast('API key copied!', 'success'));
}

async function toggleApiKeyById(id) {
  try {
    await api.manager.toggleApiKey(id);
    await refreshApiKeys();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function deleteApiKeyById(id) {
  showConfirm({
    title: 'Delete API key?',
    message: 'This action cannot be undone. Any integrations using this key will stop working.',
    confirmLabel: 'Delete',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        await api.manager.deleteApiKey(id);
        showToast('API key deleted', 'info');
        await refreshApiKeys();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

function escApiHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
