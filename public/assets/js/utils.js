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

// ── Skeletons ────────────────────────────────────────────────────────────────

function skeletonCard(lines = 3) {
  const lineHtml = Array.from({length: lines}, (_, i) =>
    `<div class="skeleton skeleton-text ${i === 0 ? '' : i === lines-1 ? 'w-1/2' : 'w-3/4'}"></div>`
  ).join('');
  return `
  <div class="card mb-3">
    <div class="skeleton skeleton-title w-3/4"></div>
    ${lineHtml}
    <div class="flex gap-2 mt-3">
      <div class="skeleton skeleton-badge"></div>
      <div class="skeleton skeleton-badge"></div>
    </div>
  </div>`;
}

function skeletonCards(count = 3) {
  return Array.from({length: count}, () => skeletonCard()).join('');
}

function skeletonTable(rows = 5, cols = 5) {
  const headerCells = Array.from({length: cols}, () =>
    `<th class="px-4 py-3"><div class="skeleton skeleton-text w-3/4 mb-0"></div></th>`
  ).join('');
  const rowHtml = Array.from({length: rows}, () => {
    const cells = Array.from({length: cols}, (_, i) =>
      `<td class="px-4 py-3"><div class="skeleton skeleton-text ${i === 0 ? '' : 'w-3/4'} mb-0"></div></td>`
    ).join('');
    return `<tr class="border-t border-gray-100">${cells}</tr>`;
  }).join('');
  return `
  <div class="card overflow-hidden p-0">
    <table class="w-full">
      <thead class="bg-gray-50"><tr>${headerCells}</tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
  </div>`;
}

function skeletonStatCards(count = 4) {
  return `<div class="grid grid-cols-2 lg:grid-cols-${count} gap-4 mb-6">` +
    Array.from({length: count}, () => `
    <div class="card flex items-center gap-4">
      <div class="skeleton skeleton-avatar" style="border-radius:12px;width:48px;height:48px"></div>
      <div class="flex-1">
        <div class="skeleton skeleton-title mb-1" style="width:60px;height:28px"></div>
        <div class="skeleton skeleton-text w-3/4 mb-0"></div>
      </div>
    </div>`).join('') + `</div>`;
}

function skeletonKanban(cols = 3) {
  return `<div class="grid gap-4" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">` +
    Array.from({length: cols}, () => `
    <div class="card">
      <div class="skeleton skeleton-title w-1/2 mb-4"></div>
      ${skeletonCards(2)}
    </div>`).join('') + `</div>`;
}

// ── Empty States ─────────────────────────────────────────────────────────────

function emptyColumnState() {
  return `<div class="flex flex-col items-center py-8 text-center opacity-60">
    <i class="fa-regular fa-square-dashed text-2xl text-gray-300 mb-2"></i>
    <p class="text-xs text-gray-400">No tasks</p>
  </div>`;
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

function showConfirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', confirmClass = 'btn-danger', cancelLabel = 'Cancel', onConfirm, onCancel } = {}) {
  // Remove existing confirm if any
  document.getElementById('confirm-dialog-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-dialog-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box max-w-sm animate-fade-in-up" style="padding:28px">
      <div class="flex items-start gap-4 mb-4">
        <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 mb-1">${title}</h3>
          ${message ? `<p class="text-sm text-gray-500">${message}</p>` : ''}
        </div>
      </div>
      <div class="flex gap-2 justify-end">
        <button id="confirm-cancel-btn" class="btn-secondary">${cancelLabel}</button>
        <button id="confirm-ok-btn" class="${confirmClass}">${confirmLabel}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  document.getElementById('confirm-ok-btn').onclick = () => { close(); onConfirm?.(); };
  document.getElementById('confirm-cancel-btn').onclick = () => { close(); onCancel?.(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) { close(); onCancel?.(); } });

  // Focus confirm button
  setTimeout(() => document.getElementById('confirm-ok-btn')?.focus(), 50);
}

// ── Form Validation ───────────────────────────────────────────────────────────

const _validators = {
  required: (v) => v.trim() !== '' || 'This field is required',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email address',
  minLen: (n) => (v) => v.length >= n || `At least ${n} characters required`,
  maxLen: (n) => (v) => v.length <= n || `Maximum ${n} characters`,
  url: (v) => { try { new URL(v); return true; } catch { return 'Enter a valid URL'; } },
  number: (v) => !isNaN(Number(v)) || 'Must be a number',
  positive: (v) => Number(v) > 0 || 'Must be greater than 0',
};

function validateField(input, rules = []) {
  const value = input.value ?? '';
  for (const rule of rules) {
    const result = rule(value);
    if (result !== true) {
      setFieldError(input, result);
      return false;
    }
  }
  clearFieldError(input);
  return true;
}

function setFieldError(input, message) {
  clearFieldError(input);
  input.classList.add('border-red-400', 'bg-red-50');
  input.classList.remove('border-gray-300');
  const err = document.createElement('p');
  err.className = 'field-error text-xs text-red-500 mt-1';
  err.textContent = message;
  input.parentNode.insertBefore(err, input.nextSibling);
}

function clearFieldError(input) {
  input.classList.remove('border-red-400', 'bg-red-50');
  input.classList.add('border-gray-300');
  input.parentNode.querySelector('.field-error')?.remove();
}

function setupFieldValidation(input, rules) {
  input.addEventListener('blur', () => validateField(input, rules));
  input.addEventListener('input', () => {
    if (input.classList.contains('border-red-400')) validateField(input, rules);
  });
}

function validateForm(fields) {
  // fields: [{input, rules}]
  let valid = true;
  for (const {input, rules} of fields) {
    if (!validateField(input, rules)) valid = false;
  }
  return valid;
}

// ── Button Loading State ──────────────────────────────────────────────────────

function setButtonLoading(btn, loading, originalHtml) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml || originalHtml || 'Save';
  }
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
    { icon: 'fa-palette', label: 'Branding', page: 'admin-branding' },
  ];
  const managerItems = [
    { icon: 'fa-gauge-high', label: 'Dashboard', page: 'manager-dashboard' },
    { icon: 'fa-users', label: 'Team Members', page: 'manager-users' },
    { icon: 'fa-diagram-project', label: 'Projects', page: 'manager-workflows' },
    { icon: 'fa-list-check', label: 'Tasks', page: 'manager-tasks' },
    { icon: 'fa-calendar-days', label: 'Calendar', page: 'manager-calendar' },
    { icon: 'fa-clock', label: 'Time Report', page: 'manager-time-report' },
    { icon: 'fa-plug', label: 'Webhooks', page: 'manager-webhooks' },
    { icon: 'fa-chart-bar', label: 'Workload', page: 'manager-workload' },
    { icon: 'fa-key', label: 'API Keys', page: 'manager-api-keys' },
    { icon: 'fa-sliders', label: 'Custom Fields', page: 'manager-custom-fields' },
    { icon: 'fa-layer-group', label: 'Templates', page: 'manager-templates' },
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
          ${localStorage.getItem('brand_logo')
            ? `<img src="${localStorage.getItem('brand_logo')}" alt="Logo" class="w-9 h-9 rounded-xl object-contain bg-white p-0.5" />`
            : `<div class="w-9 h-9 rounded-xl flex items-center justify-center"
                    style="background:linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))">
                <i class="fa-solid fa-layer-group text-white text-sm"></i>
               </div>`}
          <div>
            <div class="text-sm font-bold text-white tracking-wide" id="sidebar-brand-name">${localStorage.getItem('brand_name') || 'TaskFlow'}</div>
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
        <div class="sidebar-item ${state.currentPage === 'shared-profile' ? 'sidebar-active' : 'sidebar-inactive'} mt-1"
             onclick="navigate('shared-profile')"
             style="border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;margin-top:4px">
          <i class="fa-solid fa-user-circle w-4 text-center opacity-80"></i>
          <span>My Profile</span>
        </div>
        <div class="sidebar-item sidebar-inactive" onclick="openCommandPalette()">
          <i class="fa-solid fa-magnifying-glass w-4 text-center opacity-80"></i>
          <span>Search</span>
          <kbd style="margin-left:auto;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);border-radius:4px;padding:1px 6px;font-size:10px;border:1px solid rgba(255,255,255,0.12)">⌘K</kbd>
        </div>
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

let _sseSource = null;

function startSSE() {
  if (_sseSource) return; // Already connected
  const token = api.token;
  if (!token || !state.user || state.user.role === 'admin') return;
  try {
    _sseSource = new EventSource(`/api/sse?token=${encodeURIComponent(token)}`);
    _sseSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'notification') {
          refreshNotifBadge();
          showToast(msg.data.message, 'info');
        } else if (msg.type === 'disabled') {
          // Built-in server: fall back to periodic polling
          _sseSource?.close(); _sseSource = null;
          setInterval(refreshNotifBadge, 30000);
        }
      } catch {}
    };
    _sseSource.onerror = () => {
      _sseSource?.close();
      _sseSource = null;
      setTimeout(startSSE, 60000); // Retry after 60s
    };
  } catch {}
}

async function loadAndApplyBranding() {
  try {
    const data = await api.getBrandingSettings();
    if (data.primary_color) {
      document.documentElement.style.setProperty('--brand-primary', data.primary_color);
    }
    if (data.secondary_color) {
      document.documentElement.style.setProperty('--brand-secondary', data.secondary_color);
      document.documentElement.style.setProperty('--brand-sidebar-start', data.primary_color || '#0f172a');
      document.documentElement.style.setProperty('--brand-sidebar-end', data.secondary_color);
    }
    if (data.logo_url) {
      localStorage.setItem('brand_logo', data.logo_url);
    } else {
      localStorage.removeItem('brand_logo');
    }
    if (data.company_display_name) {
      localStorage.setItem('brand_name', data.company_display_name);
      const el = document.getElementById('sidebar-brand-name');
      if (el) el.textContent = data.company_display_name;
    } else {
      localStorage.removeItem('brand_name');
    }
  } catch (_) {
    // Branding not available — silently ignore
  }
}

function renderLayout(role, content) {
  const html = `
    ${renderSidebar(role)}
    <div class="ml-60 min-h-screen">
      <div id="modal-root" class="hidden"></div>
      ${content}
    </div>`;
  setTimeout(() => { refreshNotifBadge(); startSSE(); loadAndApplyBranding(); }, 100);
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

function emptyState(icon, title, message = '', actionHtml = '') {
  return `
  <div class="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in-up">
    <div class="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
      <i class="fa-solid ${icon} text-3xl text-indigo-400"></i>
    </div>
    <h3 class="text-lg font-semibold text-gray-800 mb-1">${title}</h3>
    ${message ? `<p class="text-sm text-gray-500 max-w-xs mb-5">${message}</p>` : ''}
    ${actionHtml}
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
  if (!rows.length) return emptyState('fa-inbox', 'No records found', 'Create one to get started', '');
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

function exportTasksToPDF(tasks, title = 'Task Report') {
  const today = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const win = window.open('', '_blank');
  const rows = tasks.map(t => {
    const od = t.due_date && new Date(t.due_date) < new Date() && !['Done','Closed'].includes(t.stage_name);
    return `<tr>
      <td>${t.title}</td>
      <td>${t.workflow_name || '—'}</td>
      <td><span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
          background:${t.priority==='high'?'#fee2e2':t.priority==='low'?'#dcfce7':'#fef9c3'};
          color:${t.priority==='high'?'#dc2626':t.priority==='low'?'#16a34a':'#ca8a04'}">${t.priority||'medium'}</span></td>
      <td>${t.stage_name ? `<span style="padding:2px 8px;border-radius:4px;font-size:11px;background:${t.stage_color}22;color:${t.stage_color}">${t.stage_name}</span>` : '—'}</td>
      <td>${t.assignee_name || '—'}</td>
      <td style="color:${od?'#dc2626':'inherit'};font-weight:${od?600:400}">${t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
    </tr>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 32px; color: #1e293b; }
      h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; color: #0f172a; }
      .meta { font-size: 13px; color: #64748b; margin-bottom: 24px; }
      .accent { display:inline-block;width:4px;height:22px;background:linear-gradient(135deg,#6366f1,#3b82f6);border-radius:2px;vertical-align:middle;margin-right:10px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      thead tr { background: linear-gradient(135deg,#6366f1,#3b82f6); color: white; }
      th { padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
      tr:nth-child(even) td { background: #f8fafc; }
      .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
    </style></head><body>
    <h1><span class="accent"></span>${title}</h1>
    <div class="meta">Generated on ${today} · ${tasks.length} task${tasks.length!==1?'s':''}</div>
    <table>
      <thead><tr><th>Task</th><th>Project</th><th>Priority</th><th>Stage</th><th>Assignee</th><th>Due Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">TaskFlow — Project Management Platform</div>
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

function exportTasksToExcel(tasks, filename = 'tasks.xlsx', title = 'Task Report', filterSummary = '') {
  if (typeof XLSX === 'undefined') { showToast('Excel library not loaded — please refresh and try again', 'error'); return; }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Meta rows at top
  const aoa = [
    [title],
    [`Generated: ${today}${filterSummary ? '  |  ' + filterSummary : ''}`],
    [`Total tasks: ${tasks.length}`],
    [], // blank spacer
    // Column headers
    ['#', 'Title', 'Description', 'Project', 'Stage', 'Priority', 'Assignee', 'Creator',
     'Start Date', 'Due Date', 'Overdue?', 'Recurrence', 'Checklist Items', 'Days Stale',
     'Created', 'Last Updated'],
  ];

  const today0 = new Date(new Date().toDateString());

  for (const t of tasks) {
    const od = t.due_date && new Date(t.due_date) < today0
               && !['done','closed'].includes((t.stage_name || '').toLowerCase());
    aoa.push([
      t.id,
      t.title || '',
      (t.description || '').replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim(),
      t.workflow_name || '',
      t.stage_name || '',
      t.priority ? t.priority.charAt(0).toUpperCase() + t.priority.slice(1) : '',
      t.assignee_name || '',
      t.creator_name || '',
      t.start_date || '',
      t.due_date || '',
      od ? 'Yes' : 'No',
      t.recurrence_rule && t.recurrence_rule !== 'none' ? t.recurrence_rule : '',
      t.subtask_count ? +t.subtask_count : 0,
      t.days_since_moved ? +t.days_since_moved : 0,
      t.created_at ? t.created_at.split('T')[0] : '',
      t.updated_at ? t.updated_at.split('T')[0] : '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = [
    {wch: 6},   // #
    {wch: 42},  // Title
    {wch: 52},  // Description
    {wch: 22},  // Project
    {wch: 18},  // Stage
    {wch: 12},  // Priority
    {wch: 22},  // Assignee
    {wch: 22},  // Creator
    {wch: 14},  // Start Date
    {wch: 14},  // Due Date
    {wch: 10},  // Overdue?
    {wch: 14},  // Recurrence
    {wch: 16},  // Checklist Items
    {wch: 12},  // Days Stale
    {wch: 14},  // Created
    {wch: 14},  // Last Updated
  ];

  // Freeze header rows (row 5 = index 4 after 4 meta + 1 header)
  ws['!freeze'] = { xSplit: 0, ySplit: 5 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  XLSX.writeFile(wb, filename);
  showToast(`Excel report downloaded — ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`);
}

// ─── Command Palette (Ctrl+K) ─────────────────────────────────────────────────
let _paletteOpen = false;
let _paletteTimeout = null;

function openCommandPalette() {
  if (_paletteOpen) return;
  _paletteOpen = true;

  const overlay = document.createElement('div');
  overlay.id = 'cmd-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;backdrop-filter:blur(2px)';
  overlay.innerHTML = `
    <div id="cmd-box" style="width:100%;max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.25);border:1px solid rgba(226,232,240,0.8)">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #f1f5f9">
        <i class="fa-solid fa-magnifying-glass" style="color:#6366f1;font-size:16px"></i>
        <input id="cmd-input" type="text" placeholder="Search tasks, projects, team members…"
               style="flex:1;border:none;outline:none;font-size:15px;color:#1e293b;background:transparent"
               oninput="runSearch(this.value)" autocomplete="off" />
        <kbd style="background:#f1f5f9;color:#64748b;border-radius:6px;padding:2px 8px;font-size:11px;border:1px solid #e2e8f0">ESC</kbd>
      </div>
      <div id="cmd-results" style="max-height:420px;overflow-y:auto">
        <div style="padding:40px 20px;text-align:center;color:#94a3b8;font-size:14px">
          <i class="fa-solid fa-magnifying-glass" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.4"></i>
          Type to search across tasks, projects and team members
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCommandPalette(); });
  document.getElementById('cmd-input').focus();
}

function closeCommandPalette() {
  document.getElementById('cmd-overlay')?.remove();
  _paletteOpen = false;
  clearTimeout(_paletteTimeout);
}

async function runSearch(q) {
  clearTimeout(_paletteTimeout);
  const resultsEl = document.getElementById('cmd-results');
  if (!resultsEl) return;

  if (q.trim().length < 2) {
    resultsEl.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#94a3b8;font-size:14px">
      <i class="fa-solid fa-magnifying-glass" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.4"></i>
      Type at least 2 characters to search
    </div>`;
    return;
  }

  resultsEl.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">
    <i class="fa-solid fa-spinner fa-spin"></i> Searching…
  </div>`;

  _paletteTimeout = setTimeout(async () => {
    try {
      const isManager = state.user?.role === 'manager';
      const data = isManager ? await api.manager.search(q) : await api.employee.search(q);
      renderPaletteResults(data, isManager);
    } catch { resultsEl.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px">Search failed</div>`; }
  }, 280);
}

function renderPaletteResults(data, isManager) {
  const el = document.getElementById('cmd-results');
  if (!el) return;

  const section = (icon, color, title, items) => !items?.length ? '' : `
    <div style="padding:8px 16px 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em">
      <i class="fa-solid ${icon}" style="color:${color};margin-right:6px"></i>${title}
    </div>
    ${items.map(item => item._html).join('')}`;

  const taskItems = (data.tasks || []).map(t => ({_html:`
    <div onclick="closeCommandPalette();navigate('${isManager?'manager':'employee'}-task-detail',{id:${t.id}})"
         style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background 0.1s"
         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fa-solid fa-list-check" style="color:#6366f1;font-size:12px"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:1px">${t.workflow_name||''}${t.stage_name?' · '+t.stage_name:''}</div>
      </div>
      ${t.assignee_name?`<div style="font-size:11px;color:#64748b">${t.assignee_name}</div>`:''}
    </div>`}));

  const projectItems = (data.projects || []).map(p => ({_html:`
    <div onclick="closeCommandPalette();navigate('${isManager?'manager-workflows':'employee-calendar'}')"
         style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background 0.1s"
         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:8px;background:#f0fdf4;display:flex;align-items:center;justify-content:center">
        <i class="fa-solid fa-diagram-project" style="color:#10b981;font-size:12px"></i>
      </div>
      <div style="font-size:13px;font-weight:600;color:#1e293b">${p.name}</div>
    </div>`}));

  const userItems = (data.users || []).map(u => ({_html:`
    <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:default"
         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">
        ${(u.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;color:#1e293b">${u.name}</div>
        <div style="font-size:11px;color:#94a3b8">${u.email}</div>
      </div>
    </div>`}));

  const noResults = !taskItems.length && !projectItems.length && !userItems.length;
  el.innerHTML = noResults
    ? `<div style="padding:40px 20px;text-align:center;color:#94a3b8;font-size:14px">No results found</div>`
    : section('fa-list-check','#6366f1','Tasks', taskItems)
      + section('fa-diagram-project','#10b981','Projects', projectItems)
      + (isManager ? section('fa-users','#f59e0b','Team Members', userItems) : '');
}

// Global keyboard shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openCommandPalette(); }
  if (e.key === 'Escape' && _paletteOpen) closeCommandPalette();
});

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
          : emptyState('fa-bell-slash', 'All caught up!', 'No new notifications')}
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

// ── Focus Mode + Pomodoro Timer ───────────────────────────────────────────────
const FocusMode = (() => {
  let _task = null, _interval = null, _totalSecs = 25*60, _remaining = 25*60, _running = false, _sessions = 0;
  const R = 90, CX = 110, CY = 110, CIRC = 2 * Math.PI * R;

  function _pad(n) { return String(n).padStart(2,'0'); }
  function _fmt(s) { return `${_pad(Math.floor(s/60))}:${_pad(s%60)}`; }
  function _ringColor(ratio) { return ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444'; }

  function _updateUI() {
    const ratio  = _remaining / _totalSecs;
    const offset = CIRC * (1 - ratio);
    const ring    = document.getElementById('fm-ring');
    const timeEl  = document.getElementById('fm-time');
    const btn     = document.getElementById('fm-start');
    const sessEl  = document.getElementById('fm-sessions');
    if (ring)   { ring.setAttribute('stroke-dashoffset', offset); ring.setAttribute('stroke', _ringColor(ratio)); }
    if (timeEl)  timeEl.textContent = _fmt(_remaining);
    if (btn)     btn.innerHTML = _running
      ? '<i class="fa-solid fa-pause"></i> Pause'
      : `<i class="fa-solid fa-play"></i> ${_remaining < _totalSecs ? 'Resume' : 'Start'}`;
    if (sessEl) sessEl.textContent = `${_sessions} session${_sessions !== 1 ? 's' : ''} completed`;
  }

  async function _onComplete() {
    clearInterval(_interval); _interval = null; _running = false;
    _sessions++; _remaining = 0; _updateUI();

    // Auto-log time
    const mins = Math.round(_totalSecs / 60);
    const today = new Date().toISOString().split('T')[0];
    try {
      const isManager = state.user?.role === 'manager';
      if (_task?.id) {
        const logFn = isManager ? api.manager.addTimeLog : api.employee.addTimeLog;
        if (logFn) await logFn(_task.id, { minutes: mins, description: 'Pomodoro session', logged_date: today });
      }
      showToast(`🍅 Session done! ${mins} min logged.`, 'success');
    } catch (e) { showToast(`Session done! Could not log time: ${e.message}`, 'warning'); }

    // Soft beep
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.start(); osc.stop(ctx.currentTime + 1.2);
    } catch {}

    document.getElementById('fm-complete-banner')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('fm-complete-banner')?.classList.add('hidden'), 4000);
  }

  const pub = {
    _kbHandler: null,

    open(task) {
      if (document.getElementById('focus-mode-overlay')) return;
      _task = task; _sessions = 0; _remaining = _totalSecs; _running = false;
      const safeTitle = typeof escHtml === 'function' ? escHtml(task.title || '') : (task.title || '');

      const overlay = document.createElement('div');
      overlay.id = 'focus-mode-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#0f172a 0%,#1e1b4b 100%)';
      overlay.innerHTML = `
        <div style="text-align:center;max-width:420px;width:100%;padding:32px 24px;color:#fff">

          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
            <span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#a5b4fc">
              <i class="fa-solid fa-crosshairs"></i> Focus Mode
            </span>
            <button onclick="FocusMode.close()"
              style="background:rgba(255,255,255,0.1);border:none;color:#94a3b8;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600"
              onmouseover="this.style.background='rgba(255,255,255,0.18)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
              <i class="fa-solid fa-xmark"></i> Exit
            </button>
          </div>

          <div style="font-size:17px;font-weight:700;color:#f1f5f9;margin-bottom:28px;line-height:1.35;
                      overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">
            ${safeTitle}
          </div>

          <!-- Timer ring -->
          <div style="position:relative;display:inline-block;margin-bottom:24px">
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="12"/>
              <circle id="fm-ring" cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#22c55e" stroke-width="12"
                stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="0"
                transform="rotate(-90 ${CX} ${CY})" style="transition:stroke-dashoffset 0.9s ease,stroke 0.4s ease"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div id="fm-time" style="font-size:48px;font-weight:800;color:#f1f5f9;font-variant-numeric:tabular-nums;letter-spacing:-2px">25:00</div>
              <div id="fm-sessions" style="font-size:12px;color:#64748b;margin-top:4px">0 sessions completed</div>
            </div>
          </div>

          <div id="fm-complete-banner" class="hidden"
            style="margin-bottom:16px;padding:10px 16px;background:linear-gradient(135deg,#065f46,#047857);border-radius:12px;font-size:13px;font-weight:600;color:#d1fae5">
            🎉 Session complete! Time auto-logged.
          </div>

          <!-- Duration presets -->
          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:22px">
            ${[25,10,5].map(m => `
              <button id="fm-dur-${m}" onclick="FocusMode.setDuration(${m})"
                style="flex:1;padding:9px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;
                       border:2px solid ${_totalSecs===m*60?'#818cf8':'transparent'};
                       background:${_totalSecs===m*60?'#6366f1':'rgba(255,255,255,0.08)'};
                       color:${_totalSecs===m*60?'#fff':'#94a3b8'}">
                ${m} min
              </button>`).join('')}
          </div>

          <!-- Controls -->
          <div style="display:flex;gap:10px;justify-content:center;margin-bottom:20px">
            <button id="fm-start" onclick="FocusMode.toggle()"
              style="flex:1;max-width:160px;padding:13px 24px;background:linear-gradient(135deg,#6366f1,#3b82f6);
                     color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;
                     display:flex;align-items:center;justify-content:center;gap:8px;
                     box-shadow:0 4px 14px rgba(99,102,241,0.4)">
              <i class="fa-solid fa-play"></i> Start
            </button>
            <button onclick="FocusMode.reset()"
              style="padding:13px 20px;background:rgba(255,255,255,0.08);color:#94a3b8;border:none;
                     border-radius:12px;font-size:14px;font-weight:600;cursor:pointer"
              onmouseover="this.style.background='rgba(255,255,255,0.14)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
              <i class="fa-solid fa-rotate-left"></i> Reset
            </button>
          </div>

          <div style="font-size:12px;color:#475569">
            <kbd style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:2px 7px">Space</kbd>
            start/pause &nbsp;·&nbsp;
            <kbd style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:2px 7px">Esc</kbd>
            exit
          </div>
        </div>`;

      document.body.appendChild(overlay);
      _updateUI();

      pub._kbHandler = (e) => {
        if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
          e.preventDefault(); pub.toggle();
        }
        if (e.key === 'Escape') pub.close();
      };
      document.addEventListener('keydown', pub._kbHandler);
    },

    close() {
      clearInterval(_interval); _interval = null; _running = false;
      document.getElementById('focus-mode-overlay')?.remove();
      if (pub._kbHandler) { document.removeEventListener('keydown', pub._kbHandler); pub._kbHandler = null; }
    },

    setDuration(mins) {
      if (_running) return;
      _totalSecs = mins * 60; _remaining = _totalSecs;
      [25,10,5].forEach(m => {
        const btn = document.getElementById(`fm-dur-${m}`);
        if (!btn) return;
        const active = m === mins;
        btn.style.background = active ? '#6366f1' : 'rgba(255,255,255,0.08)';
        btn.style.color      = active ? '#fff'    : '#94a3b8';
        btn.style.border     = active ? '2px solid #818cf8' : '2px solid transparent';
      });
      _updateUI();
    },

    toggle() {
      if (_remaining <= 0) { pub.reset(); return; }
      _running = !_running;
      if (_running) {
        _interval = setInterval(() => { _remaining--; _updateUI(); if (_remaining <= 0) _onComplete(); }, 1000);
      } else {
        clearInterval(_interval); _interval = null;
      }
      _updateUI();
    },

    reset() {
      clearInterval(_interval); _interval = null; _running = false; _remaining = _totalSecs;
      _updateUI();
      document.getElementById('fm-complete-banner')?.classList.add('hidden');
    },
  };

  return pub;
})();

// ── Late Completion Prompt ────────────────────────────────────────────────────

function isLateCompletion(stageName, dueDate) {
  if (!dueDate) return false;
  const n = (stageName || '').toLowerCase();
  if (!n.includes('done') && !n.includes('complet') && !n.includes('closed')) return false;
  // Compare date-only (strip time) so same-day doesn't count as late
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function promptLateCompletionReason(dueDate, onConfirm) {
  const due = dueDate ? `Due date was <strong>${dueDate}</strong>.` : '';
  openModal(`
    <div class="p-6">
      <div class="flex items-start gap-4 mb-5">
        <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
             style="background:#fef3c7">⏰</div>
        <div>
          <h2 class="text-lg font-bold text-gray-900">Task Completed Late</h2>
          <p class="text-sm text-gray-500 mt-1">${due} Please provide a reason for the delay so your manager is kept informed.</p>
        </div>
      </div>
      <div class="mb-5">
        <label class="label">Reason for delay <span class="text-red-500">*</span></label>
        <textarea id="delay-reason-input" class="input text-sm" rows="3"
                  placeholder="e.g. Blocked waiting for client feedback, additional review rounds required…"
                  oninput="document.getElementById('delay-reason-error').classList.add('hidden')"></textarea>
        <p id="delay-reason-error" class="hidden mt-1.5 text-xs text-red-500 flex items-center gap-1">
          <i class="fa-solid fa-circle-exclamation"></i> Please provide a reason before submitting.
        </p>
      </div>
      <div class="flex justify-end gap-3">
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" onclick="_submitLateReason()">
          <i class="fa-solid fa-check"></i> Submit &amp; Mark Done
        </button>
      </div>
    </div>`);

  window._lateReasonCb = onConfirm;
  setTimeout(() => document.getElementById('delay-reason-input')?.focus(), 60);
}

function _submitLateReason() {
  const reason = document.getElementById('delay-reason-input')?.value?.trim();
  if (!reason) {
    document.getElementById('delay-reason-error')?.classList.remove('hidden');
    return;
  }
  const cb = window._lateReasonCb;
  window._lateReasonCb = null;
  closeModal();
  if (cb) cb(reason);
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
