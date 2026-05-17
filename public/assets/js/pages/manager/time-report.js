async function renderTimeReport() {
  document.getElementById('app').innerHTML = renderLayout('manager', `
    <div class="p-6">
      ${pageHeader('Time Report', 'Total time logged by team and project', `
        <button class="btn-secondary text-xs" onclick="exportTimePDF()">
          <i class="fa-solid fa-file-pdf text-red-500"></i> Export PDF
        </button>`)}
      <div id="time-report-content">
        <div class="animate-pulse space-y-4">
          <div class="h-32 bg-gray-100 rounded-2xl"></div>
          <div class="h-64 bg-gray-100 rounded-2xl"></div>
        </div>
      </div>
    </div>`);

  try {
    const data = await api.manager.timeReport();
    renderTimeReportContent(data);
  } catch(err) { showToast(err.message, 'error'); }
}

function renderTimeReportContent(data) {
  const fmtMins = (m) => { m=parseInt(m)||0; const h=Math.floor(m/60),min=m%60; return h>0?`${h}h ${min}m`:`${min}m`; };

  const totalMins = (data.by_user || []).reduce((s, u) => s + (parseInt(u.total_minutes)||0), 0);

  const el = document.getElementById('time-report-content');
  el.innerHTML = `
    <!-- Summary stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      ${statCard('fa-clock', fmtMins(totalMins), 'Total Time Logged', 'purple')}
      ${statCard('fa-users', data.by_user?.length || 0, 'Team Members', 'blue')}
      ${statCard('fa-diagram-project', data.by_project?.length || 0, 'Projects', 'green')}
    </div>

    <div class="grid lg:grid-cols-2 gap-5">
      <!-- By Team Member -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-users text-blue-500"></i> By Team Member
          </h3>
        </div>
        <div class="divide-y divide-gray-50">
          ${(data.by_user || []).length
            ? (data.by_user || []).map(u => {
                const pct = totalMins > 0 ? Math.round((u.total_minutes / totalMins) * 100) : 0;
                return `
                  <div class="px-5 py-3.5">
                    <div class="flex items-center gap-3 mb-2">
                      <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                           style="background:linear-gradient(135deg,#6366f1,#3b82f6)">${avatarInitials(u.name)}</div>
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-semibold text-gray-800">${u.name}</div>
                        <div class="text-xs text-gray-400">${u.tasks_logged} task${u.tasks_logged!=1?'s':''} logged</div>
                      </div>
                      <div class="text-sm font-bold text-indigo-600">${fmtMins(u.total_minutes)}</div>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-1.5">
                      <div class="bg-gradient-to-r from-indigo-500 to-blue-500 h-1.5 rounded-full" style="width:${pct}%"></div>
                    </div>
                  </div>`;
              }).join('')
            : '<div class="px-5 py-8 text-center text-sm text-gray-400">No time logged yet</div>'}
        </div>
      </div>

      <!-- By Project -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-diagram-project text-green-500"></i> By Project
          </h3>
        </div>
        <div class="divide-y divide-gray-50">
          ${(data.by_project || []).length
            ? (data.by_project || []).map(p => `
                <div class="flex items-center gap-3 px-5 py-3.5">
                  <div class="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-diagram-project text-green-500 text-xs"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-gray-800 truncate">${p.name}</div>
                    <div class="text-xs text-gray-400">${p.log_count} log${p.log_count!=1?'s':''}</div>
                  </div>
                  <div class="text-sm font-bold text-green-600">${fmtMins(p.total_minutes)}</div>
                </div>`).join('')
            : '<div class="px-5 py-8 text-center text-sm text-gray-400">No time logged yet</div>'}
        </div>
      </div>
    </div>`;
}

function exportTimePDF() {
  const el = document.getElementById('time-report-content');
  if (!el) return;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Time Report</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e293b}
    h1{font-size:22px;margin:0 0 4px;font-weight:700}
    .meta{font-size:13px;color:#64748b;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#6366f1;color:white;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
    td{padding:10px 12px;border-bottom:1px solid #f1f5f9}
    tr:nth-child(even) td{background:#f8fafc}
    </style></head><body>
    <h1>Time Report</h1>
    <div class="meta">Generated ${new Date().toLocaleDateString()}</div>
    ${el.innerHTML.replace(/<script[^>]*>.*?<\/script>/gs,'')}
    <script>window.onload=()=>window.print();<\/script>
    </body></html>`);
  win.document.close();
}
