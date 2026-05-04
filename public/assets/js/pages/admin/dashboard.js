// ─── Chart registry ───────────────────────────────────────────────────────────
const _ac = {};
function _aChart(id, cfg) {
  if (_ac[id]) { try { _ac[id].destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el) return;
  _ac[id] = new Chart(el, cfg);
}
function _killAdminCharts() {
  Object.keys(_ac).forEach(k => { try { _ac[k].destroy(); } catch {} delete _ac[k]; });
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function _aKpi(icon, value, label, color, bg, sub = '') {
  return `
    <div class="bg-white rounded-xl shadow-sm p-5 flex items-start gap-4"
         style="border-left:4px solid ${color}">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
           style="background:${bg};color:${color}">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="min-w-0">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">${label}</p>
        <p class="text-3xl font-extrabold leading-none mt-1" style="color:${color}">${value}</p>
        ${sub ? `<p class="text-xs text-gray-400 mt-1">${sub}</p>` : ''}
      </div>
    </div>`;
}

// ─── Chart: subscription request status (doughnut) ───────────────────────────
function _aDrawRequests(pending, approved, rejected) {
  const total = pending + approved + rejected;
  _aChart('ac-requests', {
    type: 'doughnut',
    data: {
      labels: ['Pending', 'Approved', 'Rejected'],
      datasets: [{
        data: [pending, approved, rejected],
        backgroundColor: ['#f59e0b', '#10b981', '#ef4444'],
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 14, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} (${total ? Math.round(ctx.raw / total * 100) : 0}%)`,
          },
        },
      },
    },
    plugins: [{
      id: 'reqCenter',
      beforeDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right)  / 2;
        const cy = (chartArea.top  + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 26px system-ui,sans-serif'; ctx.fillStyle = '#111827';
        ctx.fillText(total, cx, cy - 9);
        ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = '#6b7280';
        ctx.fillText('total', cx, cy + 13);
        ctx.restore();
      },
    }],
  });
}

// ─── Chart: companies per package (bar) ──────────────────────────────────────
function _aDrawPackages(byPackage) {
  if (!byPackage.length) return;
  const PALETTE = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  _aChart('ac-packages', {
    type: 'bar',
    data: {
      labels: byPackage.map(p => p.package_name),
      datasets: [{
        label: 'Active Companies',
        data: byPackage.map(p => +p.company_count || 0),
        backgroundColor: byPackage.map((_, i) => PALETTE[i % PALETTE.length]),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} compan${ctx.raw !== 1 ? 'ies' : 'y'}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { precision: 0, font: { size: 11 } } },
      },
    },
  });
}

// ─── Page renderer ────────────────────────────────────────────────────────────
async function renderAdminDashboard() {
  _killAdminCharts();

  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6 space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-extrabold text-gray-900">Platform Overview</h1>
          <p class="text-sm text-gray-400 mt-0.5">Company registrations &amp; subscription management</p>
        </div>
        <div class="flex items-center gap-3">
          <span id="a-ts" class="text-xs text-gray-400 hidden sm:block"></span>
          <button onclick="renderAdminDashboard()" class="btn-secondary text-xs">
            <i class="fa-solid fa-rotate-right"></i> Refresh
          </button>
        </div>
      </div>

      <!-- KPI cards -->
      <div id="a-kpis" class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        ${[1,2,3,4,5].map(() => `
          <div class="bg-white rounded-xl shadow-sm p-5 animate-pulse border-l-4 border-gray-200">
            <div class="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
            <div class="h-7 bg-gray-200 rounded w-1/2"></div>
          </div>`).join('')}
      </div>

      <!-- Charts row -->
      <div class="grid lg:grid-cols-2 gap-6">

        <!-- Subscription requests doughnut -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-start justify-between mb-1">
            <div>
              <h2 class="font-bold text-gray-800">Subscription Requests</h2>
              <p class="text-xs text-gray-400 mt-0.5">Status breakdown of all requests</p>
            </div>
            <button onclick="navigate('admin-subscription-requests')"
                    class="text-xs text-blue-600 hover:underline whitespace-nowrap">
              Manage →
            </button>
          </div>
          <div style="position:relative;height:260px;" class="mt-4">
            <canvas id="ac-requests"></canvas>
          </div>
        </div>

        <!-- Companies per package bar -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-start justify-between mb-1">
            <div>
              <h2 class="font-bold text-gray-800">Companies per Package</h2>
              <p class="text-xs text-gray-400 mt-0.5">Active companies by subscription plan</p>
            </div>
            <button onclick="navigate('admin-packages')"
                    class="text-xs text-blue-600 hover:underline whitespace-nowrap">
              Manage →
            </button>
          </div>
          <div style="position:relative;height:260px;" class="mt-4">
            <canvas id="ac-packages"></canvas>
          </div>
        </div>
      </div>

      <!-- Companies table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-bold text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-building text-blue-500"></i> Registered Companies
          </h2>
          <button onclick="navigate('admin-companies')" class="text-xs text-blue-600 hover:underline">
            View all →
          </button>
        </div>
        <div id="a-companies-table">
          <div class="animate-pulse space-y-3">
            ${[1,2,3,4].map(() => '<div class="h-8 bg-gray-100 rounded"></div>').join('')}
          </div>
        </div>
      </div>

      <!-- Pending subscription requests table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-bold text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-file-signature text-amber-500"></i> Pending Requests
          </h2>
          <button onclick="navigate('admin-subscription-requests')" class="text-xs text-blue-600 hover:underline">
            View all →
          </button>
        </div>
        <div id="a-pending-table">
          <div class="animate-pulse space-y-3">
            ${[1,2].map(() => '<div class="h-8 bg-gray-100 rounded"></div>').join('')}
          </div>
        </div>
      </div>

    </div>`);

  try {
    const [stats, companies, requests] = await Promise.all([
      api.admin.stats(),
      api.admin.listCompanies(),
      api.admin.listSubscriptionRequests(),
    ]);

    const ts = document.getElementById('a-ts');
    if (ts) { ts.textContent = `Updated ${new Date().toLocaleTimeString()}`; ts.classList.remove('hidden'); }

    // KPI cards
    const activeRatio = +stats.companies > 0
      ? `${Math.round(+stats.activeCompanies / +stats.companies * 100)}% active`
      : '';

    document.getElementById('a-kpis').innerHTML = [
      _aKpi('fa-building',       stats.companies,       'Total Companies',   '#3b82f6', '#eff6ff', activeRatio),
      _aKpi('fa-user-tie',       stats.managers,        'Active Managers',   '#10b981', '#f0fdf4'),
      _aKpi('fa-box',            stats.packages,        'Active Packages',   '#8b5cf6', '#f5f3ff'),
      _aKpi('fa-file-signature', stats.pendingReq,      'Pending Requests',  '#f59e0b', '#fffbeb', 'Awaiting review'),
      _aKpi('fa-ticket',         stats.tokens,          'Available Tokens',  '#06b6d4', '#ecfeff'),
    ].join('');

    // Charts
    requestAnimationFrame(() => {
      _aDrawRequests(+stats.pendingReq || 0, +stats.approvedReq || 0, +stats.rejectedReq || 0);
      _aDrawPackages(stats.byPackage || []);
    });

    // Companies table
    document.getElementById('a-companies-table').innerHTML = companies.length
      ? tableWrapper(
          ['Company', 'Package', 'Manager', 'Joined', 'Status'],
          companies.slice(0, 8).map(c => `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('admin-companies')">
              <td class="px-4 py-3 font-medium text-sm text-gray-900">${c.name}</td>
              <td class="px-4 py-3 text-sm text-gray-500">${c.package_name || '—'}</td>
              <td class="px-4 py-3 text-sm text-gray-500">${c.manager_name || '—'}</td>
              <td class="px-4 py-3 text-sm text-gray-400">${formatDate(c.created_at)}</td>
              <td class="px-4 py-3">${statusDot(c.is_active)}</td>
            </tr>`)
        )
      : emptyState('fa-building', 'No companies yet', 'Approve a subscription request to get started');

    // Pending requests table
    const pending = requests.filter(r => r.status === 'pending');
    document.getElementById('a-pending-table').innerHTML = pending.length
      ? tableWrapper(
          ['Company', 'Contact', 'Package', 'Requested'],
          pending.slice(0, 5).map(r => `
            <tr class="hover:bg-amber-50 cursor-pointer" onclick="navigate('admin-subscription-requests')">
              <td class="px-4 py-3 font-medium text-sm text-gray-900">${r.company_name}</td>
              <td class="px-4 py-3 text-sm text-gray-500">${r.manager_email}</td>
              <td class="px-4 py-3 text-sm text-gray-500">${r.package_name}</td>
              <td class="px-4 py-3 text-sm text-gray-400">${formatDate(r.created_at)}</td>
            </tr>`)
        )
      : `<p class="text-sm text-gray-400 py-4 text-center">
           <i class="fa-solid fa-circle-check text-green-400 mr-1"></i>
           No pending requests — all caught up!
         </p>`;

  } catch (err) {
    showToast('Dashboard error: ' + err.message, 'error');
  }
}
