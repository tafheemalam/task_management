let _subRequests = [];
let _activeFilter = 'all';

async function renderAdminSubscriptionRequests() {
  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6 max-w-7xl">
      ${pageHeader('Subscription Requests', 'Review incoming company subscription requests')}

      <!-- Stats strip -->
      <div id="sub-stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"></div>

      <!-- Filter tabs -->
      <div class="flex items-center gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        ${['all', 'pending', 'approved', 'rejected'].map(s => `
          <button id="filter-${s}" onclick="filterSubRequests('${s}')"
            class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${s === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
            ${s.charAt(0).toUpperCase() + s.slice(1)}
          </button>`).join('')}
      </div>

      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div id="sub-requests-table">
          <div class="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <i class="fa-solid fa-spinner fa-spin"></i> Loading requests…
          </div>
        </div>
      </div>
    </div>`);
  document.getElementById('modal-root').className = 'hidden';
  await loadSubRequests();
}

async function loadSubRequests() {
  try {
    _subRequests = await api.admin.listSubscriptionRequests();
    renderSubStats(_subRequests);
    renderSubRequestsTable(_subRequests, _activeFilter);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderSubStats(list) {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  list.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  const total = list.length;

  const items = [
    { label: 'Total',    value: total,            icon: 'fa-file-lines',    bg: 'bg-blue-50',   text: 'text-blue-600'  },
    { label: 'Pending',  value: counts.pending,   icon: 'fa-clock',         bg: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Approved', value: counts.approved,  icon: 'fa-circle-check',  bg: 'bg-green-50',  text: 'text-green-600'  },
    { label: 'Rejected', value: counts.rejected,  icon: 'fa-circle-xmark',  bg: 'bg-red-50',    text: 'text-red-500'    },
  ];

  const el = document.getElementById('sub-stats');
  if (!el) return;
  el.innerHTML = items.map(i => `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl ${i.bg} flex items-center justify-center shrink-0">
        <i class="fa-solid ${i.icon} ${i.text}"></i>
      </div>
      <div>
        <div class="text-xl font-bold text-gray-900">${i.value}</div>
        <div class="text-xs text-gray-500">${i.label}</div>
      </div>
    </div>`).join('');
}

function filterSubRequests(status) {
  _activeFilter = status;
  ['all', 'pending', 'approved', 'rejected'].forEach(s => {
    const btn = document.getElementById(`filter-${s}`);
    if (!btn) return;
    btn.className = s === status
      ? 'px-4 py-1.5 rounded-lg text-sm font-medium transition-all bg-white text-gray-900 shadow-sm'
      : 'px-4 py-1.5 rounded-lg text-sm font-medium transition-all text-gray-500 hover:text-gray-700';
  });
  renderSubRequestsTable(_subRequests, status);
}

function paymentBadge(r) {
  if (r.is_trial == 1 || r.payment_status === 'trial') {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <i class="fa-solid fa-gift text-xs"></i> Free Trial
            </span>`;
  }
  if (r.payment_status === 'paid') {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
              <i class="fa-solid fa-circle-check text-xs"></i> Paid $${parseFloat(r.amount_paid || 0).toFixed(2)}
            </span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-500 border border-gray-200">
            <i class="fa-solid fa-clock text-xs"></i> Pending
          </span>`;
}

function renderSubRequestsTable(list, filter = 'all') {
  const filtered = filter === 'all' ? list : list.filter(r => r.status === filter);

  if (!filtered.length) {
    document.getElementById('sub-requests-table').innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-2xl text-gray-400 mb-3">
          <i class="fa-solid fa-inbox"></i>
        </div>
        <div class="text-sm font-medium text-gray-700">No ${filter === 'all' ? '' : filter + ' '}requests found</div>
        <div class="text-xs text-gray-400 mt-1">${filter === 'pending' ? 'All caught up!' : 'Nothing to show here.'}</div>
      </div>`;
    return;
  }

  const statusBadge = {
    pending:  `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>Pending</span>`,
    approved: `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200"><span class="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>Approved</span>`,
    rejected: `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200"><span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>Rejected</span>`,
  };

  document.getElementById('sub-requests-table').innerHTML = `
    <div class="overflow-x-auto">
      <table class="min-w-full">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-100">
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Manager</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Package</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Discount</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          ${filtered.map(r => {
            const discount = r.discount_token
              ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                   <i class="fa-solid fa-tag text-xs"></i> ${r.discount_token} &bull; ${r.discount_percentage}%
                 </span>`
              : `<span class="text-gray-300 text-sm">—</span>`;

            const actions = r.status === 'pending'
              ? `<div class="flex items-center gap-2">
                   <button onclick="approveSubRequest(${r.id})" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors">
                     <i class="fa-solid fa-check text-xs"></i> Approve
                   </button>
                   <button onclick="openRejectModal(${r.id})" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors">
                     <i class="fa-solid fa-xmark text-xs"></i> Reject
                   </button>
                 </div>`
              : `<button onclick="openSubRequestDetail(${r.id})" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors">
                   <i class="fa-solid fa-eye text-xs"></i> Details
                 </button>`;

            return `
              <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-5 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">${r.company_name.charAt(0).toUpperCase()}</div>
                    <div>
                      <div class="font-semibold text-gray-900 text-sm">${r.company_name}</div>
                      <div class="text-xs text-gray-400">${r.company_email}</div>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-4">
                  <div class="text-sm text-gray-800 font-medium">${r.manager_name}</div>
                  <div class="text-xs text-gray-400">${r.manager_email}</div>
                </td>
                <td class="px-5 py-4">
                  <div class="text-sm text-gray-800">${r.package_name}</div>
                  <div class="text-xs text-gray-400">$${parseFloat(r.package_price).toFixed(2)} / ${r.package_type}</div>
                </td>
                <td class="px-5 py-4">${paymentBadge(r)}</td>
                <td class="px-5 py-4">${discount}</td>
                <td class="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">${formatDate(r.created_at)}</td>
                <td class="px-5 py-4">${statusBadge[r.status] || ''}</td>
                <td class="px-5 py-4">${actions}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function approveSubRequest(id) {
  const r = _subRequests.find(x => x.id == id);
  if (!r) return;
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box max-w-md">
        <div class="p-6 text-center">
          <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <i class="fa-solid fa-circle-check text-green-500 text-3xl"></i>
          </div>
          <h3 class="text-lg font-bold text-gray-900 mb-1">Approve Request?</h3>
          <p class="text-sm text-gray-500 mb-2">You're about to approve the subscription for</p>
          <p class="text-sm font-semibold text-gray-800 mb-1">${r.company_name}</p>
          <p class="text-xs text-gray-400 mb-6">This will create the company and manager account for <strong>${r.manager_email}</strong>.</p>
          <div id="approve-error" class="hidden mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          <div class="flex gap-3 justify-center">
            <button onclick="closeModal()" class="btn-secondary px-6">Cancel</button>
            <button onclick="confirmApprove(${id})" class="inline-flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
              <i class="fa-solid fa-check"></i> Yes, Approve
            </button>
          </div>
        </div>
      </div>
    </div>`);
}

async function confirmApprove(id) {
  const errEl = document.getElementById('approve-error');
  try {
    await api.admin.approveSubscriptionRequest(id);
    showToast('Subscription approved! Company and manager account created.', 'success');
    closeModal();
    await loadSubRequests();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function openRejectModal(id) {
  const r = _subRequests.find(x => x.id == id);
  if (!r) return;
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box max-w-md">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-gray-900">Reject Request</h3>
            <p class="text-xs text-gray-400 mt-0.5">${r.company_name} &bull; ${r.manager_email}</p>
          </div>
          <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-6">
          <p class="text-sm text-gray-600 mb-4">An email notification will be sent to the requester. Providing a reason helps them understand the decision.</p>
          <div class="mb-4">
            <label class="label">Reason <span class="text-gray-400 font-normal">(optional)</span></label>
            <textarea id="reject-reason" class="input" rows="4" style="resize:none" placeholder="e.g. Incomplete information provided, please resubmit with full company details."></textarea>
          </div>
          <div id="reject-error" class="hidden mb-3 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl"></div>
          <div class="flex justify-end gap-3">
            <button onclick="closeModal()" class="btn-secondary">Cancel</button>
            <button onclick="submitReject(${id})" class="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
              <i class="fa-solid fa-xmark"></i> Reject Request
            </button>
          </div>
        </div>
      </div>
    </div>`);
}

async function submitReject(id) {
  const reason = document.getElementById('reject-reason').value.trim();
  const errEl  = document.getElementById('reject-error');
  errEl.classList.add('hidden');
  try {
    await api.admin.rejectSubscriptionRequest(id, reason);
    showToast('Request rejected and notification sent.', 'info');
    closeModal();
    await loadSubRequests();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function openSubRequestDetail(id) {
  const r = _subRequests.find(x => x.id == id);
  if (!r) return;

  const statusColors = {
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
    pending:  'bg-amber-100 text-amber-700',
  };

  const row = (label, value) =>
    `<div class="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
       <span class="text-gray-400 text-xs w-32 shrink-0 pt-0.5">${label}</span>
       <span class="text-sm text-gray-800 font-medium">${value || '<span class="text-gray-300">—</span>'}</span>
     </div>`;

  const rejection = r.rejection_reason
    ? `<div class="mt-4 p-3.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
         <div class="font-semibold mb-1 text-xs uppercase tracking-wide">Rejection Reason</div>
         ${r.rejection_reason}
       </div>`
    : '';

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box max-w-lg">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">${r.company_name.charAt(0).toUpperCase()}</div>
            <div>
              <h3 class="text-base font-bold text-gray-900">${r.company_name}</h3>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status] || ''}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
            </div>
          </div>
          <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-0">
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Company</div>
          ${row('Email', r.company_email)}
          ${row('Phone', r.company_phone)}
          ${row('Address', r.company_address)}
          <div class="pt-3">
            <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Manager</div>
            ${row('Full Name', r.manager_name)}
            ${row('Email', r.manager_email)}
          </div>
          <div class="pt-3">
            <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Subscription</div>
            ${row('Package', `${r.package_name} &mdash; <span class="text-blue-600 font-semibold">$${parseFloat(r.package_price).toFixed(2)}</span> / ${r.package_type}`)}
            ${r.discount_token ? row('Discount Token', `<span class="text-purple-700">${r.discount_token}</span> &bull; ${r.discount_percentage}% off`) : ''}
            ${row('Payment', paymentBadge(r))}
            ${row('Submitted', formatDateTime(r.created_at))}
          </div>
          ${rejection}
        </div>
        <div class="p-4 border-t border-gray-100 flex justify-end">
          <button onclick="closeModal()" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>`);
}
