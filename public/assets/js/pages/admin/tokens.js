async function renderAdminTokens() {
  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6">
      ${pageHeader('Discount Tokens', 'Generate and manage discount codes', `<button class="btn-primary" onclick="openCreateTokenModal()"><i class="fa-solid fa-plus"></i> Generate Token</button>`)}
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div id="tokens-stats" class="grid grid-cols-3 gap-0 border-b border-gray-100 divide-x divide-gray-100 p-4"></div>
        <div id="tokens-table">Loading...</div>
      </div>
    </div>`);
  await loadTokens();
}

let _tokens = [];

async function loadTokens() {
  try {
    _tokens = await api.admin.listTokens();
    renderTokensTable();
    renderTokenStats();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderTokenStats() {
  const total = _tokens.length;
  const used = _tokens.filter(t => t.is_used).length;
  const available = total - used;
  document.getElementById('tokens-stats').innerHTML = `
    <div class="text-center p-3"><div class="text-2xl font-bold text-gray-900">${total}</div><div class="text-xs text-gray-500">Total Generated</div></div>
    <div class="text-center p-3"><div class="text-2xl font-bold text-green-600">${available}</div><div class="text-xs text-gray-500">Available</div></div>
    <div class="text-center p-3"><div class="text-2xl font-bold text-gray-500">${used}</div><div class="text-xs text-gray-500">Used</div></div>`;
}

function renderTokensTable() {
  document.getElementById('tokens-table').innerHTML = tableWrapper(
    ['Token Code', 'Discount', 'Status', 'Used By', 'Used At', 'Expires'],
    _tokens.map(t => `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="font-mono text-sm font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded">${t.token}</span>
            <button class="text-gray-400 hover:text-gray-600" title="Copy" onclick="navigator.clipboard.writeText('${t.token}').then(()=>showToast('Copied!'))"><i class="fa-solid fa-copy text-xs"></i></button>
          </div>
        </td>
        <td class="px-4 py-3">
          <span class="text-lg font-bold text-green-600">${t.discount_percentage}%</span>
          <span class="text-xs text-gray-400 ml-1">off</span>
        </td>
        <td class="px-4 py-3">
          ${t.is_used
            ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"><i class="fa-solid fa-check mr-1"></i>Used</span>'
            : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"><i class="fa-solid fa-circle-check mr-1"></i>Available</span>'}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">${t.company_name || '—'}</td>
        <td class="px-4 py-3 text-sm text-gray-500">${formatDate(t.used_at)}</td>
        <td class="px-4 py-3 text-sm text-gray-500">${formatDate(t.expires_at)}</td>
      </tr>`)
  );
}

function openCreateTokenModal() {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Generate Discount Token</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="token-form" onsubmit="submitCreateToken(event)" class="p-6 space-y-4">
          <div>
            <label class="label">Discount Percentage *</label>
            <div class="relative">
              <input name="discount_percentage" type="number" min="1" max="100" step="0.01" class="input pr-8" value="10" required />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">%</span>
            </div>
          </div>
          <div>
            <label class="label">Expiry Date (optional)</label>
            <input name="expires_at" type="date" class="input" />
          </div>
          <div class="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <i class="fa-solid fa-info-circle mr-2"></i>
            The token code will be auto-generated and can be shared with companies during registration.
          </div>
          <div id="token-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitCreateToken(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const errEl = document.getElementById('token-error');
  errEl.classList.add('hidden');
  try {
    const tok = await api.admin.createToken(data);
    showToast(`Token generated: ${tok.token}`);
    closeModal();
    await loadTokens();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}
