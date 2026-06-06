async function renderManagerUsers() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Team Members', 'Manage your company employees', `
        <div class="flex items-center gap-2">
          <button class="btn-secondary" onclick="openInviteModal()"><i class="fa-solid fa-envelope mr-1"></i> Invite by Email</button>
          <button class="btn-primary" onclick="openCreateUserModal()"><i class="fa-solid fa-user-plus mr-1"></i> Add Member</button>
        </div>`)}
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
        <div id="users-table">Loading...</div>
      </div>
      <div id="invitations-section"></div>
    </div>`);
  await Promise.all([loadUsers(), loadInvitations()]);
}

let _users = [];
let _invitations = [];

async function loadUsers() {
  try {
    _users = await api.manager.listUsers();
    renderUsersTable();
  } catch (err) { showToast(err.message, 'error'); }
}

async function loadInvitations() {
  try {
    _invitations = await api.manager.listInvitations();
    renderInvitationsSection();
  } catch (err) { /* invitations table may not exist yet — silently ignore */ }
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

function renderInvitationsSection() {
  const el = document.getElementById('invitations-section');
  if (!el) return;
  if (!_invitations.length) { el.innerHTML = ''; return; }

  const rows = _invitations.map(inv => `
    <tr class="hover:bg-gray-50">
      <td class="px-4 py-3 text-sm text-gray-800">${inv.email}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${formatDate(inv.expires_at)}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${formatDate(inv.created_at)}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <button class="text-sm text-blue-600 hover:underline whitespace-nowrap" onclick="copyInviteLink('${inv.link}', this)">
            <i class="fa-solid fa-copy mr-1"></i>Copy Link
          </button>
          <button class="text-sm text-red-600 hover:underline" onclick="doRevokeInvitation(${inv.id})">Revoke</button>
        </div>
      </td>
    </tr>`).join('');

  el.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <i class="fa-solid fa-envelope-open-text text-indigo-500"></i>
        <h3 class="font-semibold text-gray-800 text-sm">Pending Invitations</h3>
        <span class="ml-auto text-xs text-gray-400">${_invitations.length} pending</span>
      </div>
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 text-xs uppercase text-gray-500">
          <th class="px-4 py-2 text-left font-semibold">Email</th>
          <th class="px-4 py-2 text-left font-semibold">Expires</th>
          <th class="px-4 py-2 text-left font-semibold">Sent</th>
          <th class="px-4 py-2 text-left font-semibold">Actions</th>
        </tr></thead>
        <tbody class="divide-y divide-gray-50">${rows}</tbody>
      </table>
    </div>`;
}

function copyInviteLink(link, btn) {
  navigator.clipboard.writeText(link).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Copied!';
    btn.classList.add('text-green-600');
    btn.classList.remove('text-blue-600');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('text-green-600'); btn.classList.add('text-blue-600'); }, 2000);
  }).catch(() => {
    // Fallback: show link in prompt
    window.prompt('Copy this invitation link:', link);
  });
}

async function doRevokeInvitation(id) {
  if (!confirmDialog('Revoke this invitation?')) return;
  try {
    await api.manager.revokeInvitation(id);
    showToast('Invitation revoked');
    await loadInvitations();
  } catch (err) { showToast(err.message, 'error'); }
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

// ── Invite by Email Modal ──────────────────────────────────────────────────

function openInviteModal() {
  openModal(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Invite by Email</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="invite-form" onsubmit="submitInvite(event)" class="p-6 space-y-4">
          <p class="text-sm text-gray-500">An invitation link will be generated. Share it with your team member so they can set up their own account.</p>
          <div>
            <label class="label">Email Address <span class="text-red-500">*</span></label>
            <input name="email" type="email" class="input" placeholder="colleague@example.com" required autofocus />
          </div>
          <div id="invite-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div id="invite-result" class="hidden p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <p class="text-sm font-semibold text-green-800"><i class="fa-solid fa-circle-check mr-1"></i>Invitation created!</p>
            <p class="text-xs text-green-700">Share this link with your team member:</p>
            <div class="flex items-center gap-2">
              <input id="invite-link-input" class="input text-xs flex-1" readonly />
              <button type="button" onclick="copyInviteLinkFromModal()" class="btn-secondary text-xs whitespace-nowrap"><i class="fa-solid fa-copy mr-1"></i>Copy</button>
            </div>
            <p class="text-xs text-green-600">Link expires in 7 days.</p>
          </div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" onclick="closeModal()">Close</button>
            <button id="invite-submit-btn" type="submit" class="btn-primary">Send Invite</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function submitInvite(e) {
  e.preventDefault();
  const fd     = new FormData(e.target);
  const email  = fd.get('email');
  const errEl  = document.getElementById('invite-error');
  const resEl  = document.getElementById('invite-result');
  const btn    = document.getElementById('invite-submit-btn');
  errEl.classList.add('hidden');
  resEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'Sending…';

  try {
    const res = await api.manager.createInvitation(email);
    document.getElementById('invite-link-input').value = res.link;
    resEl.classList.remove('hidden');
    btn.classList.add('hidden');
    e.target.querySelector('input[name="email"]').disabled = true;
    await loadInvitations();
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Send Invite';
  }
}

function copyInviteLinkFromModal() {
  const input = document.getElementById('invite-link-input');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Invite link copied!');
  }).catch(() => { input.select(); document.execCommand('copy'); showToast('Invite link copied!'); });
}

// ── Manual Create / Edit (unchanged) ──────────────────────────────────────

function userFormFields(u = {}) {
  return `
    <div><label class="label">Full Name <span class="text-red-500">*</span></label><input name="name" class="input" value="${u.name || ''}" required /></div>
    <div><label class="label">Email <span class="text-red-500">*</span></label><input name="email" type="email" class="input" value="${u.email || ''}" required /></div>
    <div><label class="label">Password ${u.id ? '<span class="text-gray-400 font-normal text-xs">(leave blank to keep current)</span>' : '<span class="text-red-500">*</span>'}</label><input name="password" type="password" class="input" ${!u.id ? 'required minlength="6"' : ''} /></div>
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
    <div class="modal-overlay">
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
    <div class="modal-overlay">
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
