async function renderManagerUsers() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Team Members', 'Manage your company employees', `<button class="btn-primary" onclick="openCreateUserModal()"><i class="fa-solid fa-user-plus"></i> Add Member</button>`)}
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div id="users-table">Loading...</div>
      </div>
    </div>`);
  await loadUsers();
}

let _users = [];

async function loadUsers() {
  try {
    _users = await api.manager.listUsers();
    renderUsersTable();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderUsersTable() {
  document.getElementById('users-table').innerHTML = tableWrapper(
    ['Member', 'Email', 'Task Creation', 'Status', 'Joined', 'Actions'],
    _users.map(u => `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">${avatarInitials(u.name)}</div>
            <div class="font-medium text-gray-900">${u.name}</div>
          </div>
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">${u.email}</td>
        <td class="px-4 py-3">
          <button onclick="toggleTaskCreation(${u.id})" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${u.can_create_tasks ? 'bg-blue-600' : 'bg-gray-200'}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${u.can_create_tasks ? 'translate-x-6' : 'translate-x-1'}"></span>
          </button>
          <span class="ml-2 text-xs text-gray-500">${u.can_create_tasks ? 'Enabled' : 'Disabled'}</span>
        </td>
        <td class="px-4 py-3">${statusDot(u.is_active)}</td>
        <td class="px-4 py-3 text-sm text-gray-500">${formatDate(u.created_at)}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <button class="text-sm text-blue-600 hover:underline" onclick="openEditUserModal(${u.id})">Edit</button>
            <button class="text-sm ${u.is_active ? 'text-red-600' : 'text-green-600'} hover:underline" onclick="toggleUserStatus(${u.id}, ${u.is_active})">
              ${u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>`)
  );
}

async function toggleTaskCreation(id) {
  try {
    const res = await api.manager.toggleTaskCreation(id);
    const u = _users.find(x => x.id == id);
    if (u) u.can_create_tasks = res.can_create_tasks;
    renderUsersTable();
    showToast(`Task creation ${res.can_create_tasks ? 'enabled' : 'disabled'}!`);
  } catch (err) { showToast(err.message, 'error'); }
}

async function toggleUserStatus(id, current) {
  const u = _users.find(x => x.id == id);
  if (!confirmDialog(`${current ? 'Deactivate' : 'Activate'} "${u?.name}"?`)) return;
  try {
    await api.manager.toggleUserStatus(id);
    showToast(`User ${current ? 'deactivated' : 'activated'}!`);
    await loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

function userFormFields(u = {}) {
  return `
    <div><label class="label">Full Name *</label><input name="name" class="input" value="${u.name || ''}" required /></div>
    <div><label class="label">Email *</label><input name="email" type="email" class="input" value="${u.email || ''}" required /></div>
    <div><label class="label">Password ${u.id ? '(leave blank to keep current)' : '*'}</label><input name="password" type="password" class="input" ${!u.id ? 'required minlength="6"' : ''} /></div>
    <div class="flex items-center gap-3">
      <input type="checkbox" name="can_create_tasks" id="cct" value="1" ${u.can_create_tasks ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded" />
      <label for="cct" class="text-sm text-gray-700">Allow task creation</label>
    </div>
    ${u.id ? `<div class="flex items-center gap-3">
      <input type="checkbox" name="is_active" id="ia" value="1" ${u.is_active ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded" />
      <label for="ia" class="text-sm text-gray-700">Account is active</label>
    </div>` : ''}`;
}

function openCreateUserModal() {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Add Team Member</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="user-form" onsubmit="submitCreateUser(event)" class="p-6 space-y-4">
          ${userFormFields()}
          <div id="user-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Add Member</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitCreateUser(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (!data.can_create_tasks) data.can_create_tasks = 0;
  const errEl = document.getElementById('user-error');
  errEl.classList.add('hidden');
  try {
    await api.manager.createUser(data);
    showToast('Team member added!');
    closeModal();
    await loadUsers();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

function openEditUserModal(id) {
  const u = _users.find(x => x.id == id);
  if (!u) return;
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Edit: ${u.name}</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="edit-user-form" onsubmit="submitEditUser(event,${id})" class="p-6 space-y-4">
          ${userFormFields(u)}
          <div id="edit-user-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitEditUser(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (!data.can_create_tasks) data.can_create_tasks = 0;
  if (!data.is_active) data.is_active = 0;
  const errEl = document.getElementById('edit-user-error');
  errEl.classList.add('hidden');
  try {
    await api.manager.updateUser(id, data);
    showToast('User updated!');
    closeModal();
    await loadUsers();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}
