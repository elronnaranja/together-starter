// Settings tab and first-run setup: household settings (saved in the shared budget), own password, and who has access.
let account = null, settingsShown = false, resetArmed = false;

function setMsg(el, text, ok) {
  el.textContent = text;
  el.classList.toggle('hidden', !text);
  el.classList.toggle('ok', !!ok);
  el.classList.toggle('err', !ok);
}

async function accountCall(path, body) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

async function loadAccount() {
  try { account = await accountCall('/api/account'); } catch { account = null; }
  renderAccount();
}

function renderAccount() {
  $('account-name').textContent = account ? account.name : personName(canWrite ? 'owner' : 'viewer');
  const owner = !!account && account.role === 'owner' && account.people.length > 0;
  $('access-card').classList.toggle('hidden', !owner);
  if (!owner) return;
  $('access-list').innerHTML = account.people.map(p => {
    const status = p.role === 'owner' ? 'You' : p.hasPassword ? 'Password set' : p.linkPending ? 'Waiting for them to use the link' : 'No password yet';
    const action = p.role === 'viewer'
      ? `<button class="btn ${resetArmed ? 'danger' : 'secondary'}" type="button" id="reset-viewer">${resetArmed ? 'Yes, reset it' : 'Reset password'}</button>`
      : '';
    return `<div class="access-row"><div><b>${esc(p.name)}</b><span class="small muted">${esc(p.access)} · ${esc(status)}</span></div>${action}</div>`;
  }).join('') + (resetArmed ? '<p class="small muted">Their current password stops working right away. You get a new link to send them.</p>' : '');
}

const personName = role => role === 'owner' ? (hs().ownerName || 'Owner') : (hs().partnerName || 'Second person');
const initial = name => (String(name || '').trim()[0] || '·').toUpperCase();
const FIELDS = ['household', 'owner', 'partner', 'currency', 'zone', 'balance', 'date', 'rate'];

function fillHousehold(prefix) {
  const s = hs(), v = {household: s.householdName || '', owner: s.ownerName || '', partner: s.partnerName || '', currency: s.currency || '₱', zone: s.timeZone || browserZone, balance: s.openingBalance ?? '', date: s.openingDate || today(), rate: Number(s.hourlyRate) > 0 ? s.hourlyRate : ''};
  for (const f of FIELDS) if ($(prefix + f)) $(prefix + f).value = v[f];
}

// Reads one of the two household forms. Returns the new settings, or an error message.
function readHousehold(prefix) {
  const val = f => $(prefix + f) ? $(prefix + f).value.trim() : '';
  const out = {...hs(), setupDone: true, householdName: val('household'), ownerName: val('owner'), partnerName: val('partner'), currency: val('currency'), timeZone: val('zone'), openingBalance: Math.round(Number(val('balance')) * 100) / 100, openingDate: val('date')};
  if ($(prefix + 'rate')) { const r = val('rate'); if (r === '' || Number(r) === 0) delete out.hourlyRate; else out.hourlyRate = Math.round(Number(r) * 100) / 100; }
  if (!out.householdName || !out.ownerName) return 'Add a household name and your name.';
  if (!out.currency) return 'Add a currency symbol, for example ₱, $ or €.';
  try { new Intl.DateTimeFormat('en-CA', {timeZone: out.timeZone}); } catch { return 'Use a time zone like Asia/Manila or America/New_York.'; }
  if (val('balance') === '' || !Number.isFinite(out.openingBalance) || Math.abs(out.openingBalance) > 1e8) return 'Enter the cash you have today (0 is fine).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.openingDate)) return 'Pick the date of that balance.';
  if (out.hourlyRate !== undefined && !(out.hourlyRate > 0 && out.hourlyRate <= 1e6)) return 'Leave the hourly rate blank or enter an amount above zero.';
  return out;
}

function renderNames() {
  const s = hs(), house = s.householdName || 'Our household';
  $('household-label').textContent = house;
  $('household-eyebrow').textContent = house;
  $('avatar-owner').textContent = initial(s.ownerName);
  $('avatar-partner').textContent = initial(s.partnerName);
  $('avatar-partner').classList.toggle('hidden', !s.partnerName);
  document.querySelectorAll('.partner-name').forEach(x => { x.textContent = s.partnerName || 'the second person'; });
  document.querySelectorAll('.rate-text').forEach(x => { x.textContent = rateText(); });
  document.querySelectorAll('.rate-only').forEach(x => x.classList.toggle('hidden', !rateText()));
}

// First run: the owner must fill in the household before using the budget.
function renderSetup() {
  const need = sharedReady && canWrite && !setupDone(), d = $('setup-dialog');
  if (need && !d.open) { fillHousehold('su-'); d.showModal(); }
  if (!need && d.open) d.close();
}

function renderSettings() {
  renderNames();
  renderSetup();
  const on = page === 'settings';
  $('settings-page').classList.toggle('hidden', !on);
  document.querySelector('header .actions').classList.toggle('hidden', on);
  if (!on) { settingsShown = false; resetArmed = false; return; }
  if (settingsShown) return;
  settingsShown = true;
  fillHousehold('hh-');
  for (const f of FIELDS) $('hh-' + f).disabled = !canWrite;
  $('save-household').classList.toggle('hidden', !canWrite);
  $('household-locked').classList.toggle('hidden', canWrite);
  renderAccount();
  loadAccount();
}

const renderBeforeSettings = render;
render = function () { renderBeforeSettings(); renderSettings(); };

$('setup-dialog').addEventListener('cancel', e => { if (!setupDone()) e.preventDefault(); });
$('setup-form').onsubmit = async e => {
  e.preventDefault();
  if (!canWrite) return;
  const next = readHousehold('su-');
  if (typeof next === 'string') return setMsg($('su-msg'), next, false);
  setMsg($('su-msg'), '', true);
  model.settings = next;
  model.goal.date = presetDate(model.goal.preset);
  if (await save()) { $('setup-dialog').close(); notify('Your budget is ready. Add your first bill under Expenses.'); }
  else { model.settings = {...next, setupDone: false}; setMsg($('su-msg'), 'Could not save yet. Check your connection and try again.', false); }
};

$('household-form').onsubmit = e => {
  e.preventDefault();
  if (!canWrite) return;
  const next = readHousehold('hh-');
  if (typeof next === 'string') { notify(next); return; }
  model.settings = next;
  save();
  notify('Household saved.');
};

$('password-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('pw-msg'), next = $('pw-new').value;
  if (next.length < 12) return setMsg(msg, 'Use a new password of at least 12 characters.', false);
  if (next !== $('pw-confirm').value) return setMsg(msg, 'The new passwords do not match.', false);
  $('save-password').disabled = true;
  try {
    await accountCall('/api/account/password', {current: $('pw-current').value, next});
    $('password-form').reset();
    setMsg(msg, 'Password changed. Your other devices are signed out.', true);
  } catch (error) {
    setMsg(msg, error.message, false);
  } finally {
    $('save-password').disabled = false;
  }
};

document.addEventListener('click', async e => {
  if (e.target.closest('#copy-link')) {
    try { await navigator.clipboard.writeText($('reset-link').value); notify('Link copied.'); }
    catch { $('reset-link').select(); notify('Select the link and copy it.'); }
    return;
  }
  if (!e.target.closest('#reset-viewer')) return;
  if (!resetArmed) { resetArmed = true; renderAccount(); return; }
  resetArmed = false;
  try {
    const {link} = await accountCall('/api/account/reset', {role: 'viewer'});
    $('reset-link').value = link;
    $('reset-result').classList.remove('hidden');
    notify(personName('viewer') + '’s password was reset. Send them the new link.');
  } catch (error) {
    notify(error.message);
  }
  loadAccount();
});

// Signing out removes this budget's copies from the browser.
document.querySelector('form[action="/logout"]').addEventListener('submit', () => {
  try { localStorage.removeItem('together-shared-cache'); localStorage.removeItem('together-pending-save'); sessionStorage.clear(); } catch {}
});
