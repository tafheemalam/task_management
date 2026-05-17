let _workloadData = null;
let _workloadFilter = false;
let _expandedUsers = {};

async function renderWorkload() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6 animate-fade-in-up">
      ${pageHeader('Workload & Capacity Planning', 'View team task distribution and capacity')}
      <div id="workload-content">${skeletonStatCards(3) + skeletonCards(4)}</div>
    </div>`);

  await refreshWorkload();
}

async function refreshWorkload() {
  try {
    _workloadData = await api.manager.getWorkload();
    renderWorkloadContent();
  } catch (err) {
    document.getElementById('workload-content').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

function renderWorkloadContent() {
  if (!_workloadData) return;
  const d = _workloadData;
  const maxTasks = Math.max(...d.users.map(u => u.total_tasks), 1);

  document.getElementById('workload-content').innerHTML = `
    <!-- Stats Row -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      ${wlStatCard('fa-users', d.team_members, 'Team Members', 'blue')}
      ${wlStatCard('fa-list-check', d.total_tasks, 'Open Tasks', 'indigo')}
      ${wlStatCard('fa-circle-exclamation', d.total_overdue, 'Overdue Tasks', 'red')}
    </div>

    <!-- Filter -->
    <div class="flex items-center gap-3 mb-4">
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" id="wl-overcap-filter" class="rounded text-indigo-600"
               onchange="toggleOvercapFilter()" ${_workloadFilter ? 'checked' : ''} />
        <span class="text-sm font-medium text-gray-700">Show only over-capacity users (&gt;8 tasks)</span>
      </label>
      <button class="btn-secondary text-xs ml-auto" onclick="refreshWorkload()">
        <i class="fa-solid fa-arrows-rotate"></i> Refresh
      </button>
    </div>

    <!-- User Cards -->
    <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4" id="workload-users-grid">
      ${renderUserCards(d.users, maxTasks)}
    </div>`;
}

function wlStatCard(icon, value, label, color) {
  const colors = {
    blue:   'bg-blue-100 text-blue-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    red:    'bg-red-100 text-red-600',
  };
  return `
    <div class="card flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center ${colors[color] || colors.blue} shrink-0">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div>
        <p class="text-2xl font-bold text-gray-900">${value}</p>
        <p class="text-sm text-gray-500">${label}</p>
      </div>
    </div>`;
}

function renderUserCards(users, maxTasks) {
  const filtered = _workloadFilter ? users.filter(u => u.total_tasks > 8) : users;

  if (!filtered.length) {
    return `<div class="md:col-span-2 xl:col-span-3">${emptyState('fa-users', _workloadFilter ? 'No over-capacity users' : 'No workload data', _workloadFilter ? 'All team members are within capacity.' : 'Assign tasks to team members to see workload here')}</div>`;
  }

  return filtered.map(u => {
    const isOvercap = u.total_tasks > 8;
    const expanded  = !!_expandedUsers[u.user_id];
    const barWidth  = maxTasks > 0 ? Math.round((u.total_tasks / maxTasks) * 100) : 0;

    const overdueW  = maxTasks > 0 ? Math.round((u.overdue / maxTasks) * 100) : 0;
    const weekW     = maxTasks > 0 ? Math.round((u.due_this_week / maxTasks) * 100) : 0;
    const otherW    = Math.max(0, barWidth - overdueW - weekW);

    return `
      <div class="card border ${isOvercap ? 'border-orange-200 bg-orange-50/30' : 'border-gray-100'}">
        <!-- User header -->
        <div class="flex items-start gap-3 mb-4">
          <div class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
               style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
            ${avatarInitials(u.name)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-gray-900 text-sm">${wlEscHtml(u.name)}</span>
              ${isOvercap ? '<span class="inline-flex px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">Over capacity</span>' : ''}
            </div>
            <span class="text-xs text-gray-400 capitalize">${u.role}</span>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xl font-bold ${isOvercap ? 'text-orange-600' : 'text-gray-900'}">${u.total_tasks}</div>
            <div class="text-xs text-gray-400">tasks</div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="mb-3">
          <div class="h-2.5 rounded-full bg-gray-100 overflow-hidden flex">
            <div class="h-full bg-red-500 rounded-full transition-all" style="width:${overdueW}%"></div>
            <div class="h-full bg-orange-400 transition-all" style="width:${weekW}%"></div>
            <div class="h-full bg-blue-400 transition-all" style="width:${otherW}%"></div>
          </div>
          <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
            ${u.overdue > 0 ? `<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span>${u.overdue} overdue</span>` : ''}
            ${u.due_this_week > 0 ? `<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>${u.due_this_week} due this week</span>` : ''}
          </div>
        </div>

        <!-- Expand button -->
        <button onclick="toggleUserExpand(${u.user_id})"
                class="w-full text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-1 py-1.5 border-t border-gray-100 mt-2 pt-3 transition-colors">
          <i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[10px]"></i>
          ${expanded ? 'Hide tasks' : `Show ${u.tasks.length} tasks`}
        </button>

        <!-- Expanded task list -->
        ${expanded && u.tasks.length > 0 ? `
          <div class="mt-3 space-y-2 border-t border-gray-100 pt-3">
            ${u.tasks.map(t => `
              <div class="flex items-start gap-2 group py-1.5 border-b border-gray-50 last:border-0">
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium text-gray-800 leading-snug">${wlEscHtml(t.title)}</div>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    ${t.due_date ? `<span class="text-[10px] ${t.due_date < new Date().toISOString().split('T')[0] ? 'text-red-500 font-semibold' : 'text-gray-400'}">Due ${formatDate(t.due_date)}</span>` : ''}
                    ${priorityBadge(t.priority).replace('class="', 'style="font-size:10px" class="')}
                  </div>
                </div>
                <button onclick="navigate('manager-task-detail', {id: ${t.id}})"
                        class="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-indigo-600 hover:text-indigo-800 shrink-0 whitespace-nowrap">
                  View <i class="fa-solid fa-arrow-right text-[9px]"></i>
                </button>
              </div>`).join('')}
          </div>` : ''}
        ${expanded && u.tasks.length === 0 ? '<div class="text-xs text-gray-400 text-center mt-2">No tasks</div>' : ''}
      </div>`;
  }).join('');
}

function toggleUserExpand(userId) {
  _expandedUsers[userId] = !_expandedUsers[userId];
  if (_workloadData) {
    const maxTasks = Math.max(..._workloadData.users.map(u => u.total_tasks), 1);
    document.getElementById('workload-users-grid').innerHTML = renderUserCards(_workloadData.users, maxTasks);
  }
}

function toggleOvercapFilter() {
  _workloadFilter = document.getElementById('wl-overcap-filter')?.checked || false;
  if (_workloadData) {
    const maxTasks = Math.max(..._workloadData.users.map(u => u.total_tasks), 1);
    document.getElementById('workload-users-grid').innerHTML = renderUserCards(_workloadData.users, maxTasks);
  }
}

function wlEscHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
