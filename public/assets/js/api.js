const API_BASE = '/api';

const api = {
  token: localStorage.getItem('tm_token'),

  setToken(t) { this.token = t; t ? localStorage.setItem('tm_token', t) : localStorage.removeItem('tm_token'); },

  async request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get: (p) => api.request('GET', p),
  post: (p, b) => api.request('POST', p, b),
  put: (p, b) => api.request('PUT', p, b),
  del: (p) => api.request('DELETE', p),

  async upload(path, formData) {
    const opts = {
      method: 'POST',
      headers: { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: formData,
    };
    const res  = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  auth: {
    login: (e, p) => api.post('/auth/login', { email: e, password: p }),
    me: () => api.get('/auth/me'),
  },
  admin: {
    stats: () => api.get('/admin/stats'),
    listCompanies: () => api.get('/admin/companies'),
    createCompany: (d) => api.post('/admin/companies', d),
    updateCompany: (id, d) => api.put(`/admin/companies/${id}`, d),
    listManagers: () => api.get('/admin/managers'),
    toggleManager: (id) => api.put(`/admin/managers/${id}/toggle-status`),
    listPackages: () => api.get('/admin/packages'),
    createPackage: (d) => api.post('/admin/packages', d),
    updatePackage: (id, d) => api.put(`/admin/packages/${id}`, d),
    deletePackage: (id) => api.del(`/admin/packages/${id}`),
    listTokens: () => api.get('/admin/discount-tokens'),
    createToken: (d) => api.post('/admin/discount-tokens', d),
    listSubscriptionRequests: () => api.get('/admin/subscription-requests'),
    approveSubscriptionRequest: (id) => api.put(`/admin/subscription-requests/${id}/approve`),
    rejectSubscriptionRequest: (id, reason) => api.put(`/admin/subscription-requests/${id}/reject`, { reason }),
  },
  manager: {
    stats: () => api.get('/manager/stats'),
    listUsers: () => api.get('/manager/users'),
    createUser: (d) => api.post('/manager/users', d),
    updateUser: (id, d) => api.put(`/manager/users/${id}`, d),
    toggleUserStatus: (id) => api.put(`/manager/users/${id}/toggle-status`),
    toggleTaskCreation: (id) => api.put(`/manager/users/${id}/toggle-task-creation`),
    listWorkflows: () => api.get('/manager/workflows'),
    createWorkflow: (d) => api.post('/manager/workflows', d),
    updateWorkflow: (id, d) => api.put(`/manager/workflows/${id}`, d),
    deleteWorkflow: (id) => api.del(`/manager/workflows/${id}`),
    listTasks: () => api.get('/manager/tasks'),
    getTask: (id) => api.get(`/manager/tasks/${id}`),
    createTask: (d) => api.post('/manager/tasks', d),
    updateTask: (id, d) => api.put(`/manager/tasks/${id}`, d),
    deleteTask: (id) => api.del(`/manager/tasks/${id}`),
    addComment: (id, content) => api.post(`/manager/tasks/${id}/comments`, { content }),
    uploadAttachment: (id, fd) => api.upload(`/manager/tasks/${id}/attachments`, fd),
    deleteAttachment: (taskId, attachId) => api.del(`/manager/tasks/${taskId}/attachments/${attachId}`),
    listCompanyUsers: () => api.get('/manager/company-users'),
    projectStats: () => api.get('/manager/project-stats'),
  },
  subscribe: {
    getPackages: () => api.get('/subscribe/packages'),
    submit: (d) => api.post('/subscribe', d),
    createPaymentIntent: (d) => api.post('/subscribe/payment-intent', d),
  },
  employee: {
    stats: () => api.get('/employee/stats'),
    listWorkflows: () => api.get('/employee/workflows'),
    listTasks: () => api.get('/employee/tasks'),
    getTask: (id) => api.get(`/employee/tasks/${id}`),
    createTask: (d) => api.post('/employee/tasks', d),
    updateStage: (id, stageId) => api.put(`/employee/tasks/${id}/stage`, { stage_id: stageId }),
    addComment: (id, content) => api.post(`/employee/tasks/${id}/comments`, { content }),
    uploadAttachment: (id, fd) => api.upload(`/employee/tasks/${id}/attachments`, fd),
    deleteAttachment: (taskId, attachId) => api.del(`/employee/tasks/${taskId}/attachments/${attachId}`),
  },
};
