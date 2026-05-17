function renderLogin() {
  document.getElementById('app').innerHTML = `<div id="modal-root" class="hidden"></div>
    <div class="min-h-screen flex items-center justify-center p-4" style="background:linear-gradient(135deg,#f0f4ff 0%,#fafbff 50%,#f5f0ff 100%)">
      <div class="w-full max-w-sm">

        <!-- Logo -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg" style="background:linear-gradient(135deg,#2563eb,#4f46e5)">
            <i class="fa-solid fa-layer-group text-white text-2xl"></i>
          </div>
          <h1 class="text-2xl font-bold text-gray-900">TaskFlow</h1>
          <p class="text-gray-400 text-sm mt-1">Project Management Platform</p>
        </div>

        <!-- Login Card -->
        <div id="login-card" class="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <h2 class="text-lg font-bold text-gray-900 mb-6">Welcome back</h2>

          <form id="login-form" onsubmit="handleLogin(event)">
            <div class="mb-4">
              <label class="label" for="email">Email Address</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"><i class="fa-solid fa-envelope"></i></span>
                <input id="email" type="email" class="input pl-9" placeholder="you@company.com" required autocomplete="email" />
              </div>
            </div>
            <div class="mb-5">
              <label class="label" for="password">Password</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"><i class="fa-solid fa-lock"></i></span>
                <input id="password" type="password" class="input pl-9 pr-10" placeholder="••••••••" required autocomplete="current-password" />
                <button type="button" onclick="togglePwd()" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <i class="fa-solid fa-eye text-sm" id="pwd-eye"></i>
                </button>
              </div>
            </div>

            <div id="login-error" class="hidden mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
              <i class="fa-solid fa-circle-exclamation shrink-0"></i>
              <span id="login-error-text"></span>
            </div>

            <button id="login-btn" type="submit" class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm" style="background:linear-gradient(135deg,#2563eb,#4f46e5)">
              <i class="fa-solid fa-right-to-bracket"></i> Sign In
            </button>
          </form>

          <!-- Demo credentials -->
          <div class="mt-5 p-3.5 bg-blue-50 rounded-xl border border-blue-100">
            <div class="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
              <i class="fa-solid fa-circle-info"></i> Demo Admin Credentials
            </div>
            <div class="text-xs text-blue-600 space-y-0.5">
              <div><span class="text-blue-400">Email</span> &nbsp; admin@taskmanager.com</div>
              <div><span class="text-blue-400">Pass</span> &nbsp;&nbsp; admin123</div>
            </div>
          </div>

          <div class="mt-5 text-center text-sm text-gray-400">
            New company?
            <button onclick="navigate('subscribe')" class="text-blue-600 hover:underline font-medium">Subscribe now</button>
          </div>
        </div>

        <!-- 2FA Card (hidden by default) -->
        <div id="twofa-card" class="hidden bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div class="text-center mb-6">
            <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3 bg-indigo-50">
              <i class="fa-solid fa-shield-halved text-indigo-600 text-2xl"></i>
            </div>
            <h2 class="text-lg font-bold text-gray-900">Two-Factor Authentication</h2>
            <p class="text-sm text-gray-500 mt-1">Check your authenticator app for the 6-digit code</p>
          </div>

          <div class="mb-5">
            <label class="label" for="totp-code">Authenticator Code</label>
            <input id="totp-code" type="number" class="input text-center text-2xl tracking-widest font-mono"
                   placeholder="000000" maxlength="6"
                   oninput="if(this.value.length>6)this.value=this.value.slice(0,6)"
                   onkeydown="if(event.key==='Enter')verify2FA()" />
          </div>

          <div id="twofa-error" class="hidden mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
            <i class="fa-solid fa-circle-exclamation shrink-0"></i>
            <span id="twofa-error-text"></span>
          </div>

          <button id="twofa-btn" onclick="verify2FA()"
                  class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm"
                  style="background:linear-gradient(135deg,#6366f1,#3b82f6)">
            <i class="fa-solid fa-check-circle"></i> Verify Code
          </button>

          <button onclick="cancelTwoFA()" class="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Back to login
          </button>
        </div>

      </div>
    </div>`;

  // Set up inline validation after DOM is ready
  setTimeout(() => {
    const emailInp = document.getElementById('email');
    const passInp  = document.getElementById('password');
    if (emailInp) setupFieldValidation(emailInp, [_validators.required, _validators.email]);
    if (passInp)  setupFieldValidation(passInp,  [_validators.required]);
  }, 50);
}

let _2faTempToken = null;

async function handleLogin(e) {
  e.preventDefault();
  const btn     = document.getElementById('login-btn');
  const errEl   = document.getElementById('login-error');
  const errText = document.getElementById('login-error-text');
  const email   = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
  errEl.classList.add('hidden');

  try {
    const data = await api.auth.login(email, password);

    if (data.status === '2fa_required') {
      _2faTempToken = data.temp_token;
      document.getElementById('login-card').classList.add('hidden');
      document.getElementById('twofa-card').classList.remove('hidden');
      setTimeout(() => document.getElementById('totp-code')?.focus(), 100);
      return;
    }

    api.setToken(data.token);
    state.user = data.user;
    navigate(roleHome(data.user.role));
  } catch (err) {
    errText.textContent = err.message || 'Invalid credentials. Please try again.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
  }
}

async function verify2FA() {
  const btn      = document.getElementById('twofa-btn');
  const errEl    = document.getElementById('twofa-error');
  const errText  = document.getElementById('twofa-error-text');
  const codeEl   = document.getElementById('totp-code');
  const code     = String(codeEl.value).padStart(6, '0');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying…';
  errEl.classList.add('hidden');

  try {
    const data = await api.auth.verify2FA(_2faTempToken, code);
    api.setToken(data.token);
    state.user = data.user;
    navigate(roleHome(data.user.role));
  } catch (err) {
    errText.textContent = err.message || 'Invalid code. Please try again.';
    errEl.classList.remove('hidden');
    codeEl.value = '';
    codeEl.focus();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Verify Code';
  }
}

function cancelTwoFA() {
  _2faTempToken = null;
  document.getElementById('twofa-card').classList.add('hidden');
  document.getElementById('login-card').classList.remove('hidden');
  document.getElementById('twofa-error').classList.add('hidden');
  document.getElementById('totp-code').value = '';
}

function togglePwd() {
  const input = document.getElementById('password');
  const eye   = document.getElementById('pwd-eye');
  if (input.type === 'password') { input.type = 'text'; eye.className = 'fa-solid fa-eye-slash text-sm'; }
  else { input.type = 'password'; eye.className = 'fa-solid fa-eye text-sm'; }
}
