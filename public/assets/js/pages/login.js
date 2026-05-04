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

        <!-- Card -->
        <div class="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
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

      </div>
    </div>`;
}

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

function togglePwd() {
  const input = document.getElementById('password');
  const eye   = document.getElementById('pwd-eye');
  if (input.type === 'password') { input.type = 'text'; eye.className = 'fa-solid fa-eye-slash text-sm'; }
  else { input.type = 'password'; eye.className = 'fa-solid fa-eye text-sm'; }
}
