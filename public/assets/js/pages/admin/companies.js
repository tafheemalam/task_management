let _packages = [];

async function renderAdminCompanies() {
  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6">
      ${pageHeader('Companies', 'Manage registered companies', `<button class="btn-primary" onclick="openCreateCompanyModal()"><i class="fa-solid fa-plus"></i> Register Company</button>`)}
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div class="p-4 border-b border-gray-100">
          <input type="text" id="company-search" class="input max-w-sm" placeholder="Search companies..." oninput="filterCompanies()" />
        </div>
        <div id="companies-table">Loading...</div>
      </div>
    </div>`);
  document.getElementById('modal-root').className = 'hidden';
  await loadCompanies();
}

let _companies = [];

async function loadCompanies() {
  try {
    [_companies, _packages] = await Promise.all([api.admin.listCompanies(), api.admin.listPackages()]);
    renderCompaniesTable(_companies);
  } catch (err) { showToast(err.message, 'error'); }
}

function filterCompanies() {
  const q = document.getElementById('company-search').value.toLowerCase();
  renderCompaniesTable(_companies.filter(c => c.name.toLowerCase().includes(q) || (c.manager_name || '').toLowerCase().includes(q)));
}

function renderCompaniesTable(list) {
  document.getElementById('companies-table').innerHTML = tableWrapper(
    ['Company', 'Manager', 'Package', 'Expires', 'Status', 'Actions'],
    list.map(c => `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-3">
          <div class="font-medium text-gray-900">${c.name}</div>
          <div class="text-xs text-gray-400">${c.email || ''}</div>
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">
          <div>${c.manager_name || '<span class="text-gray-400">—</span>'}</div>
          <div class="text-xs text-gray-400">${c.manager_email || ''}</div>
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">${c.package_name || '<span class="text-gray-400">—</span>'}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${formatDate(c.package_expires_at)}</td>
        <td class="px-4 py-3">${statusDot(c.is_active)}</td>
        <td class="px-4 py-3">
          <button class="text-sm text-blue-600 hover:underline mr-3" onclick="openEditCompanyModal(${c.id})">Edit</button>
          <button class="text-sm ${c.is_active ? 'text-red-600' : 'text-green-600'} hover:underline" onclick="toggleCompanyStatus(${c.id}, ${c.is_active})">${c.is_active ? 'Deactivate' : 'Activate'}</button>
        </td>
      </tr>`)
  );
}

async function toggleCompanyStatus(id, current) {
  const c = _companies.find(x => x.id == id);
  if (!c) return;
  try {
    await api.admin.updateCompany(id, { ...c, is_active: current ? 0 : 1 });
    showToast(`Company ${current ? 'deactivated' : 'activated'}`);
    await loadCompanies();
  } catch (err) { showToast(err.message, 'error'); }
}

function openCreateCompanyModal() {
  const pkgOptions = _packages.filter(p => p.is_active).map(p => `<option value="${p.id}">${p.name} ($${p.price}/${p.type})</option>`).join('');
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Register New Company</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="company-form" onsubmit="submitCreateCompany(event)" class="p-6 space-y-4">
          <div class="font-medium text-sm text-gray-700 flex items-center gap-2"><i class="fa-solid fa-building text-blue-500"></i> Company Details</div>
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2"><label class="label">Company Name *</label><input name="name" class="input" required /></div>
            <div><label class="label">Email</label><input name="email" type="email" class="input" /></div>
            <div><label class="label">Phone</label><input name="phone" class="input" /></div>
            <div class="col-span-2"><label class="label">Address</label><input name="address" class="input" /></div>
            <div><label class="label">Package</label><select name="package_id" class="input"><option value="">No Package</option>${pkgOptions}</select></div>
            <div><label class="label">Discount Code</label><input name="discount_code" class="input" placeholder="Optional" /></div>
            <div><label class="label">Package Start</label><input name="package_starts_at" type="date" class="input" /></div>
            <div><label class="label">Package Expires</label><input name="package_expires_at" type="date" class="input" /></div>
          </div>
          <div class="border-t border-gray-100 pt-4">
            <div class="font-medium text-sm text-gray-700 flex items-center gap-2 mb-3"><i class="fa-solid fa-user-tie text-green-500"></i> Manager Account</div>
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2"><label class="label">Manager Full Name *</label><input name="manager_name" class="input" required /></div>
              <div><label class="label">Manager Email *</label><input name="manager_email" type="email" class="input" required /></div>
              <div><label class="label">Manager Password *</label><input name="manager_password" type="password" class="input" required minlength="6" /></div>
            </div>
          </div>
          <div id="form-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Register Company</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitCreateCompany(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const errEl = document.getElementById('form-error');
  errEl.classList.add('hidden');
  try {
    await api.admin.createCompany(data);
    showToast('Company registered successfully!');
    closeModal();
    await loadCompanies();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function openEditCompanyModal(id) {
  const c = _companies.find(x => x.id == id);
  if (!c) return;
  const pkgOptions = _packages.filter(p => p.is_active).map(p => `<option value="${p.id}" ${c.package_id == p.id ? 'selected' : ''}>${p.name} ($${p.price}/${p.type})</option>`).join('');
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Edit Company: ${c.name}</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="edit-company-form" onsubmit="submitEditCompany(event, ${id})" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2"><label class="label">Company Name *</label><input name="name" class="input" value="${c.name}" required /></div>
            <div><label class="label">Email</label><input name="email" type="email" class="input" value="${c.email || ''}" /></div>
            <div><label class="label">Phone</label><input name="phone" class="input" value="${c.phone || ''}" /></div>
            <div class="col-span-2"><label class="label">Address</label><input name="address" class="input" value="${c.address || ''}" /></div>
            <div><label class="label">Package</label><select name="package_id" class="input"><option value="">No Package</option>${pkgOptions}</select></div>
            <div><label class="label">Status</label>
              <select name="is_active" class="input">
                <option value="1" ${c.is_active ? 'selected' : ''}>Active</option>
                <option value="0" ${!c.is_active ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
            <div><label class="label">Package Start</label><input name="package_starts_at" type="date" class="input" value="${c.package_starts_at || ''}" /></div>
            <div><label class="label">Package Expires</label><input name="package_expires_at" type="date" class="input" value="${c.package_expires_at || ''}" /></div>
          </div>
          <div id="edit-form-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitEditCompany(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const errEl = document.getElementById('edit-form-error');
  errEl.classList.add('hidden');
  try {
    await api.admin.updateCompany(id, data);
    showToast('Company updated!');
    closeModal();
    await loadCompanies();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}
