const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function screen(data, options = {}) {
  const elements = {};
  const element = () => ({ hidden: true, value: '', textContent: '', children: [],
    add(value) { this.children.push(value); },
    append(...values) { this.children.push(...values); },
    replaceChildren(...values) { this.children = values; }
  });
  const user = { getIdToken: async () => 'token' };
  const context = {
    document: { getElementById: id => elements[id] ||= element(), createElement: element },
    Option: function(text, value) { this.text = text; this.value = value; },
    URL,
    window: { location: { replace(value) { context.destination = value; } } },
    initializeAuth: async () => ({ auth: { currentUser: user } }),
    onAuthStateChanged(auth, callback) { context.observe = callback; },
    loadSession: async () => ({ is_system_administrator: !!options.administrator }),
    mountSchoolToolbar: () => profile => { context.profile = profile; },
    signOut: async () => { context.signedOut = true; },
    showError: error => { context.error = error.message; },
    API_BASE_URL: '/api',
    fetch: async (url, settings) => {
      context.request = { url, settings };
      return { ok: !options.failure, status: options.failure || 200, json: async () => data };
    }
  };
  vm.createContext(context);
  const renderer = fs.readFileSync(path.join(__dirname, '../js/textbook-list.js'), 'utf8').replace('export function', 'function');
  vm.runInContext(renderer, context);
  const source = fs.readFileSync(path.join(__dirname, '../js/teaching-subjects.js'), 'utf8').replace(/^import .*;$/gm, '');
  await vm.runInContext(`(async () => {${source}})()`, context);
  await context.observe(options.anonymous ? null : user);
  return { context, elements };
}

const data = {
  profile: { prefecture: '東京都', city: '市', school_code: 'school', school_name: '学校' }, covered: true,
  textbooks: [
    { grades: [3, 4], subject: '保健', publisher: '出版社A', school_year: 2026, source_url: 'https://example.org/a' },
    { grades: [5, 6], subject: '保健', publisher: '出版社B', school_year: 2026, source_url: 'https://example.org/b' },
    { grades: [3], subject: '算数', publisher: '<script>', school_year: 2026, source_url: 'https://example.org/c' }
  ]
};

test('uses saved school and filters shared textbooks by grade and subject', async () => {
  const { context, elements } = await screen(data);
  assert.equal(context.profile, data.profile);
  assert.equal(context.request.url, '/api/teaching-subjects');
  assert.equal(context.request.settings.headers.Authorization, 'Bearer token');
  assert.equal(elements.subjectList.children.length, 0);
  assert.equal(elements.textbookResult.hidden, true);
  elements.grade.value = '4';
  elements.grade.onchange();
  assert.equal(elements.subjectList.children.length, 0);
  assert.equal(elements.textbookResult.hidden, true);
  elements.subject.value = '保健';
  elements.subject.onchange();
  assert.equal(elements.subjectList.children.length, 1);
  assert.equal(elements.textbookResult.hidden, false);
  assert.equal(elements.subjectList.children[0].children[0].textContent, '4年');
  assert.equal(elements.subjectList.children[0].children[2].textContent, '出版社A');
  elements.subject.value = '算数';
  elements.subject.onchange();
  assert.equal(elements.subjectList.children.length, 0);
  assert.match(elements.listStatus.textContent, /採択情報はありません/);
  elements.subject.value = '保健';
  elements.subject.onchange();
  elements.grade.value = '';
  elements.grade.onchange();
  assert.equal(elements.subjectList.children.length, 0);
  assert.equal(elements.textbookResult.hidden, true);
});

test('missing adoption information is distinguished from no matching subject', async () => {
  const { elements } = await screen({ ...data, covered: false, textbooks: [] });
  elements.grade.value = '1';
  elements.subject.value = '国語';
  elements.subject.onchange();
  assert.match(elements.listStatus.textContent, /まだ連携されていません/);
});

test('missing profile prompts school registration', async () => {
  const { elements } = await screen({ profile: {}, covered: false, textbooks: [] });
  assert.equal(elements.profileNotice.hidden, false);
  assert.equal(elements.grade.disabled, true);
});

test('anonymous and administrator access follows existing routing', async () => {
  assert.equal((await screen(data, { anonymous: true })).context.destination, '../index.html');
  assert.equal((await screen(data, { administrator: true })).context.destination, 'system_menu.html');
});

test('rejected user sees no school content', async () => {
  const { context, elements } = await screen({ detail: '利用登録されていません。' }, { failure: 403 });
  assert.equal(elements.content.hidden, true);
  assert.equal(context.signedOut, true);
});
