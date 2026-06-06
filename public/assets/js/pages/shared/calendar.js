let _calTasks     = [];
let _calYear      = new Date().getFullYear();
let _calMonth     = new Date().getMonth(); // 0-based
let _calRole      = 'employee';

async function renderCalendar(role) {
  _calRole = role || state.user?.role || 'employee';
  document.getElementById('app').innerHTML = renderLayout(_calRole, `
    <div class="p-6">
      ${pageHeader('Calendar', 'Tasks by due date')}
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <button onclick="calPrevMonth()" class="btn-secondary text-sm">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <h2 id="cal-title" class="text-base font-semibold text-gray-800"></h2>
          <button onclick="calNextMonth()" class="btn-secondary text-sm">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
        <div id="cal-grid" class="p-4">
          <div class="animate-pulse grid grid-cols-7 gap-2">
            ${Array(35).fill('<div class="h-20 bg-gray-100 rounded"></div>').join('')}
          </div>
        </div>
      </div>
    </div>`);

  try {
    const isManager = _calRole === 'manager';
    const calResp = isManager ? await api.manager.listTasks() : await api.employee.listTasks();
    _calTasks = Array.isArray(calResp) ? calResp : (calResp.data || []);
    renderCalGrid();
  } catch(err) { showToast(err.message, 'error'); }
}

function renderCalGrid() {
  const title = document.getElementById('cal-title');
  const grid  = document.getElementById('cal-grid');
  if (!title || !grid) return;

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  title.textContent = `${monthNames[_calMonth]} ${_calYear}`;

  const firstDay   = new Date(_calYear, _calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const today      = new Date().toISOString().split('T')[0];

  // Build task lookup by date
  const byDate = {};
  _calTasks.forEach(t => {
    if (!t.due_date) return;
    const d = t.due_date.split('T')[0];
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let html = `<div class="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">`;

  // Header row
  dayLabels.forEach(d => {
    html += `<div class="bg-gray-50 px-2 py-1.5 text-center text-xs font-semibold text-gray-500 uppercase">${d}</div>`;
  });

  // Leading blanks
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="bg-white min-h-[90px]"></div>`;
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday  = dateStr === today;
    const dayTasks = byDate[dateStr] || [];
    const hasOver  = dayTasks.some(t => !['Done','Closed'].includes(t.stage_name));

    html += `
      <div class="bg-white min-h-[90px] p-1.5 relative ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center
                       ${isToday ? 'bg-blue-600 text-white' : 'text-gray-600'}">
            ${day}
          </span>
          ${hasOver ? '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>' : ''}
        </div>
        ${dayTasks.slice(0, 3).map(t => {
          const done      = ['Done','Closed'].includes(t.stage_name);
          const over      = !done && t.due_date < today;
          const isManager = _calRole === 'manager';
          const colorCls  = done ? 'bg-green-100 text-green-700' : over ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700';
          const assignee  = t.assignee_name || 'Unassigned';
          return `
            <div class="cal-task relative mb-0.5 cursor-pointer"
                 onclick="navigate('${isManager ? 'manager' : 'employee'}-task-detail',{id:${t.id}})">
              <div class="text-[10px] px-1.5 py-0.5 rounded truncate font-medium ${colorCls}">
                ${t.title}
              </div>
              <div class="cal-task-tip">
                <div class="font-semibold text-xs leading-snug mb-1.5">${t.title}</div>
                <div class="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <i class="fa-solid fa-user text-[9px]"></i> ${assignee}
                </div>
                ${t.stage_name ? `<div class="flex items-center gap-1.5 text-[11px] text-slate-300 mt-0.5">
                  <i class="fa-solid fa-circle-dot text-[9px]"></i> ${t.stage_name}
                </div>` : ''}
                ${over ? '<div class="mt-1.5 text-[10px] text-red-400 font-semibold">⚠ Overdue</div>' : ''}
                ${done ? '<div class="mt-1.5 text-[10px] text-green-400 font-semibold">✓ Completed</div>' : ''}
              </div>
            </div>`;
        }).join('')}
        ${dayTasks.length > 3 ? `<div class="text-[10px] text-gray-400 pl-1">+${dayTasks.length - 3} more</div>` : ''}
      </div>`;
  }

  // Trailing blanks to complete last row
  const totalCells = firstDay + daysInMonth;
  const trailing   = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < trailing; i++) {
    html += `<div class="bg-white min-h-[90px]"></div>`;
  }

  html += `</div>`;
  grid.innerHTML = html;
}

function calPrevMonth() {
  _calMonth--;
  if (_calMonth < 0) { _calMonth = 11; _calYear--; }
  renderCalGrid();
}

function calNextMonth() {
  _calMonth++;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  renderCalGrid();
}
