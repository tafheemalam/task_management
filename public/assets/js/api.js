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
    verify2FA: (tempToken, code) => api.post('/auth/2fa/verify', { temp_token: tempToken, code }),
  },

  getProfile: () => api.get('/profile'),
  setup2FA: () => api.post('/profile/2fa/setup'),
  enable2FA: (code) => api.post('/profile/2fa/enable', { code }),
  disable2FA: (code) => api.post('/profile/2fa/disable', { code }),
  getBrandingSettings: () => api.get('/settings/branding'),
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
    listProjectMembers: (wfId) => api.get(`/manager/workflows/${wfId}/members`),
    addProjectMember: (wfId, userId) => api.post(`/manager/workflows/${wfId}/members`, { user_id: userId }),
    removeProjectMember: (wfId, userId) => api.del(`/manager/workflows/${wfId}/members/${userId}`),
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
    getActivityLog: (id) => api.get(`/manager/tasks/${id}/activity`),
    listTags: () => api.get('/tags'),
    createTag: (d) => api.post('/tags', d),
    deleteTag: (id) => api.del(`/tags/${id}`),
    addTagToTask: (taskId, tagId) => api.post(`/manager/tasks/${taskId}/tags`, { tag_id: tagId }),
    removeTagFromTask: (taskId, tagId) => api.del(`/manager/tasks/${taskId}/tags/${tagId}`),
    listNotifications: () => api.get('/manager/notifications'),
    markNotificationRead: (id) => api.put(`/manager/notifications/${id}/read`),
    markAllNotificationsRead: () => api.put('/manager/notifications/all/read'),
    addDependency: (taskId, dependsOnId) => api.post(`/manager/tasks/${taskId}/dependencies`, { depends_on_id: dependsOnId }),
    removeDependency: (taskId, depId) => api.del(`/manager/tasks/${taskId}/dependencies/${depId}`),
    search: (q) => api.get(`/manager/search?q=${encodeURIComponent(q)}`),
    listTimeLogs: (id) => api.get(`/manager/tasks/${id}/time-logs`),
    addTimeLog: (id, d) => api.post(`/manager/tasks/${id}/time-logs`, d),
    deleteTimeLog: (taskId, logId) => api.del(`/manager/tasks/${taskId}/time-logs/${logId}`),
    timeReport: () => api.get('/manager/time-report'),
    listWebhooks: () => api.get('/manager/webhooks'),
    createWebhook: (d) => api.post('/manager/webhooks', d),
    updateWebhook: (id, d) => api.put(`/manager/webhooks/${id}`, d),
    deleteWebhook: (id) => api.del(`/manager/webhooks/${id}`),
    testWebhook: (id) => api.post(`/manager/webhooks/${id}/test`),
    getWorkload: () => api.get('/manager/workload'),
    listApiKeys: () => api.get('/api-keys'),
    createApiKey: (d) => api.post('/api-keys', d),
    deleteApiKey: (id) => api.del(`/api-keys/${id}`),
    toggleApiKey: (id) => api.request('PATCH', `/api-keys/${id}/toggle`),
    listCustomFields: (workflowId) => api.get(`/manager/workflows/${workflowId}/custom-fields`),
    createCustomField: (workflowId, d) => api.post(`/manager/workflows/${workflowId}/custom-fields`, d),
    updateCustomField: (id, d) => api.put(`/manager/custom-fields/${id}`, d),
    deleteCustomField: (id) => api.del(`/manager/custom-fields/${id}`),
    getBranding: (companyId) => api.get(`/admin/branding/${companyId}`),
    saveBranding: (companyId, d) => api.put(`/admin/branding/${companyId}`, d),
    // Checklist subtasks
    listSubtasks: (taskId) => api.get(`/manager/tasks/${taskId}/subtasks`),
    createSubtask: (taskId, data) => api.post(`/manager/tasks/${taskId}/subtasks`, data),
    updateSubtask: (taskId, subId, data) => api.put(`/manager/tasks/${taskId}/subtasks/${subId}`, data),
    deleteSubtask: (taskId, subId) => api.del(`/manager/tasks/${taskId}/subtasks/${subId}`),
    // Duplicate
    duplicateTask: (taskId) => api.post(`/manager/tasks/${taskId}/duplicate`),
    // Task Templates
    listTaskTemplates: () => api.get('/manager/task-templates'),
    createTaskTemplate: (data) => api.post('/manager/task-templates', data),
    updateTaskTemplate: (id, data) => api.put(`/manager/task-templates/${id}`, data),
    deleteTaskTemplate: (id) => api.del(`/manager/task-templates/${id}`),
    saveTaskAsTemplate: (taskId, data) => api.post(`/manager/tasks/${taskId}/save-as-template`, data),
    // Project Templates
    listProjectTemplates: () => api.get('/manager/project-templates'),
    saveProjectAsTemplate: (wfId, data) => api.post(`/manager/workflows/${wfId}/save-as-template`, data),
    createProjectFromTemplate: (tplId, data) => api.post(`/manager/project-templates/${tplId}/create-project`, data),
    deleteProjectTemplate: (id) => api.del(`/manager/project-templates/${id}`),
  },
  subscribe: {
    getPackages: () => api.get('/subscribe/packages'),
    submit: (d) => api.post('/subscribe', d),
    createPaymentIntent: (d) => api.post('/subscribe/payment-intent', d),
  },
  employee: {
    stats: () => api.get('/employee/stats'),
    listWorkflows: () => api.get('/employee/workflows'),
    listProjectTasks: () => api.get('/employee/project-tasks'),
    listTasks: () => api.get('/employee/tasks'),
    getTask: (id) => api.get(`/employee/tasks/${id}`),
    createTask: (d) => api.post('/employee/tasks', d),
    updateStage: (id, stageId) => api.put(`/employee/tasks/${id}/stage`, { stage_id: stageId }),
    addComment: (id, content) => api.post(`/employee/tasks/${id}/comments`, { content }),
    uploadAttachment: (id, fd) => api.upload(`/employee/tasks/${id}/attachments`, fd),
    deleteAttachment: (taskId, attachId) => api.del(`/employee/tasks/${taskId}/attachments/${attachId}`),
    getActivityLog: (id) => api.get(`/employee/tasks/${id}/activity`),
    addTagToTask: (taskId, tagId) => api.post(`/employee/tasks/${taskId}/tags`, { tag_id: tagId }),
    removeTagFromTask: (taskId, tagId) => api.del(`/employee/tasks/${taskId}/tags/${tagId}`),
    listNotifications: () => api.get('/employee/notifications'),
    markNotificationRead: (id) => api.put(`/employee/notifications/${id}/read`),
    markAllNotificationsRead: () => api.put('/employee/notifications/all/read'),
    search: (q) => api.get(`/employee/search?q=${encodeURIComponent(q)}`),
    listTimeLogs: (id) => api.get(`/employee/tasks/${id}/time-logs`),
    addTimeLog: (id, d) => api.post(`/employee/tasks/${id}/time-logs`, d),
    // Checklist subtasks
    listSubtasks: (taskId) => api.get(`/employee/tasks/${taskId}/subtasks`),
    createSubtask: (taskId, data) => api.post(`/employee/tasks/${taskId}/subtasks`, data),
    updateSubtask: (taskId, subId, data) => api.put(`/employee/tasks/${taskId}/subtasks/${subId}`, data),
    deleteSubtask: (taskId, subId) => api.del(`/employee/tasks/${taskId}/subtasks/${subId}`),
    // Duplicate
    duplicateTask: (taskId) => api.post(`/employee/tasks/${taskId}/duplicate`),
  },
};
