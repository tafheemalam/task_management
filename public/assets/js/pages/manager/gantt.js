async function renderManagerGantt() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Gantt Chart', 'Task timeline by project', `
        <div class="flex items-center gap-2">
          <select id="gantt-wf-filter" class="input w-auto text-sm" onchange="loadGantt()">
            <option value="">All Projects</option>
          </select>
          <select id="gantt-view-mode" class="input w-auto text-sm" onchange="setGanttView(this.value)">
            <option value="Week">Week</option>
            <option value="Month" selected>Month</option>
            <option value="Quarter Day">Quarter Day</option>
            <option value="Half Day">Half Day</option>
            <option value="Day">Day</option>
          </select>
        </div>`)}
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div id="gantt-container" class="gantt-container min-h-64">
          <div class="animate-pulse h-64 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
            Loading Gantt chart…
          </div>
        </div>
      </div>
      <div class="mt-3 text-xs text-gray-400">
        <i class="fa-solid fa-circle-info mr-1"></i>
        Only tasks with both start date and due date are shown. Click a bar to view the task.
      </div>
    </div>`);

  await loadGantt();
}

let _ganttInstance = null;
let _ganttTasks    = [];
let _ganttWorkflows = [];

async function loadGantt() {
  try {
    const [tasks, workflows] = await Promise.all([
      api.manager.listTasks(),
      api.manager.listWorkflows(),
    ]);
    _ganttTasks    = tasks;
    _ganttWorkflows = workflows;

    // Populate project filter
    const sel = document.getElementById('gantt-wf-filter');
    if (sel && !sel.querySelector('option[value="__loaded"]')) {
      workflows.forEach(w => {
        const o = document.createElement('option'); o.value = w.id; o.textContent = w.name; sel.appendChild(o);
      });
      const marker = document.createElement('option'); marker.value = '__loaded'; marker.style.display = 'none'; sel.appendChild(marker);
    }

    renderGantt();
  } catch(err) { showToast(err.message, 'error'); }
}

function renderGantt() {
  const wfFilter = document.getElementById('gantt-wf-filter')?.value || '';
  const viewMode = document.getElementById('gantt-view-mode')?.value || 'Month';

  let tasks = _ganttTasks.filter(t => t.start_date && t.due_date);
  if (wfFilter && wfFilter !== '__loaded') tasks = tasks.filter(t => t.workflow_id == wfFilter);

  const container = document.getElementById('gantt-container');
  if (!container) return;

  if (!tasks.length) {
    container.innerHTML = `<div class="flex items-center justify-center h-48 text-gray-400 text-sm">
      <div class="text-center">
        <i class="fa-solid fa-calendar-xmark text-3xl text-gray-200 block mb-3"></i>
        No tasks with start and due dates found${wfFilter ? ' for this project' : ''}.
      </div>
    </div>`;
    return;
  }

  const ganttTasks = tasks.map(t => ({
    id: String(t.id),
    name: t.title,
    start: t.start_date,
    end: t.due_date,
    progress: ['Done','Closed'].includes(t.stage_name) ? 100 : 0,
    custom_class: t.priority === 'high' ? 'bar-high' : t.priority === 'low' ? 'bar-low' : '',
  }));

  container.innerHTML = '<svg id="gantt-svg"></svg>';

  try {
    _ganttInstance = new Gantt('#gantt-svg', ganttTasks, {
      view_mode: viewMode,
      date_format: 'YYYY-MM-DD',
      bar_height: 28,
      padding: 14,
      on_click: (task) => {
        navigate('manager-task-detail', { id: parseInt(task.id) });
      },
      on_date_change: async (task, start, end) => {
        const s = start.toISOString().split('T')[0];
        const e = end.toISOString().split('T')[0];
        const original = _ganttTasks.find(t => t.id == task.id);
        if (!original) return;
        try {
          await api.manager.updateTask(task.id, { ...original, start_date: s, due_date: e });
          showToast('Dates updated');
          const idx = _ganttTasks.findIndex(t => t.id == task.id);
          if (idx >= 0) { _ganttTasks[idx].start_date = s; _ganttTasks[idx].due_date = e; }
        } catch(err) { showToast(err.message, 'error'); }
      },
    });
  } catch(e) {
    container.innerHTML = `<div class="text-center py-8 text-red-500 text-sm">${e.message}</div>`;
  }
}

function setGanttView(mode) {
  if (_ganttInstance) {
    _ganttInstance.change_view_mode(mode);
  }
}
