async function renderProfile() {
  document.getElementById('app').innerHTML = renderLayout(state.user?.role || 'employee', `
    <div class="p-6 max-w-2xl animate-fade-in-up">
      ${pageHeader('My Profile', 'Manage your account and security settings')}
      <div id="profile-content">
        <div class="card mb-4 animate-pulse"><div class="h-24 bg-gray-100 rounded-lg"></div></div>
      </div>
    </div>`);

  try {
    const profile = await api.getProfile();
    renderProfileContent(profile);
  } catch (err) {
    document.getElementById('profile-content').innerHTML =
      `<div class="card text-center text-red-500 py-8">${err.message}</div>`;
  }
}

function renderProfileContent(profile) {
  const roleBadge = {
    admin:    'bg-purple-100 text-purple-700',
    manager:  'bg-blue-100 text-blue-700',
    employee: 'bg-green-100 text-green-700',
  }[profile.role] || 'bg-gray-100 text-gray-700';

  document.getElementById('profile-content').innerHTML = `
    <!-- Profile Card -->
    <div class="card mb-5">
      <div class="flex items-center gap-5">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shrink-0"
             style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
          ${avatarInitials(profile.name)}
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-xl font-bold text-gray-900">${escHtml(profile.name)}</h2>
          <p class="text-sm text-gray-500 mt-0.5">${escHtml(profile.email)}</p>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold mt-2 ${roleBadge}">
            ${profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </span>
        </div>
      </div>
    </div>

    <!-- 2FA Section -->
    <div class="card" id="twofa-section">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 class="font-semibold text-gray-900 flex items-center gap-2">
            <i class="fa-solid fa-shield-halved text-indigo-500"></i>
            Two-Factor Authentication
          </h3>
          <p class="text-sm text-gray-500 mt-1">
            Add an extra layer of security to your account using Google Authenticator or any TOTP app.
          </p>
        </div>
        ${profile.totp_enabled
          ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-semibold shrink-0">
               <i class="fa-solid fa-check-circle"></i> Active
             </span>`
          : `<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-sm font-medium shrink-0">
               <i class="fa-solid fa-shield text-gray-400"></i> Disabled
             </span>`
        }
      </div>

      <div id="twofa-body">
        ${profile.totp_enabled
          ? renderTwoFAActiveSection()
          : renderTwoFASetupButton()
        }
      </div>
    </div>`;
}

function renderTwoFASetupButton() {
  return `
    <button class="btn-primary" onclick="startSetup2FA()">
      <i class="fa-solid fa-qrcode"></i> Enable 2FA
    </button>`;
}

function renderTwoFAActiveSection() {
  return `
    <div class="flex items-center gap-3 p-3.5 bg-green-50 rounded-xl border border-green-100 mb-4">
      <i class="fa-solid fa-circle-check text-green-600 text-lg"></i>
      <div>
        <p class="text-sm font-semibold text-green-800">2FA is active on your account</p>
        <p class="text-xs text-green-600 mt-0.5">You will be asked for a code each time you log in.</p>
      </div>
    </div>
    <button class="btn-danger" onclick="openDisable2FAModal()">
      <i class="fa-solid fa-shield-xmark"></i> Disable 2FA
    </button>`;
}

async function startSetup2FA() {
  const body = document.getElementById('twofa-body');
  body.innerHTML = `<div class="text-sm text-gray-500 flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin"></i> Generating QR code…</div>`;

  try {
    const data = await api.setup2FA();
    body.innerHTML = `
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          1. Open <strong>Google Authenticator</strong> (or any TOTP app) and scan the QR code below.
        </p>
        <div class="flex justify-center">
          <img src="${data.qr_url}" alt="QR Code" class="w-48 h-48 rounded-xl border border-gray-200 p-2 bg-white" />
        </div>
        <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
          <p class="text-xs text-gray-500 mb-1">Or enter this secret key manually:</p>
          <code class="text-sm font-mono font-bold text-indigo-700 break-all">${data.secret}</code>
        </div>
        <p class="text-sm text-gray-600">2. Enter the 6-digit code from your authenticator app to confirm:</p>
        <div class="flex gap-3">
          <input id="setup-code" type="number" class="input text-center font-mono text-lg tracking-widest"
                 placeholder="000000" maxlength="6"
                 oninput="if(this.value.length>6)this.value=this.value.slice(0,6)"
                 onkeydown="if(event.key==='Enter')confirmEnable2FA()" />
          <button class="btn-primary whitespace-nowrap" onclick="confirmEnable2FA()">
            <i class="fa-solid fa-check"></i> Verify &amp; Enable
          </button>
        </div>
        <div id="setup-error" class="hidden p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
          <i class="fa-solid fa-circle-exclamation mr-1"></i>
          <span id="setup-error-text"></span>
        </div>
        <button onclick="renderProfile()" class="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>`;
    setTimeout(() => document.getElementById('setup-code')?.focus(), 100);
  } catch (err) {
    body.innerHTML = `<div class="text-red-500 text-sm">${err.message}</div>`;
  }
}

async function confirmEnable2FA() {
  const codeEl = document.getElementById('setup-code');
  const errEl  = document.getElementById('setup-error');
  const errTxt = document.getElementById('setup-error-text');
  const code   = String(codeEl.value).trim();

  errEl.classList.add('hidden');
  try {
    await api.enable2FA(code);
    showToast('2FA enabled successfully!', 'success');
    // Reload profile
    const profile = await api.getProfile();
    renderProfileContent(profile);
  } catch (err) {
    errTxt.textContent = err.message || 'Invalid code. Please try again.';
    errEl.classList.remove('hidden');
    codeEl.value = '';
    codeEl.focus();
  }
}

function openDisable2FAModal() {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box p-6">
        <h3 class="text-lg font-bold text-gray-900 mb-2">Disable Two-Factor Authentication</h3>
        <p class="text-sm text-gray-600 mb-4">Enter the 6-digit code from your authenticator app to confirm.</p>
        <div class="mb-4">
          <label class="label">Authenticator Code</label>
          <input id="disable-code" type="number" class="input text-center font-mono text-lg tracking-widest"
                 placeholder="000000" maxlength="6"
                 oninput="if(this.value.length>6)this.value=this.value.slice(0,6)"
                 onkeydown="if(event.key==='Enter')confirmDisable2FA()" />
        </div>
        <div id="disable-error" class="hidden mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
          <i class="fa-solid fa-circle-exclamation mr-1"></i>
          <span id="disable-error-text"></span>
        </div>
        <div class="flex gap-3">
          <button class="btn-danger flex-1" onclick="confirmDisable2FA()">
            <i class="fa-solid fa-shield-xmark"></i> Disable 2FA
          </button>
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
      </div>
    </div>`);
  setTimeout(() => document.getElementById('disable-code')?.focus(), 100);
}

async function confirmDisable2FA() {
  const codeEl = document.getElementById('disable-code');
  const errEl  = document.getElementById('disable-error');
  const errTxt = document.getElementById('disable-error-text');
  const code   = String(codeEl.value).trim();

  errEl.classList.add('hidden');
  try {
    await api.disable2FA(code);
    closeModal();
    showToast('2FA disabled', 'info');
    const profile = await api.getProfile();
    renderProfileContent(profile);
  } catch (err) {
    errTxt.textContent = err.message || 'Invalid code. Please try again.';
    errEl.classList.remove('hidden');
    codeEl.value = '';
    codeEl.focus();
  }
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
