const state = {
  user: null,
  currentPage: null,
  currentParams: {},
};

function showToast(msg, type = 'success') {
  const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-yellow-500' };
  const t = document.createElement('div');
  t.className = `fixed top-4 right-4 z-[9999] px-5 py-3 rounded-lg text-white text-sm font-medium shadow-lg transition-all ${colors[type] || colors.info}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function priorityBadge(p) {
  const cls = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };
  const icon = { high: '🔴', medium: '🟡', low: '🟢' };
  return `<span class="${cls[p] || 'badge-medium'}">${icon[p] || ''} ${p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Medium'}</span>`;
}

function stageBadge(name, color) {
  if (!name) return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">No Stage</span>';
  const bg = color || '#6366f1';
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style="background:${bg}22;color:${bg}">${name}</span>`;
}

function statusDot(isActive) {
  return isActive
    ? '<span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-400 inline-block"></span><span class="text-green-700 text-xs">Active</span></span>'
    : '<span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span><span class="text-red-700 text-xs">Inactive</span></span>';
}

function isOverdue(due_date) {
  if (!due_date) return false;
  return new Date(due_date) < new Date() && new Date(due_date).toDateString() !== new Date().toDateString();
}

function avatarInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function confirmDialog(message) {
  return confirm(message);
}

function openModal(html) {
  const el = document.getElementById('modal-root');
  el.innerHTML = html;
  el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const el = document.getElementById('modal-root');
  el.innerHTML = '';
  el.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderSidebar(role) {
  const adminItems = [
    { icon: 'fa-gauge-high', label: 'Dashboard', page: 'admin-dashboard' },
    { icon: 'fa-building', label: 'Companies', page: 'admin-companies' },
    { icon: 'fa-users', label: 'Managers', page: 'admin-managers' },
    { icon: 'fa-box', label: 'Packages', page: 'admin-packages' },
    { icon: 'fa-ticket', label: 'Discount Tokens', page: 'admin-tokens' },
    { icon: 'fa-file-signature', label: 'Subscription Requests', page: 'admin-subscription-requests' },
  ];
  const managerItems = [
    { icon: 'fa-gauge-high', label: 'Dashboard', page: 'manager-dashboard' },
    { icon: 'fa-users', label: 'Team Members', page: 'manager-users' },
    { icon: 'fa-diagram-project', label: 'Projects', page: 'manager-workflows' },
    { icon: 'fa-list-check', label: 'Tasks', page: 'manager-tasks' },
    { icon: 'fa-calendar-days', label: 'Calendar', page: 'manager-calendar' },
  ];
  const employeeItems = [
    { icon: 'fa-gauge-high', label: 'My Dashboard', page: 'employee-dashboard' },
    { icon: 'fa-list-check', label: 'My Tasks', page: 'employee-tasks' },
    { icon: 'fa-calendar-days', label: 'Calendar', page: 'employee-calendar' },
  ];
  const items = role === 'admin' ? adminItems : role === 'manager' ? managerItems : employeeItems;
  const roleLabel = role === 'admin' ? 'Administrator' : role === 'manager' ? 'Manager' : 'Employee';
  const rolePill  = role === 'admin'
    ? 'background:rgba(168,85,247,0.25);color:#e9d5ff'
    : role === 'manager'
    ? 'background:rgba(59,130,246,0.25);color:#bfdbfe'
    : 'background:rgba(34,197,94,0.25);color:#bbf7d0';

  return `
    <aside class="fixed inset-y-0 left-0 w-60 flex flex-col z-30"
           style="background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%)">

      <!-- Brand -->
      <div class="px-5 py-4" style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center"
               style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
            <i class="fa-solid fa-layer-group text-white text-sm"></i>
          </div>
          <div>
            <div class="text-sm font-bold text-white tracking-wide">TaskFlow</div>
            <div class="text-[11px]" style="color:rgba(255,255,255,0.4)">Project Management</div>
          </div>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 p-3 space-y-0.5 overflow-y-auto">
        ${items.map(item => `
          <div class="sidebar-item ${state.currentPage === item.page ? 'sidebar-active' : 'sidebar-inactive'}"
               onclick="navigate('${item.page}')">
            <i class="fa-solid ${item.icon} w-4 text-center opacity-80"></i>
            <span>${item.label}</span>
          </div>
        `).join('')}
      </nav>

      <!-- Footer -->
      <div class="p-4" style="border-top:1px solid rgba(255,255,255,0.08)">
        <!-- User row -->
        <div class="flex items-center gap-3 mb-2 px-2 py-2 rounded-xl" style="background:rgba(255,255,255,0.06)">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
               style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
            ${avatarInitials(state.user?.name)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-white truncate">${state.user?.name || ''}</div>
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mt-0.5"
                  style="${rolePill}">${roleLabel}</span>
          </div>
        </div>

        <!-- Notifications -->
        ${role !== 'admin' ? `
        <div class="sidebar-item sidebar-inactive mb-0.5" onclick="openNotificationsPanel()">
          <div class="relative w-4 text-center">
            <i class="fa-solid fa-bell opacity-80"></i>
            <span id="notif-badge" class="hidden absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"></span>
          </div>
          <span>Notifications</span>
        </div>` : ''}

        <!-- Sign out -->
        <button onclick="logout()"
                class="w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors"
                style="color:rgba(248,113,113,0.85)"
                onmouseover="this.style.background='rgba(239,68,68,0.12)'"
                onmouseout="this.style.background='transparent'">
          <i class="fa-solid fa-right-from-bracket w-4 text-center"></i>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>`;
}

function renderLayout(role, content) {
  const html = `
    ${renderSidebar(role)}
    <div class="ml-60 min-h-screen">
      <div id="modal-root" class="hidden"></div>
      ${content}
    </div>`;
  setTimeout(() => refreshNotifBadge(), 100);
  return html;
}

function pageHeader(title, subtitle = '', actions = '') {
  return `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-bold text-gray-900">${title}</h1>
        ${subtitle ? `<p class="text-sm text-gray-500 mt-0.5">${subtitle}</p>` : ''}
      </div>
      ${actions ? `<div class="flex items-center gap-2">${actions}</div>` : ''}
    </div>`;
}

function statCard(icon, value, label, color = 'blue', sub = '') {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };
  return `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-fade-in-up">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl ${colors[color] || colors.blue} flex items-center justify-center text-xl">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div>
          <div class="text-2xl font-bold text-gray-900">${value}</div>
          <div class="text-sm text-gray-500">${label}</div>
          ${sub ? `<div class="text-xs text-gray-400 mt-0.5">${sub}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function emptyState(icon, title, subtitle = '') {
  return `
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-2xl text-gray-400 mb-4">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="text-base font-medium text-gray-700 mb-1">${title}</div>
      ${subtitle ? `<div class="text-sm text-gray-400">${subtitle}</div>` : ''}
    </div>`;
}

function updateAttachLabel(input, labelId) {
  const el = document.getElementById(labelId);
  if (!el) return;
  el.textContent = input.files.length
    ? `${input.files.length} file${input.files.length > 1 ? 's' : ''} selected`
    : 'Choose files…';
}

async function uploadFilesAfterCreate(taskId, inputEl, uploadFn) {
  if (!inputEl?.files?.length) return 0;
  let uploaded = 0;
  for (const file of Array.from(inputEl.files)) {
    const fd = new FormData();
    fd.append('file', file);
    try { await uploadFn(taskId, fd); uploaded++; }
    catch (err) { showToast(`${file.name}: ${err.message}`, 'error'); }
  }
  if (uploaded) showToast(`${uploaded} file${uploaded > 1 ? 's' : ''} attached`);
  return uploaded;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function attachmentIcon(mime) {
  if (!mime) return '<i class="fa-solid fa-file text-sm"></i>';
  if (mime.startsWith('image/')) return '<i class="fa-solid fa-file-image text-sm"></i>';
  if (mime === 'application/pdf') return '<i class="fa-solid fa-file-pdf text-sm text-red-500"></i>';
  if (mime.includes('word')) return '<i class="fa-solid fa-file-word text-sm text-blue-600"></i>';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '<i class="fa-solid fa-file-excel text-sm text-green-600"></i>';
  if (mime.includes('zip')) return '<i class="fa-solid fa-file-zipper text-sm"></i>';
  if (mime === 'text/plain') return '<i class="fa-solid fa-file-lines text-sm"></i>';
  return '<i class="fa-solid fa-file text-sm"></i>';
}

function tableWrapper(headers, rows) {
  if (!rows.length) return emptyState('fa-inbox', 'No records found', 'Create one to get started');
  return `
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-100">
        <thead>
          <tr class="bg-gray-50">
            ${headers.map(h => `<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${rows.join('')}
        </tbody>
      </table>
    </div>`;
}

function tagBadge(tag) {
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                style="background:${tag.color}22;color:${tag.color};border:1px solid ${tag.color}44">
    ${tag.name}
  </span>`;
}

function exportTasksToCSV(tasks, filename = 'tasks.csv') {
  const headers = ['Title', 'Project', 'Stage', 'Priority', 'Assignee', 'Due Date', 'Created'];
  const rows = tasks.map(t => [
    `"${(t.title || '').replace(/"/g, '""')}"`,
    `"${(t.workflow_name || '').replace(/"/g, '""')}"`,
    t.stage_name || '',
    t.priority || '',
    `"${(t.assignee_name || '').replace(/"/g, '""')}"`,
    t.due_date || '',
    t.created_at ? t.created_at.split('T')[0] : '',
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported!');
}

async function openNotificationsPanel() {
  const isManager = state.user?.role === 'manager';
  let data;
  try {
    data = isManager ? await api.manager.listNotifications() : await api.employee.listNotifications();
  } catch (err) { showToast(err.message || 'Could not load notifications', 'error'); return; }

  const { notifications = [], unread_count = 0 } = data;

  openModal(`
    <div class="modal-overlay">
      <div class="modal-box max-w-md">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-bell text-blue-500"></i>
            <h3 class="font-semibold text-gray-900">Notifications</h3>
            ${unread_count > 0 ? `<span class="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-semibold">${unread_count} new</span>` : ''}
          </div>
          <div class="flex items-center gap-2">
            ${unread_count > 0 ? `<button onclick="markAllNotifsRead()" class="text-xs text-blue-600 hover:underline">Mark all read</button>` : ''}
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="max-h-96 overflow-y-auto divide-y divide-gray-50">
          ${notifications.length ? notifications.map(n => `
            <div class="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors
                        ${n.is_read ? '' : 'bg-blue-50/50'}"
                 onclick="clickNotif(${n.id}, ${n.task_id || 'null'})">
              <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5
                          ${n.type === 'task_assigned' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}">
                <i class="fa-solid ${n.type === 'task_assigned' ? 'fa-user-check' : 'fa-comment'} text-xs"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-800">${n.message}</div>
                <div class="text-xs text-gray-400 mt-0.5">${formatDateTime(n.created_at)}</div>
              </div>
              ${!n.is_read ? '<div class="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2"></div>' : ''}
            </div>`).join('')
          : `<div class="py-12 text-center text-sm text-gray-400">
               <i class="fa-solid fa-bell-slash text-2xl text-gray-200 block mb-3"></i>
               No notifications yet
             </div>`}
        </div>
      </div>
    </div>`);
}

async function clickNotif(id, taskId) {
  const isManager = state.user?.role === 'manager';
  try {
    if (isManager) await api.manager.markNotificationRead(id);
    else await api.employee.markNotificationRead(id);
  } catch {}
  closeModal();
  if (taskId) {
    navigate(isManager ? 'manager-task-detail' : 'employee-task-detail', { id: taskId });
  }
  refreshNotifBadge();
}

async function markAllNotifsRead() {
  const isManager = state.user?.role === 'manager';
  try {
    if (isManager) await api.manager.markAllNotificationsRead();
    else await api.employee.markAllNotificationsRead();
    closeModal();
    refreshNotifBadge();
    showToast('All notifications marked as read');
  } catch(e) { showToast(e.message, 'error'); }
}

async function refreshNotifBadge() {
  if (!state.user) return;
  if (state.user.role === 'admin') return;
  try {
    const isManager = state.user.role === 'manager';
    const data = isManager ? await api.manager.listNotifications() : await api.employee.listNotifications();
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const count = data.unread_count || 0;
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {}
}
