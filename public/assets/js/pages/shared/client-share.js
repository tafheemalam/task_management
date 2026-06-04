async function renderClientShare({ token } = {}) {
  if (!token) {
    document.getElementById('app').innerHTML = `
      <div class="min-h-screen flex items-center justify-center" style="background:linear-gradient(145deg,#eef2ff 0%,#f8fafc 55%,#f0fdf4 100%)">
        <div class="text-center p-8">
          <div class="text-5xl mb-4">🔗</div>
          <h1 class="text-xl font-bold text-gray-800 mb-2">Invalid share link</h1>
          <p class="text-gray-500 text-sm">This link is missing a valid token.</p>
        </div>
      </div>`;
    return;
  }

  document.getElementById('app').innerHTML = `
    <div class="min-h-screen" style="background:linear-gradient(145deg,#eef2ff 0%,#f8fafc 55%,#f0fdf4 100%)">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <div id="cs-loading" class="text-center py-20">
          <div class="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mb-4"
               style="animation:spin 0.8s linear infinite"></div>
          <p class="text-gray-400 text-sm">Loading project…</p>
        </div>
        <div id="cs-content" class="hidden"></div>
        <div id="cs-error" class="hidden text-center py-20">
          <div class="text-5xl mb-4">⚠️</div>
          <h1 class="text-xl font-bold text-gray-800 mb-2">Link unavailable</h1>
          <p id="cs-error-msg" class="text-gray-500 text-sm"></p>
        </div>
      </div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

  try {
    const { workflow, stages, tasks } = await api.share.get(token);

    const byStage = {};
    stages.forEach(s => { byStage[s.id] = []; });
    tasks.forEach(t => {
      if (byStage[t.stage_id] !== undefined) byStage[t.stage_id].push(t);
    });

    const priorityIcon = (p) =>
      p === 'high' ? '<span class="text-red-500">●</span>' :
      p === 'medium' ? '<span class="text-yellow-500">●</span>' :
      '<span class="text-green-500">●</span>';

    const taskCard = (t) => {
      const overdue = t.due_date && new Date(t.due_date) < new Date();
      const title = typeof escHtml === 'function' ? escHtml(t.title) : t.title;
      const assignee = t.assignee_name ? (typeof escHtml === 'function' ? escHtml(t.assignee_name) : t.assignee_name) : null;
      return `
        <div class="bg-white rounded-xl p-3 mb-2 border border-gray-100 shadow-sm">
          <p class="text-sm font-medium text-gray-800 leading-snug mb-2">${title}</p>
          <div class="flex items-center gap-2 flex-wrap text-xs">
            <span class="flex items-center gap-1">${priorityIcon(t.priority)}<span class="text-gray-500 capitalize">${t.priority}</span></span>
            ${assignee ? `<span class="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full"><i class="fa-solid fa-user fa-xs mr-0.5"></i>${assignee}</span>` : ''}
            ${t.due_date ? `<span class="${overdue ? 'text-red-600 font-semibold' : 'text-gray-400'}"><i class="fa-regular fa-calendar fa-xs mr-0.5"></i>${t.due_date}</span>` : ''}
          </div>
        </div>`;
    };

    const stageCol = (stage) => {
      const items = byStage[stage.id] || [];
      const color = stage.color || '#6366f1';
      const name = typeof escHtml === 'function' ? escHtml(stage.name) : stage.name;
      return `
        <div style="min-width:220px;flex:1">
          <div class="flex items-center gap-2 mb-3 px-1">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
            <span class="text-sm font-semibold text-gray-700">${name}</span>
            <span class="ml-auto text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">${items.length}</span>
          </div>
          <div class="min-h-24 p-2 rounded-xl" style="background:rgba(0,0,0,0.02);border:1px dashed #e2e8f0">
            ${items.length ? items.map(taskCard).join('') : '<p class="text-xs text-gray-300 text-center py-6">No tasks</p>'}
          </div>
        </div>`;
    };

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => {
      const n = (t.stage_name || '').toLowerCase();
      return n.includes('done') || n.includes('complet') || n.includes('closed');
    }).length;
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const wfName = typeof escHtml === 'function' ? escHtml(workflow.name) : workflow.name;
    const wfDesc = workflow.description ? (typeof escHtml === 'function' ? escHtml(workflow.description) : workflow.description) : null;
    const wfLabel = workflow.label ? (typeof escHtml === 'function' ? escHtml(workflow.label) : workflow.label) : null;

    document.getElementById('cs-loading').classList.add('hidden');
    document.getElementById('cs-content').classList.remove('hidden');
    document.getElementById('cs-content').innerHTML = `
      <!-- Header -->
      <div class="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-gray-100">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span class="text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style="background:#eef2ff;color:#6366f1">Client View</span>
              ${wfLabel ? `<span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">${wfLabel}</span>` : ''}
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mb-1">${wfName}</h1>
            ${wfDesc ? `<p class="text-sm text-gray-500">${wfDesc}</p>` : ''}
          </div>
          <div class="text-right shrink-0">
            <p class="text-4xl font-black" style="color:#6366f1">${progress}%</p>
            <p class="text-xs text-gray-400">${doneTasks} / ${totalTasks} done</p>
          </div>
        </div>
        <div class="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-700"
               style="width:${progress}%;background:linear-gradient(90deg,#6366f1,#3b82f6)"></div>
        </div>
      </div>

      <!-- Kanban board -->
      <div class="flex gap-4 overflow-x-auto pb-4 items-start">
        ${stages.map(stageCol).join('')}
      </div>

      <p class="text-center text-xs text-gray-300 mt-8 pb-4">
        Read-only view · Powered by TaskFlow
      </p>`;

  } catch (err) {
    document.getElementById('cs-loading').classList.add('hidden');
    document.getElementById('cs-error').classList.remove('hidden');
    document.getElementById('cs-error-msg').textContent = err.message;
  }
}
