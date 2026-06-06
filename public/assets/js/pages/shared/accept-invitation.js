async function renderAcceptInvitation(params) {
  const token = (params && params.token) || new URLSearchParams(window.location.search).get('invite') || '';

  document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-6"
         style="background:linear-gradient(145deg,#667eea 0%,#764ba2 100%)">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div class="text-center mb-6">
          <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-md">
            <i class="fa-solid fa-user-plus"></i>
          </div>
          <h1 class="text-2xl font-bold text-gray-900">Join Your Team</h1>
          <p id="inv-email-hint" class="text-gray-500 text-sm mt-1">Validating invitation…</p>
        </div>
        <div id="inv-content">
          <div class="animate-pulse space-y-3">
            <div class="h-10 bg-gray-100 rounded-lg"></div>
            <div class="h-10 bg-gray-100 rounded-lg"></div>
            <div class="h-10 bg-gray-100 rounded-lg"></div>
            <div class="h-10 bg-gray-100 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>`;

  if (!token) {
    _renderInviteError('No invitation token found in the link.');
    return;
  }

  try {
    const inv = await api.invite.validate(token);
    document.getElementById('inv-email-hint').textContent = `Setting up account for ${inv.email}`;
    document.getElementById('inv-content').innerHTML = `
      <form id="accept-form" onsubmit="submitAcceptInvitation(event,'${token}')" class="space-y-4">
        <div>
          <label class="label">Email</label>
          <input class="input bg-gray-50" value="${inv.email}" disabled />
        </div>
        <div>
          <label class="label">Full Name <span class="text-red-500">*</span></label>
          <input name="name" class="input" placeholder="Your full name" required autofocus />
        </div>
        <div>
          <label class="label">Password <span class="text-red-500">*</span></label>
          <input name="password" type="password" class="input" placeholder="At least 6 characters" required minlength="6" />
        </div>
        <div>
          <label class="label">Confirm Password <span class="text-red-500">*</span></label>
          <input name="password_confirm" type="password" class="input" placeholder="Repeat password" required />
        </div>
        <div id="accept-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
        <button type="submit" id="accept-submit-btn" class="btn-primary w-full">Create Account</button>
      </form>
      <p class="text-center text-xs text-gray-400 mt-4">
        Already have an account?
        <a href="#" onclick="navigate('login')" class="text-blue-500 hover:underline">Sign in</a>
      </p>`;
  } catch (err) {
    _renderInviteError('This invitation link is invalid or has expired. Please ask your manager to resend the invitation.');
  }
}

function _renderInviteError(msg) {
  document.getElementById('inv-email-hint').textContent = '';
  document.getElementById('inv-content').innerHTML = `
    <div class="text-center py-4">
      <i class="fa-solid fa-triangle-exclamation text-4xl text-red-400 block mb-3"></i>
      <p class="text-gray-700 font-medium">Invitation Not Found</p>
      <p class="text-gray-400 text-sm mt-1 mb-6">${msg}</p>
      <button class="btn-primary" onclick="navigate('login')">Go to Login</button>
    </div>`;
}

async function submitAcceptInvitation(e, token) {
  e.preventDefault();
  const fd       = new FormData(e.target);
  const name     = fd.get('name').trim();
  const password = fd.get('password');
  const confirm  = fd.get('password_confirm');
  const errEl    = document.getElementById('accept-error');
  errEl.classList.add('hidden');

  if (password !== confirm) {
    errEl.textContent = 'Passwords do not match';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('accept-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';

  try {
    await api.invite.accept({ token, name, password });
    document.getElementById('inv-email-hint').textContent = 'Welcome to the team!';
    document.getElementById('inv-content').innerHTML = `
      <div class="text-center py-4">
        <i class="fa-solid fa-circle-check text-5xl text-green-500 block mb-4"></i>
        <p class="text-gray-800 font-semibold text-lg">Account Created!</p>
        <p class="text-gray-500 text-sm mt-1 mb-6">You can now sign in with your email and password.</p>
        <button class="btn-primary w-full" onclick="navigate('login')">Go to Login</button>
      </div>`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}
