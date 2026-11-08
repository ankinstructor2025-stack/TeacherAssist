const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function screen({ saved = false, saveFails = false, listFails = false } = {}) {
  const elements = {};
  const profile = { prefecture: '栃木県', city: '小山市', school_code: 'school', school_name: '小学校' };
  const user = { getIdToken: async () => 'token' };
  const node = () => ({ hidden: true, value: '', children: [], textContent: '',
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    add(child) { this.children.push(child); }, reportValidity: () => true
  });
  const context = {
    document: { getElementById: id => elements[id] ||= node(), createElement: node },
    Option: function(text, value) { this.text = text; this.value = value; }, URL,
    initializeAuth: async () => ({ auth: { currentUser: user } }),
    onAuthStateChanged(auth, callback) { context.observe = callback; },
    signOut: async () => {}, window: { location: { replace() {} } },
    loadSession: async () => ({ name: '先生', email: 'teacher@example.com' }),
    mountSchoolToolbar: () => value => { context.toolbar = value; },
    showError: error => { context.error = error.message; }, API_BASE_URL: '/api',
    fetch: async (url, settings) => {
      let data;
      let ok = true;
      if (url === '/api/profile') {
        ok = !(settings.method === 'PUT' && saveFails);
        data = { profile: saved || settings.method === 'PUT' ? profile : {} };
      } else if (url === '/api/profile/ai') {
        data = { models: [], settings: { model_id: '', has_api_key: false } };
      } else if (url === '/api/teaching-subjects') {
        ok = !listFails;
        data = { profile, covered: true, textbooks: [{ grades: [1, 2, 3, 4, 5, 6], subject: '国語', publisher: '光村図書', school_year: 2026, source_url: 'https://example.org/source' }] };
      } else if (url.includes('&city=')) data = { schools: [{ code: 'school', name: '小学校' }] };
      else if (url.includes('?prefecture=')) data = { cities: ['小山市'] };
      else data = { prefectures: ['栃木県'] };
      return { ok, status: ok ? 200 : 500, json: async () => data };
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/profile-ai.js'), 'utf8').replace(/^export /gm, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/textbook-list.js'), 'utf8').replace('export function', 'function'), context);
  const source = fs.readFileSync(path.join(__dirname, '../js/profile.js'), 'utf8').replace(/^import .*;$/gm, '');
  await vm.runInContext(`(async () => {${source}})()`, context);
  await context.observe(user);
  return { context, elements };
}

test('saving school shows its adoption list below the profile', async () => {
  const { elements } = await screen();
  assert.equal(elements.profileTextbooks.hidden, true);
  elements.school.value = 'school';
  await elements.profileForm.onsubmit({ preventDefault() {} });
  assert.equal(elements.profileTextbooks.hidden, false);
  assert.equal(elements.profileTextbookList.children.length, 1);
  assert.match(elements.profileTextbooksSchool.textContent, /小学校/);
  assert.equal(elements.profileTextbookList.children[0].children[2].textContent, '光村図書');
});

test('saved profile restores the list on next visit', async () => {
  const { elements } = await screen({ saved: true });
  assert.equal(elements.profileTextbooks.hidden, false);
  assert.equal(elements.profileTextbookList.children.length, 1);
});

test('failed registration does not display an unsaved school list', async () => {
  const { context, elements } = await screen({ saveFails: true });
  elements.school.value = 'school';
  await elements.profileForm.onsubmit({ preventDefault() {} });
  assert.equal(elements.profileTextbooks.hidden, true);
  assert.ok(context.error);
});

test('adoption lookup failure preserves successful school registration', async () => {
  const { elements } = await screen({ listFails: true });
  elements.school.value = 'school';
  await elements.profileForm.onsubmit({ preventDefault() {} });
  assert.equal(elements.status.textContent, 'プロフィールを登録しました。');
  assert.match(elements.profileTextbooksStatus.textContent, /学校は登録済み/);
  assert.equal(elements.saveProfileButton.disabled, false);
});
