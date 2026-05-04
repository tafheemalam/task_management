async function renderAdminManagers() {
  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6">
      ${pageHeader('Managers', 'View and manage company managers')}
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div id="managers-table">Loading...</div>
      </div>
    </div>`);
  await loadManagers();
}

let _managers = [];

async function loadManagers() {
  try {
    _managers = await api.admin.listManagers();
    renderManagersTable();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderManagersTable() {
  document.getElementById('managers-table').innerHTML = tableWrapper(
    ['Manager', 'Email', 'Company', 'Joined', 'Status', 'Actions'],
    _managers.map(m => `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">${avatarInitials(m.name)}</div>
            <div class="font-medium text-gray-900">${m.name}</div>
          </div>
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">${m.email}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${m.company_name || '—'}</td>
        <td class="px-4 py-3 text-sm text-gray-500">${formatDate(m.created_at)}</td>
        <td class="px-4 py-3">${statusDot(m.is_active)}</td>
        <td class="px-4 py-3">
          <button class="text-sm ${m.is_active ? 'text-red-600' : 'text-green-600'} hover:underline" onclick="toggleManager(${m.id}, ${m.is_active})">
            ${m.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>`)
  );
}

async function toggleManager(id, current) {
  const m = _managers.find(x => x.id == id);
  if (!confirmDialog(`${current ? 'Deactivate' : 'Activate'} manager "${m?.name}"?`)) return;
  try {
    await api.admin.toggleManager(id);
    showToast(`Manager ${current ? 'deactivated' : 'activated'}!`);
    await loadManagers();
  } catch (err) { showToast(err.message, 'error'); }
}
