const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function screen(file, data, options = {}) {
  const elements = {};
  const buttons = [];
  const element = () => ({ hidden: true, value: '', textContent: '', children: [],
    setAttribute(key, value) { this[key] = value; },
    add(value) { this.children.push(value); }, append(...values) { this.children.push(...values); },
    replaceChildren(...values) { this.children = values; }, reportValidity: () => true
  });
  const user = { getIdToken: async () => 'token' };
  const context = {
    document: { getElementById: id => elements[id] ||= element(), createElement: element },
    Option: function(text, value) { this.text = text; this.value = value; }, URLSearchParams,
    window: { location: { search: options.search || '', replace(value) { context.destination = value; } } },
    initializeAuth: async () => ({ auth: { currentUser: user } }),
    signOut: async () => { context.signedOut = true; },
    onAuthStateChanged(auth, callback) { context.observe = callback; },
    loadSession: async () => ({ is_system_administrator: !!options.administrator }),
    mountSchoolToolbar: (title, toolbar) => { buttons.push(...toolbar.buttons); return profile => { context.profile = profile; }; },
    showError: error => { context.error = error.message; }, API_BASE_URL: '/api',
    fetch: async (url, settings) => {
      context.requests ||= [];
      context.requests.push({ url, settings });
      const failure = settings.method ? options.saveFailure : url.endsWith('/profile') ? options.profileFailure : options.failure;
      return { ok: !failure, status: failure || 200, json: async () => failure ? { detail: '保存できません。' } : data };
    }
  };
  vm.createContext(context);
  const shared = fs.readFileSync(path.join(__dirname, '../js/teaching-page.js'), 'utf8').replace(/^import .*;$/gm, '').replace('export async function', 'async function');
  vm.runInContext(shared, context);
  const source = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8').replace(/^import .*;$/gm, '');
  await vm.runInContext(`(async () => {${source}})()`, context);
  await context.observe(options.anonymous ? null : user);
  return { context, elements, buttons };
}
const data = {
  profile: { school_code: 'school', prefecture: '県', city: '市', school_name: '学校' }, covered: true,
  assignments: [{ id: 'one', grade: 4, subject: '国語', textbook: '光村図書' }],
  textbooks: [{ grades: [1, 2, 3, 4, 5, 6], subject: '国語', publisher: '光村図書' }]
};
test('list displays saved grade, subject, textbook and edit link', async () => {
  const { elements, buttons } = await screen('teaching-subjects.js', data);
  const cells = elements.subjectList.children[0].children;
  assert.deepEqual(cells.slice(0, 3).map(cell => cell.textContent), ['4年', '国語', '光村図書']);
  assert.equal(cells[3].children[0].href, 'teaching_subject_edit.html?id=one');
  assert.equal(buttons[0].href, 'teaching_subject_edit.html');
  assert.equal(buttons[0].hidden, false);
});
test('empty list prompts new registration', async () => {
  const { elements } = await screen('teaching-subjects.js', { ...data, assignments: [] });
  assert.equal(elements.subjectList.children.length, 0);
  assert.match(elements.listStatus.textContent, /新規登録/);
});
test('editor displays textbook after both choices and saves then returns to list', async () => {
  const { context, elements, buttons } = await screen('teaching-subject-edit.js', data);
  assert.equal(buttons[0].disabled, true);
  elements.grade.value = '1';
  elements.grade.onchange();
  assert.equal(buttons[0].disabled, true);
  elements.subject.value = '国語';
  elements.subject.onchange();
  assert.equal(elements.textbook.textContent, '光村図書');
  assert.equal(buttons[0].disabled, false);
  await elements.assignmentForm.onsubmit({ preventDefault() {} });
  const save = context.requests.find(request => request.settings.method === 'POST');
  assert.equal(save.url, '/api/teaching-assignments');
  assert.equal(save.settings.method, 'POST');
  assert.deepEqual(JSON.parse(save.settings.body), { grade: 1, subject: '国語' });
  assert.equal(context.destination, 'teaching_subjects.html');
});
test('existing assignment restores fields and updates original ID', async () => {
  const { context, elements } = await screen('teaching-subject-edit.js', data, { search: '?id=one' });
  assert.equal(elements.grade.value, '4');
  assert.equal(elements.subject.value, '国語');
  await elements.assignmentForm.onsubmit({ preventDefault() {} });
  const save = context.requests.find(request => request.settings.method === 'PUT');
  assert.equal(save.url, '/api/teaching-assignments/one');
  assert.equal(save.settings.method, 'PUT');
});
test('save failure keeps editor open for retry', async () => {
  const { context, elements, buttons } = await screen('teaching-subject-edit.js', data, { search: '?id=one', saveFailure: 409 });
  await elements.assignmentForm.onsubmit({ preventDefault() {} });
  assert.equal(context.destination, undefined);
  assert.ok(context.error);
  assert.equal(buttons[0].disabled, false);
});
test('unsupported grade and subject cannot be saved', async () => {
  const { elements, buttons } = await screen('teaching-subject-edit.js', data);
  elements.grade.value = '1'; elements.subject.value = '理科'; elements.subject.onchange();
  assert.equal(buttons[0].disabled, true);
  assert.match(elements.textbook.textContent, /ありません/);
});
test('missing registration hides add and redirects to profile via notice', async () => {
  const { elements, buttons } = await screen('teaching-subjects.js', { ...data, profile: {}, assignments: [] });
  assert.equal(elements.profileNotice.hidden, false);
  assert.equal(buttons[0].hidden, true);
});
test('anonymous, administrator and rejected access keep existing routing', async () => {
  assert.equal((await screen('teaching-subjects.js', data, { anonymous: true })).context.destination, '../index.html');
  assert.equal((await screen('teaching-subjects.js', data, { administrator: true })).context.destination, 'system_menu.html');
  const rejected = await screen('teaching-subjects.js', data, { failure: 403 });
  assert.equal(rejected.elements.content.hidden, true);
  assert.equal(rejected.context.signedOut, true);
});

test('assignment API failure preserves saved school in toolbar', async () => {
  const { context, elements } = await screen('teaching-subjects.js', data, { failure: 404 });
  assert.equal(context.profile, data.profile);
  assert.equal(elements.content.hidden, true);
  assert.match(context.error, /公開更新/);
  assert.equal(context.requests[0].url, '/api/profile');
});
