// ─── Router ────────────────────────────────────────────────────────────────────

const routes = {
  // Public
  'login': () => renderLogin(),
  'subscribe': () => renderSubscribe(),

  // Admin
  'admin-dashboard': () => renderAdminDashboard(),
  'admin-companies': () => renderAdminCompanies(),
  'admin-managers': () => renderAdminManagers(),
  'admin-packages': () => renderAdminPackages(),
  'admin-tokens': () => renderAdminTokens(),
  'admin-subscription-requests': () => renderAdminSubscriptionRequests(),

  // Manager
  'manager-dashboard': () => renderManagerDashboard(),
  'manager-users': () => renderManagerUsers(),
  'manager-workflows': () => renderManagerWorkflows(),
  'manager-tasks': () => renderManagerTasks(),
  'manager-task-detail': (p) => renderManagerTaskDetail(p),

  // Employee
  'employee-dashboard': () => renderEmployeeDashboard(),
  'employee-tasks': (p) => renderEmployeeTasks(p),
  'employee-task-detail': (p) => renderEmployeeTaskDetail(p),
};

function roleHome(role) {
  return role === 'admin' ? 'admin-dashboard' : role === 'manager' ? 'manager-dashboard' : 'employee-dashboard';
}

async function navigate(page, params = {}) {
  state.currentPage = page;
  state.currentParams = params;
  const route = routes[page];
  if (!route) { console.error('Unknown route:', page); return; }
  try {
    await route(params);
  } catch (err) {
    console.error('Navigation error:', err);
    showToast('Page load error: ' + err.message, 'error');
  }
}

async function logout() {
  api.setToken(null);
  state.user = null;
  state.currentPage = null;
  navigate('login');
  showToast('Signed out successfully', 'info');
}

// ─── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  if (api.token) {
    try {
      const user = await api.auth.me();
      state.user = user;
      navigate(roleHome(user.role));
    } catch {
      api.setToken(null);
      navigate('login');
    }
  } else {
    navigate('login');
  }
}

// Handle browser back/forward
window.addEventListener('popstate', () => boot());

// Boot the application
boot();
