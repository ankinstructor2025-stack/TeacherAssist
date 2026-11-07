const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function screen(file, options = {}) {
  const elements = {};
  const context = {
    document: { getElementById(id) { return elements[id] ||= { hidden: true, textContent: '', addEventListener(type, callback) { this.click = callback; } }; } },
    window: { location: { replace(value) { context.destination = value; } } },
    initializeAuth: async () => ({ auth: { currentUser: options.user }, provider: {} }),
    signInWithPopup: async () => { if (options.popupError) throw Error('popup closed'); return { user: {} }; },
    signOut: async () => { context.signedOut = true; },
    loadSession: async () => { if (options.apiError) throw Object.assign(Error(options.apiErrorMessage || 'API error'), { status: options.apiErrorStatus || 401 }); return { name: '<script>', email: 'teacher@example.com', is_system_administrator: !!options.administrator }; },
    showError(error) { context.error = error.message; },
    onAuthStateChanged(auth, callback) { context.observe = callback; }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8').replace(/^import .*;$/gm, '');
  await vm.runInContext(`(async () => {${source} })()`, context);
  return { context, elements };
}

test('Google login waits for API before navigating', async () => {
  const s = await screen('index.js');
  await s.elements.loginButton.click();
  assert.equal(s.context.destination, './html/home.html');
});
for (const failure of ['popupError', 'apiError']) {
  test(`${failure}: clears session and enables retry`, async () => {
    const s = await screen('index.js', { [failure]: true });
    await s.elements.loginButton.click();
    assert.equal(s.context.destination, undefined);
    assert.equal(s.context.signedOut, true);
    assert.equal(s.elements.loginButton.disabled, false);
    assert.ok(s.context.error);
  });
}
test('home rejects anonymous access', async () => {
  const s = await screen('home.js');
  await s.context.observe(null);
  assert.equal(s.context.destination, '../index.html');
  assert.equal(s.elements.content.hidden, true);
});
test('home displays verified user as text and logs out', async () => {
  const user = {};
  const s = await screen('home.js', { user });
  await s.context.observe(user);
  assert.equal(s.elements.userName.textContent, '<script>');
  assert.equal(s.elements.content.hidden, false);
  await s.elements.logoutButton.click();
  assert.equal(s.context.signedOut, true);
  assert.equal(s.context.destination, '../index.html');
});
test('home hides content when API rejects token', async () => {
  const user = {};
  const s = await screen('home.js', { user, apiError: true });
  await s.context.observe(user);
  assert.equal(s.elements.content.hidden, true);
  assert.equal(s.context.signedOut, true);
});

test('unregistered user sees registration error without entering menu', async () => {
  const message = '利用登録されていません。管理者にお問い合わせください。';
  const s = await screen('index.js', { apiError: true, apiErrorStatus: 403, apiErrorMessage: message });
  await s.elements.loginButton.click();
  assert.equal(s.context.error, message);
  assert.equal(s.context.destination, undefined);
  assert.equal(s.context.signedOut, true);
  assert.equal(s.elements.loginButton.disabled, false);
});
test('administrator login opens system menu', async () => {
  const s = await screen('index.js', { administrator: true });
  await s.elements.loginButton.click();
  assert.equal(s.context.destination, './html/system_menu.html');
});
test('user menu starts with working profile link', () => {
  const html = fs.readFileSync(path.join(__dirname, '../html/home.html'), 'utf8');
  const firstMenuLink = html.match(/<a href="([^"]+)" class="btn btn-primary menu-btn">([^<]+)<\/a>/);
  assert.equal(firstMenuLink[1], 'profile.html');
  assert.equal(firstMenuLink[2], 'プロフィール');
  const profile = fs.readFileSync(path.join(__dirname, '../html/profile.html'), 'utf8');
  assert.match(profile, /id="userName"/);
  assert.match(profile, /id="userEmail"/);
});
