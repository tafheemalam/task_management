async function renderBranding() {
  document.getElementById('app').innerHTML = renderLayout('admin', `
    <div class="p-6 animate-fade-in-up">
      ${pageHeader('White-Label Branding', 'Customize the look and feel for each company')}
      <div id="branding-content">
        <div class="card animate-pulse"><div class="h-32 bg-gray-100 rounded-lg"></div></div>
      </div>
    </div>`);

  try {
    const companies = await api.admin.listCompanies();
    renderBrandingContent(companies);
  } catch (err) {
    document.getElementById('branding-content').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

function renderBrandingContent(companies) {
  if (!companies.length) {
    document.getElementById('branding-content').innerHTML =
      `<div class="card text-center py-12 text-gray-400">
         <i class="fa-solid fa-building text-4xl mb-3"></i>
         <p>No companies found. Create a company first.</p>
       </div>`;
    return;
  }

  document.getElementById('branding-content').innerHTML = `
    <div class="grid lg:grid-cols-3 gap-5">
      <!-- Company Selector -->
      <div class="card">
        <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <i class="fa-solid fa-building text-indigo-500"></i> Select Company
        </h3>
        <div class="space-y-1">
          ${companies.map(c => `
            <button onclick="loadCompanyBranding(${c.id}, '${escBrandHtml(c.name)}')"
                    id="company-btn-${c.id}"
                    class="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 font-medium text-gray-700">
              ${escBrandHtml(c.name)}
            </button>`).join('')}
        </div>
      </div>

      <!-- Branding Form -->
      <div class="lg:col-span-2">
        <div id="branding-form-area">
          <div class="card flex flex-col items-center justify-center py-16 text-gray-400">
            <i class="fa-solid fa-palette text-4xl mb-3"></i>
            <p class="text-sm">Select a company to manage its branding</p>
          </div>
        </div>
      </div>
    </div>`;
}

async function loadCompanyBranding(companyId, companyName) {
  // Highlight selected company
  document.querySelectorAll('[id^="company-btn-"]').forEach(btn => {
    btn.className = 'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 font-medium text-gray-700';
  });
  const selected = document.getElementById('company-btn-' + companyId);
  if (selected) selected.className = 'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors bg-indigo-600 text-white font-semibold';

  document.getElementById('branding-form-area').innerHTML =
    `<div class="card animate-pulse"><div class="h-64 bg-gray-100 rounded-lg"></div></div>`;

  try {
    const branding = await api.manager.getBranding(companyId);
    renderBrandingForm(companyId, companyName, branding);
  } catch (err) {
    document.getElementById('branding-form-area').innerHTML =
      `<div class="card text-red-500 text-sm">${err.message}</div>`;
  }
}

function renderBrandingForm(companyId, companyName, branding) {
  document.getElementById('branding-form-area').innerHTML = `
    <div class="card">
      <h3 class="font-semibold text-gray-900 mb-5 flex items-center gap-2">
        <i class="fa-solid fa-palette text-indigo-500"></i>
        Branding: ${escBrandHtml(companyName)}
      </h3>

      <div class="grid grid-cols-1 gap-4 mb-6">
        <!-- Display Name -->
        <div>
          <label class="label">Company Display Name</label>
          <input id="brand-name" type="text" class="input" placeholder="e.g. Acme Corp"
                 value="${escBrandHtml(branding.company_display_name || '')}" />
          <p class="text-xs text-gray-400 mt-1">Shown in the sidebar instead of "TaskFlow"</p>
        </div>

        <!-- Logo URL -->
        <div>
          <label class="label">Logo URL</label>
          <input id="brand-logo" type="url" class="input" placeholder="https://example.com/logo.png"
                 value="${escBrandHtml(branding.logo_url || '')}"
                 oninput="updateLogoPreview()" />
          <div class="mt-2" id="logo-preview-wrap" style="${branding.logo_url ? '' : 'display:none'}">
            <img id="logo-preview" src="${branding.logo_url || ''}" alt="Logo preview"
                 class="h-14 w-auto rounded-lg border border-gray-200 bg-gray-50 object-contain p-1"
                 onerror="this.style.display='none'" />
          </div>
        </div>

        <!-- Colors -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Primary Color</label>
            <div class="flex gap-2 items-center">
              <input id="brand-primary" type="color" class="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                     value="${branding.primary_color || '#6366f1'}"
                     oninput="updateColorPreview()" />
              <input id="brand-primary-hex" type="text" class="input font-mono"
                     value="${branding.primary_color || '#6366f1'}"
                     oninput="syncColorFromText('brand-primary')" maxlength="7" />
            </div>
          </div>
          <div>
            <label class="label">Secondary Color</label>
            <div class="flex gap-2 items-center">
              <input id="brand-secondary" type="color" class="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                     value="${branding.secondary_color || '#3b82f6'}"
                     oninput="updateColorPreview()" />
              <input id="brand-secondary-hex" type="text" class="input font-mono"
                     value="${branding.secondary_color || '#3b82f6'}"
                     oninput="syncColorFromText('brand-secondary')" maxlength="7" />
            </div>
          </div>
        </div>
      </div>

      <!-- Live Preview -->
      <div class="mb-6">
        <label class="label">Live Sidebar Preview</label>
        <div id="sidebar-preview" class="rounded-xl overflow-hidden w-52 shadow-lg">
          ${renderSidebarPreview(branding.primary_color || '#6366f1', branding.secondary_color || '#3b82f6', branding.company_display_name || 'TaskFlow', branding.logo_url || '')}
        </div>
      </div>

      <div id="branding-save-error" class="hidden mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl"></div>

      <button class="btn-primary" onclick="saveBranding(${companyId})">
        <i class="fa-solid fa-floppy-disk"></i> Save Branding
      </button>
    </div>`;
}

function renderSidebarPreview(primary, secondary, name, logoUrl) {
  return `
    <div style="background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%);padding:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08)">
        ${logoUrl
          ? `<img src="${logoUrl}" alt="Logo" style="width:28px;height:28px;border-radius:8px;object-fit:contain;background:white;padding:2px" onerror="this.style.display='none'" />`
          : `<div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,${primary},${secondary});display:flex;align-items:center;justify-content:center">
               <i class="fa-solid fa-layer-group" style="color:white;font-size:11px"></i>
             </div>`}
        <div style="color:white;font-size:11px;font-weight:700">${name}</div>
      </div>
      ${[
        { icon: 'fa-gauge-high', label: 'Dashboard', active: true },
        { icon: 'fa-users', label: 'Team Members' },
        { icon: 'fa-list-check', label: 'Tasks' },
      ].map(item => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;margin-bottom:2px;
                    ${item.active ? `background:linear-gradient(135deg,${primary}44,${secondary}33);color:white;font-weight:600` : 'color:rgba(255,255,255,0.5)'}">
          <i class="fa-solid ${item.icon}" style="font-size:11px;width:14px;text-align:center"></i>
          <span style="font-size:11px">${item.label}</span>
        </div>`).join('')}
    </div>`;
}

function updateColorPreview() {
  const primary   = document.getElementById('brand-primary')?.value || '#6366f1';
  const secondary = document.getElementById('brand-secondary')?.value || '#3b82f6';
  document.getElementById('brand-primary-hex').value   = primary;
  document.getElementById('brand-secondary-hex').value = secondary;
  refreshPreview();
}

function syncColorFromText(id) {
  const hex = document.getElementById(id + '-hex')?.value || '';
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById(id).value = hex;
    refreshPreview();
  }
}

function updateLogoPreview() {
  const url = document.getElementById('brand-logo')?.value || '';
  const wrap = document.getElementById('logo-preview-wrap');
  const img  = document.getElementById('logo-preview');
  if (url) {
    wrap.style.display = '';
    img.src = url;
    img.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
  refreshPreview();
}

function refreshPreview() {
  const primary   = document.getElementById('brand-primary')?.value || '#6366f1';
  const secondary = document.getElementById('brand-secondary')?.value || '#3b82f6';
  const name      = document.getElementById('brand-name')?.value || 'TaskFlow';
  const logoUrl   = document.getElementById('brand-logo')?.value || '';
  const previewEl = document.getElementById('sidebar-preview');
  if (previewEl) previewEl.innerHTML = renderSidebarPreview(primary, secondary, name, logoUrl);
}

async function saveBranding(companyId) {
  const errEl = document.getElementById('branding-save-error');
  errEl.classList.add('hidden');

  const data = {
    company_display_name: document.getElementById('brand-name')?.value || '',
    logo_url:             document.getElementById('brand-logo')?.value || null,
    primary_color:        document.getElementById('brand-primary')?.value || '#6366f1',
    secondary_color:      document.getElementById('brand-secondary')?.value || '#3b82f6',
  };
  if (!data.logo_url) data.logo_url = null;

  try {
    await api.manager.saveBranding(companyId, data);
    showToast('Branding saved!', 'success');
    // Apply to current session if this is the user's company
    loadAndApplyBranding();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function escBrandHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
