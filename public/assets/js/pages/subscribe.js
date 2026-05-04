let _subPackages = [];
let _selectedPackage = null;
let _stripeInstance = null;
let _stripeCardElement = null;
let _paymentIntentClientSecret = null;
let _paymentOption = 'trial'; // 'trial' | 'pay'

async function renderSubscribe() {
  document.getElementById('app').innerHTML = `
    <div id="pkg-modal-root"></div>
    <div class="min-h-screen flex" style="background:linear-gradient(135deg,#f0f4ff 0%,#fafbff 50%,#f5f0ff 100%)">

      <!-- Left decorative panel (hidden on small screens) -->
      <div class="hidden lg:flex flex-col justify-center w-96 shrink-0 px-12 py-16" style="background:linear-gradient(160deg,#2563eb 0%,#4f46e5 100%)">
        <div class="flex items-center gap-3 mb-12">
          <div class="w-10 h-10 rounded-xl bg-white bg-opacity-20 flex items-center justify-center">
            <i class="fa-solid fa-layer-group text-white text-lg"></i>
          </div>
          <span class="text-white text-xl font-bold">TaskFlow</span>
        </div>
        <h2 class="text-3xl font-bold text-white leading-snug mb-4">Manage your team's work in one place</h2>
        <p class="text-blue-200 text-sm leading-relaxed mb-10">Organise tasks, track progress, and collaborate — all without the chaos.</p>
        <div class="space-y-4">
          ${[
            ['fa-check-circle','Unlimited workflows & stages'],
            ['fa-check-circle','Role-based team access'],
            ['fa-check-circle','Real-time task tracking'],
            ['fa-check-circle','Approval-based onboarding'],
          ].map(([icon, text]) => `
            <div class="flex items-center gap-3 text-sm text-blue-100">
              <i class="fa-solid ${icon} text-blue-300 shrink-0"></i>${text}
            </div>`).join('')}
        </div>
      </div>

      <!-- Form panel -->
      <div class="flex-1 flex flex-col justify-center py-10 px-4 sm:px-8 overflow-y-auto">
        <div class="max-w-xl w-full mx-auto">

          <!-- Mobile logo -->
          <div class="flex items-center gap-3 mb-8 lg:hidden">
            <div class="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <i class="fa-solid fa-layer-group text-white text-sm"></i>
            </div>
            <span class="text-lg font-bold text-gray-900">TaskFlow</span>
          </div>

          <h1 class="text-2xl font-bold text-gray-900 mb-1">Start your subscription</h1>
          <p class="text-gray-500 text-sm mb-8">Submit your request and we'll review and activate your account.</p>

          <form id="subscribe-form" onsubmit="handleSubscribe(event)" novalidate>

            <!-- Section 1: Company -->
            <div class="mb-6">
              <div class="flex items-center gap-2.5 mb-4">
                <div class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</div>
                <span class="text-sm font-semibold text-gray-800">Company Details</span>
              </div>
              <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="sm:col-span-2">
                    <label class="label" for="sub-company-name">Company Name <span class="text-red-400">*</span></label>
                    <input id="sub-company-name" name="company_name" type="text" class="input" placeholder="Acme Corp" required />
                  </div>
                  <div>
                    <label class="label" for="sub-company-email">Company Email <span class="text-red-400">*</span></label>
                    <input id="sub-company-email" name="company_email" type="email" class="input" placeholder="info@company.com" required />
                  </div>
                  <div>
                    <label class="label" for="sub-company-phone">Phone</label>
                    <input id="sub-company-phone" name="company_phone" type="tel" class="input" placeholder="+1 555 000 0000" />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="label" for="sub-company-address">Address</label>
                    <input id="sub-company-address" name="company_address" type="text" class="input" placeholder="123 Main St, City, Country" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Section 2: Plan -->
            <div class="mb-6">
              <div class="flex items-center gap-2.5 mb-4">
                <div class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</div>
                <span class="text-sm font-semibold text-gray-800">Subscription Plan</span>
              </div>
              <input type="hidden" id="sub-package-id" name="package_id" />

              <!-- No package selected state -->
              <div id="pkg-unselected" class="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all" onclick="openPackageModal()">
                <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <i class="fa-solid fa-box-open text-blue-400 text-xl"></i>
                </div>
                <div class="text-center">
                  <div class="text-sm font-semibold text-gray-700">Choose a Plan</div>
                  <div class="text-xs text-gray-400 mt-0.5">Click to browse available packages</div>
                </div>
                <button type="button" class="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  <i class="fa-solid fa-arrow-right text-xs"></i> Browse Plans
                </button>
              </div>

              <!-- Selected package card (hidden until selected) -->
              <div id="pkg-selected" class="hidden bg-white rounded-2xl border-2 border-blue-500 p-5 shadow-sm">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                      <i class="fa-solid fa-box text-blue-600"></i>
                    </div>
                    <div>
                      <div id="pkg-selected-name" class="font-semibold text-gray-900 text-sm"></div>
                      <div id="pkg-selected-desc" class="text-xs text-gray-500 mt-0.5"></div>
                      <div id="pkg-selected-meta" class="text-xs text-gray-400 mt-1"></div>
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div id="pkg-selected-price" class="text-xl font-bold text-blue-600"></div>
                    <div id="pkg-selected-period" class="text-xs text-gray-400"></div>
                    <button type="button" onclick="openPackageModal()" class="mt-2 text-xs text-blue-600 hover:underline font-medium flex items-center gap-1 ml-auto">
                      <i class="fa-solid fa-pen text-xs"></i> Change
                    </button>
                  </div>
                </div>
                <div class="mt-3 pt-3 border-t border-gray-100">
                  <div class="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                    <i class="fa-solid fa-circle-check"></i> Plan selected
                  </div>
                </div>
              </div>

              <!-- Discount token -->
              <div class="mt-3">
                <label class="label" for="sub-discount-token">
                  Discount Token
                  <span class="text-gray-400 font-normal">(optional)</span>
                </label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"><i class="fa-solid fa-tag"></i></span>
                  <input id="sub-discount-token" name="discount_token" type="text" class="input pl-8 uppercase tracking-widest" placeholder="e.g. ABCD1234-EF56" style="text-transform:uppercase" />
                </div>
              </div>
            </div>

            <!-- Section 3: Manager account -->
            <div class="mb-6">
              <div class="flex items-center gap-2.5 mb-4">
                <div class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">3</div>
                <span class="text-sm font-semibold text-gray-800">Your Account</span>
                <span class="text-xs text-gray-400">(you'll be the company manager)</span>
              </div>
              <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="sm:col-span-2">
                    <label class="label" for="sub-manager-name">Full Name <span class="text-red-400">*</span></label>
                    <input id="sub-manager-name" name="manager_name" type="text" class="input" placeholder="Jane Smith" required />
                  </div>
                  <div>
                    <label class="label" for="sub-manager-email">Email Address <span class="text-red-400">*</span></label>
                    <input id="sub-manager-email" name="manager_email" type="email" class="input" placeholder="jane@company.com" required />
                  </div>
                  <div>
                    <label class="label" for="sub-manager-password">Password <span class="text-red-400">*</span></label>
                    <div class="relative">
                      <input id="sub-manager-password" name="manager_password" type="password" class="input pr-9" placeholder="Min. 6 characters" required minlength="6" />
                      <button type="button" onclick="toggleSubPwd()" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <i class="fa-solid fa-eye text-sm" id="sub-pwd-eye"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Section 4: Payment -->
            <div class="mb-6">
              <div class="flex items-center gap-2.5 mb-4">
                <div class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">4</div>
                <span class="text-sm font-semibold text-gray-800">Payment</span>
              </div>

              <!-- Plan options -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <!-- Free Trial -->
                <div id="opt-trial" onclick="selectPaymentOption('trial')"
                     class="cursor-pointer rounded-2xl border-2 border-blue-500 bg-blue-50 p-4 transition-all">
                  <div class="flex items-center gap-2 mb-1.5">
                    <span class="w-4 h-4 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0">
                      <span class="w-2 h-2 rounded-full bg-blue-600 block" id="trial-dot"></span>
                    </span>
                    <span class="text-sm font-semibold text-gray-900">Free Trial</span>
                  </div>
                  <div class="text-xs text-gray-500 mb-2">30 days free, no credit card required</div>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                    <i class="fa-solid fa-gift text-xs"></i> 30 Days Free
                  </span>
                </div>
                <!-- Pay Now -->
                <div id="opt-pay" onclick="selectPaymentOption('pay')"
                     class="cursor-pointer rounded-2xl border-2 border-gray-200 hover:border-gray-300 bg-white p-4 transition-all">
                  <div class="flex items-center gap-2 mb-1.5">
                    <span class="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0">
                      <span class="w-2 h-2 rounded-full bg-gray-300 hidden block" id="pay-dot"></span>
                    </span>
                    <span class="text-sm font-semibold text-gray-900">Pay Now</span>
                  </div>
                  <div class="text-xs text-gray-500 mb-2">Secure card payment via Stripe</div>
                  <span class="flex items-center gap-1 text-xs text-gray-400">
                    <i class="fa-brands fa-stripe text-indigo-500"></i> Secured by Stripe
                  </span>
                </div>
              </div>

              <!-- Trial info box -->
              <div id="trial-info-box" class="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <i class="fa-solid fa-circle-info text-blue-400 mt-0.5 shrink-0"></i>
                <div>
                  <div class="text-sm font-semibold text-blue-800 mb-0.5">30-Day Free Trial</div>
                  <div class="text-xs text-blue-600 leading-relaxed">Full access for 30 days — no credit card required. After your trial the admin will be in touch to continue your subscription.</div>
                </div>
              </div>

              <!-- Card form (shown when Pay Now is selected) -->
              <div id="payment-form-wrap" class="hidden bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div class="flex items-center justify-between">
                  <div id="payment-amount-display" class="text-sm text-gray-600"></div>
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <i class="fa-brands fa-stripe text-indigo-500 text-base"></i>
                    Secured by Stripe
                  </div>
                </div>
                <div>
                  <label class="label">Card Details</label>
                  <div id="stripe-card-element" class="input py-2.5" style="min-height:42px"></div>
                  <div id="stripe-card-errors" class="mt-1.5 text-xs text-red-500 hidden"></div>
                </div>
                <div id="payment-success-badge" class="hidden flex items-center gap-2 text-sm text-green-600 font-medium">
                  <i class="fa-solid fa-circle-check"></i> Payment confirmed — ready to submit
                </div>
              </div>
            </div>

            <div id="sub-error" class="hidden mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl flex items-start gap-2">
              <i class="fa-solid fa-circle-exclamation mt-0.5 shrink-0"></i>
              <span id="sub-error-text"></span>
            </div>
            <div id="sub-success" class="hidden mb-4 p-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl flex items-start gap-2">
              <i class="fa-solid fa-circle-check mt-0.5 shrink-0 text-green-500"></i>
              <span id="sub-success-text"></span>
            </div>

            <button id="sub-btn" type="submit" class="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 shadow-sm shadow-blue-200">
              <i class="fa-solid fa-paper-plane"></i> Submit Subscription Request
            </button>
          </form>

          <p class="text-center text-sm text-gray-500 mt-6">
            Already have an account?
            <button onclick="navigate('login')" class="text-blue-600 hover:underline font-medium">Sign in</button>
          </p>
        </div>
      </div>

    </div>`;

  await loadSubPackages();
}

async function loadSubPackages() {
  try {
    _subPackages = await api.subscribe.getPackages();
  } catch (err) {
    showToast('Could not load packages. Please refresh.', 'error');
  }
}

function openPackageModal() {
  if (!_subPackages.length) {
    showToast('Packages are still loading, please wait.', 'info');
    return;
  }

  // Group by type for display
  const monthly  = _subPackages.filter(p => p.type === 'monthly');
  const yearly   = _subPackages.filter(p => p.type === 'yearly');
  const all      = monthly.length ? monthly : _subPackages;

  const renderCards = (list) => list.map(p => {
    const isSelected = _selectedPackage && _selectedPackage.id == p.id;
    return `
      <div onclick="pickPackage(${p.id})" class="pkg-option relative cursor-pointer rounded-xl border-2 p-4 transition-all hover:shadow-md ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'}">
        ${isSelected ? '<div class="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><i class="fa-solid fa-check text-white text-xs"></i></div>' : ''}
        <div class="font-semibold text-gray-900 text-sm mb-0.5 pr-6">${p.name}</div>
        <div class="text-xs text-gray-500 mb-3">${p.description || ''}</div>
        <div class="flex items-end justify-between">
          <div class="text-xs text-gray-400">Up to <strong class="text-gray-600">${p.max_users >= 999 ? 'unlimited' : p.max_users}</strong> users</div>
          <div class="text-right">
            <span class="text-2xl font-bold text-blue-600">$${parseFloat(p.price).toFixed(0)}</span>
            <span class="text-xs text-gray-400">/${p.type === 'monthly' ? 'mo' : 'yr'}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  const hasBothTypes = monthly.length > 0 && yearly.length > 0;

  document.getElementById('pkg-modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" onclick="if(event.target===this)closePkgModal()">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 class="text-lg font-bold text-gray-900">Choose a Plan</h3>
            <p class="text-xs text-gray-500 mt-0.5">Select the plan that best fits your team</p>
          </div>
          <button onclick="closePkgModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        ${hasBothTypes ? `
        <div class="px-6 pt-4 flex gap-2">
          <button id="tab-monthly" onclick="switchPkgTab('monthly')" class="px-4 py-1.5 rounded-full text-sm font-medium bg-blue-600 text-white transition-colors">Monthly</button>
          <button id="tab-yearly" onclick="switchPkgTab('yearly')" class="px-4 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
            Yearly <span class="ml-1 text-xs text-green-600 font-semibold">Save ~17%</span>
          </button>
        </div>` : ''}

        <div class="overflow-y-auto flex-1 p-6">
          <div id="pkg-cards-monthly" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${renderCards(monthly.length ? monthly : _subPackages)}
          </div>
          <div id="pkg-cards-yearly" class="${hasBothTypes ? 'hidden' : ''} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${renderCards(yearly)}
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p class="text-xs text-gray-400">All plans can be changed later by the admin.</p>
          <button onclick="closePkgModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
        </div>
      </div>
    </div>`;
}

function switchPkgTab(type) {
  const monthly = document.getElementById('pkg-cards-monthly');
  const yearly  = document.getElementById('pkg-cards-yearly');
  const tM = document.getElementById('tab-monthly');
  const tY = document.getElementById('tab-yearly');
  if (type === 'monthly') {
    monthly.classList.remove('hidden'); yearly.classList.add('hidden');
    tM.className = 'px-4 py-1.5 rounded-full text-sm font-medium bg-blue-600 text-white transition-colors';
    tY.className = 'px-4 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors';
  } else {
    yearly.classList.remove('hidden'); monthly.classList.add('hidden');
    tY.className = 'px-4 py-1.5 rounded-full text-sm font-medium bg-blue-600 text-white transition-colors';
    tM.className = 'px-4 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors';
  }
}

function pickPackage(id) {
  _selectedPackage = _subPackages.find(p => p.id == id);
  if (!_selectedPackage) return;
  document.getElementById('sub-package-id').value = id;

  document.getElementById('pkg-unselected').classList.add('hidden');
  const sel = document.getElementById('pkg-selected');
  sel.classList.remove('hidden');
  document.getElementById('pkg-selected-name').textContent = _selectedPackage.name;
  document.getElementById('pkg-selected-desc').textContent = _selectedPackage.description || '';
  document.getElementById('pkg-selected-meta').textContent = `Up to ${_selectedPackage.max_users >= 999 ? 'unlimited' : _selectedPackage.max_users} users`;
  document.getElementById('pkg-selected-price').textContent = '$' + parseFloat(_selectedPackage.price).toFixed(2);
  document.getElementById('pkg-selected-period').textContent = '/ ' + _selectedPackage.type;

  closePkgModal();
  // Re-apply current payment option in case Pay Now is active
  if (_paymentOption === 'pay') initStripePayment();
}

function selectPaymentOption(option) {
  _paymentOption = option;

  const isTrial = option === 'trial';
  const trialCls = 'cursor-pointer rounded-2xl border-2 p-4 transition-all border-blue-500 bg-blue-50';
  const inactCls = 'cursor-pointer rounded-2xl border-2 p-4 transition-all border-gray-200 hover:border-gray-300 bg-white';

  document.getElementById('opt-trial').className = isTrial ? trialCls : inactCls;
  document.getElementById('opt-pay').className   = isTrial ? inactCls : trialCls;

  const trialDot = document.getElementById('trial-dot');
  const payDot   = document.getElementById('pay-dot');
  if (trialDot) { trialDot.className = isTrial ? 'w-2 h-2 rounded-full bg-blue-600 block' : 'w-2 h-2 rounded-full bg-gray-300 hidden block'; }
  if (payDot)   { payDot.className   = isTrial ? 'w-2 h-2 rounded-full bg-gray-300 hidden block' : 'w-2 h-2 rounded-full bg-blue-600 block'; }

  document.getElementById('trial-info-box').classList.toggle('hidden', !isTrial);
  document.getElementById('payment-form-wrap').classList.toggle('hidden', isTrial);

  if (!isTrial && _selectedPackage) initStripePayment();

  const btn = document.getElementById('sub-btn');
  if (btn) btn.innerHTML = isTrial
    ? '<i class="fa-solid fa-paper-plane"></i> Submit Subscription Request'
    : '<i class="fa-solid fa-credit-card"></i> Pay &amp; Submit Request';
}

async function initStripePayment() {
  _paymentIntentClientSecret = null;
  if (_stripeCardElement) { try { _stripeCardElement.unmount(); } catch {} _stripeCardElement = null; }

  const amountEl = document.getElementById('payment-amount-display');
  if (!amountEl) return;
  amountEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Calculating amount…';

  try {
    const discount = document.getElementById('sub-discount-token')?.value?.trim() || '';
    const intent   = await api.subscribe.createPaymentIntent({ package_id: _selectedPackage.id, discount_token: discount || undefined });
    _paymentIntentClientSecret = intent.client_secret;

    const disc = discount ? '<span class="text-green-600 ml-1 text-xs">(discount applied if valid)</span>' : '';
    amountEl.innerHTML = `Amount due: <strong class="text-gray-900">$${parseFloat(intent.amount).toFixed(2)}</strong>${disc}`;

    if (!window.Stripe) {
      amountEl.innerHTML += ' <span class="text-amber-600 text-xs ml-2"><i class="fa-solid fa-triangle-exclamation"></i> Stripe not configured — payment will be skipped</span>';
      return;
    }
    _stripeInstance = Stripe(intent.publishable_key);
    _stripeCardElement = _stripeInstance.elements().create('card', {
      style: { base: { fontSize: '14px', color: '#374151', '::placeholder': { color: '#9CA3AF' } } },
    });
    _stripeCardElement.mount('#stripe-card-element');
    _stripeCardElement.on('change', (ev) => {
      const errEl = document.getElementById('stripe-card-errors');
      if (ev.error) { errEl.textContent = ev.error.message; errEl.classList.remove('hidden'); }
      else { errEl.classList.add('hidden'); }
    });
    document.getElementById('payment-success-badge')?.classList.add('hidden');
  } catch (err) {
    amountEl.innerHTML = `<span class="text-amber-600 text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${err.message} — payment will be skipped</span>`;
  }
}

function closePkgModal() {
  document.getElementById('pkg-modal-root').innerHTML = '';
}

function toggleSubPwd() {
  const input = document.getElementById('sub-manager-password');
  const eye   = document.getElementById('sub-pwd-eye');
  if (input.type === 'password') { input.type = 'text'; eye.className = 'fa-solid fa-eye-slash text-sm'; }
  else { input.type = 'password'; eye.className = 'fa-solid fa-eye text-sm'; }
}

async function handleSubscribe(e) {
  e.preventDefault();
  const btn     = document.getElementById('sub-btn');
  const errEl   = document.getElementById('sub-error');
  const errText = document.getElementById('sub-error-text');
  const sucEl   = document.getElementById('sub-success');
  const sucText = document.getElementById('sub-success-text');

  errEl.classList.add('hidden');
  sucEl.classList.add('hidden');

  if (!document.getElementById('sub-package-id').value) {
    errText.textContent = 'Please select a subscription plan before submitting.';
    errEl.classList.remove('hidden');
    document.getElementById('pkg-unselected').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (!data.discount_token) delete data.discount_token;

  btn.disabled = true;

  // ── Free Trial path ───────────────────────────────────────────────────────
  if (_paymentOption === 'trial') {
    data.is_trial = '1';
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…';
    try {
      const result = await api.subscribe.submit(data);
      _onSubmitSuccess(e.target, btn, sucText, sucEl);
      sucText.textContent = result.message || 'Trial request submitted! We will review and activate your 30-day free trial.';
    } catch (err) {
      _onSubmitError(btn, errText, errEl);
      errText.textContent = err.message || 'Failed to submit. Please try again.';
    }
    return;
  }

  // ── Pay Now path ──────────────────────────────────────────────────────────
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing payment…';

  // If Stripe is configured and card element is ready, confirm payment
  if (_paymentIntentClientSecret && _stripeInstance && _stripeCardElement) {
    const { error, paymentIntent } = await _stripeInstance.confirmCardPayment(_paymentIntentClientSecret, {
      payment_method: { card: _stripeCardElement },
    });
    if (error) {
      errText.textContent = error.message || 'Payment failed. Please check your card details.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-credit-card"></i> Pay &amp; Submit Request';
      return;
    }
    document.getElementById('payment-success-badge')?.classList.remove('hidden');
    data.payment_intent_id = paymentIntent.id;
  }
  // If Stripe not configured, submit without payment_intent_id (pending status)

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…';
  try {
    const result = await api.subscribe.submit(data);
    _onSubmitSuccess(e.target, btn, sucText, sucEl);
    sucText.textContent = result.message || 'Request submitted! You will receive an email once your request is reviewed.';
  } catch (err) {
    _onSubmitError(btn, errText, errEl);
    errText.textContent = err.message || 'Failed to submit. Please try again.';
  }
}

function _onSubmitSuccess(form, btn, sucText, sucEl) {
  form.reset();
  _selectedPackage = null;
  _paymentIntentClientSecret = null;
  _paymentOption = 'trial';
  document.getElementById('sub-package-id').value = '';
  document.getElementById('pkg-selected').classList.add('hidden');
  document.getElementById('pkg-unselected').classList.remove('hidden');
  if (_stripeCardElement) { try { _stripeCardElement.unmount(); } catch {} _stripeCardElement = null; }
  // Reset section 4 back to trial
  selectPaymentOption('trial');
  btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Request Submitted';
  sucEl.classList.remove('hidden');
  sucEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function _onSubmitError(btn, errText, errEl) {
  btn.disabled = false;
  btn.innerHTML = _paymentOption === 'trial'
    ? '<i class="fa-solid fa-paper-plane"></i> Submit Subscription Request'
    : '<i class="fa-solid fa-credit-card"></i> Pay &amp; Submit Request';
  errEl.classList.remove('hidden');
}
