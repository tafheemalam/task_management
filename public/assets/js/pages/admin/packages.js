async function renderAdminPackages() {
  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6">
      ${pageHeader('Packages', 'Manage subscription plans', `<button class="btn-primary" onclick="openCreatePackageModal()"><i class="fa-solid fa-plus"></i> Add Package</button>`)}
      <div id="packages-grid">Loading...</div>
    </div>`);
  await loadPackages();
}

let _pkgs = [];

async function loadPackages() {
  try {
    _pkgs = await api.admin.listPackages();
    renderPackagesGrid();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderPackagesGrid() {
  const el = document.getElementById('packages-grid');
  if (!_pkgs.length) { el.innerHTML = emptyState('fa-box', 'No packages yet', 'Create your first package'); return; }
  el.innerHTML = `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${_pkgs.map(p => `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 ${!p.is_active ? 'opacity-60' : ''}">
      <div class="flex items-start justify-between mb-3">
        <div>
          <div class="font-semibold text-gray-900">${p.name}</div>
          <div class="text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${p.type === 'yearly' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">${p.type}</div>
        </div>
        <div class="text-xl font-bold text-blue-600">$${parseFloat(p.price).toFixed(2)}</div>
      </div>
      <div class="text-sm text-gray-500 mb-4">${p.description || 'No description'}</div>
      <div class="flex items-center gap-4 text-xs text-gray-500 mb-4">
        <span><i class="fa-solid fa-users mr-1"></i>${p.max_users === 999 ? 'Unlimited' : p.max_users} users</span>
        ${statusDot(p.is_active)}
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary flex-1 justify-center text-xs" onclick="openEditPackageModal(${p.id})"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn-danger text-xs" onclick="deletePackage(${p.id})">${p.is_active ? '<i class="fa-solid fa-ban"></i> Disable' : '<i class="fa-solid fa-check"></i> Enable'}</button>
      </div>
    </div>`).join('')}</div>`;
}

function packageFormFields(p = {}) {
  return `
    <div><label class="label">Package Name *</label><input name="name" class="input" value="${p.name || ''}" required /></div>
    <div class="grid grid-cols-2 gap-4">
      <div><label class="label">Type *</label>
        <select name="type" class="input">
          <option value="monthly" ${(p.type || 'monthly') === 'monthly' ? 'selected' : ''}>Monthly</option>
          <option value="yearly" ${p.type === 'yearly' ? 'selected' : ''}>Yearly</option>
        </select>
      </div>
      <div><label class="label">Price ($) *</label><input name="price" type="number" step="0.01" min="0" class="input" value="${p.price || ''}" required /></div>
      <div><label class="label">Max Users *</label><input name="max_users" type="number" min="1" class="input" value="${p.max_users || 10}" required /></div>
      <div><label class="label">Status</label>
        <select name="is_active" class="input">
          <option value="1" ${(p.is_active === undefined || p.is_active) ? 'selected' : ''}>Active</option>
          <option value="0" ${p.is_active === 0 || p.is_active === '0' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
    <div><label class="label">Description</label><textarea name="description" class="input" rows="2">${p.description || ''}</textarea></div>`;
}

function openCreatePackageModal() {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">New Package</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="pkg-form" onsubmit="submitCreatePackage(event)" class="p-6 space-y-4">
          ${packageFormFields()}
          <div id="pkg-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Create Package</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitCreatePackage(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const errEl = document.getElementById('pkg-error');
  errEl.classList.add('hidden');
  try {
    await api.admin.createPackage(data);
    showToast('Package created!');
    closeModal();
    await loadPackages();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

function openEditPackageModal(id) {
  const p = _pkgs.find(x => x.id == id);
  if (!p) return;
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Edit: ${p.name}</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="edit-pkg-form" onsubmit="submitEditPackage(event,${id})" class="p-6 space-y-4">
          ${packageFormFields(p)}
          <div id="edit-pkg-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitEditPackage(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const errEl = document.getElementById('edit-pkg-error');
  errEl.classList.add('hidden');
  try {
    await api.admin.updatePackage(id, data);
    showToast('Package updated!');
    closeModal();
    await loadPackages();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function deletePackage(id) {
  const p = _pkgs.find(x => x.id == id);
  if (!p) return;
  const msg = p.is_active ? `Disable package "${p.name}"?` : `Re-enable package "${p.name}"?`;
  if (!confirmDialog(msg)) return;
  try {
    if (p.is_active) {
      await api.admin.deletePackage(id);
    } else {
      await api.admin.updatePackage(id, { ...p, is_active: 1 });
    }
    showToast(`Package ${p.is_active ? 'disabled' : 're-enabled'}!`);
    await loadPackages();
  } catch (err) { showToast(err.message, 'error'); }
}
