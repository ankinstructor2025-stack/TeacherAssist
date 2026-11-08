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
    window: { confirm: () => options.confirm !== false, location: { search: options.search || '', replace(value) { context.destination = value; }, reload() { context.reloaded = true; } } },
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
  for (const id of ['hours', 'objectives', 'activities', 'assessment', 'notes']) context.document.getElementById(id);
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
  assert.deepEqual(cells[3].children.map(button => button.textContent), ['修正', '削除', '指導案']);
  assert.equal(cells[3].children[2].href, 'lesson_plans.html?assignment=one');
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

test('assignment delete confirms and refreshes list only after successful save', async () => {
  const cancelled = await screen('teaching-subjects.js', data, { confirm: false });
  await cancelled.elements.subjectList.children[0].children[3].children[1].onclick();
  assert.equal(cancelled.context.requests.some(request => request.settings.method === 'DELETE'), false);
  const active = await screen('teaching-subjects.js', data);
  await active.elements.subjectList.children[0].children[3].children[1].onclick();
  assert.equal(active.context.requests.find(request => request.settings.method === 'DELETE').url, '/api/teaching-assignments/one');
  assert.equal(active.context.reloaded, true);
});

const lessonData = {
  profile: data.profile,
  assignment: { id: 'one', grade: 5, subject: '国語', textbook: '光村図書' },
  plans: [],
  contents: [{ title: '国語五 銀河', source_url: 'https://example.org/contents', source_label: '出版社の教材一覧', units: ['銀色の裏地', '大造じいさんとガン'] }]
};

test('lesson list links to a separate creation and edit screen', async () => {
  const plan = { id: 'plan', title: '指導案', unit: '銀色の裏地', hours: 2 };
  const { elements, buttons } = await screen('lesson-plans.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one' });
  assert.equal(buttons[0].href, 'lesson_plan_edit.html?assignment=one');
  const cells = elements.lessonPlanList.children[0].children;
  assert.deepEqual(cells.slice(0, 3).map(cell => cell.textContent), ['指導案', '銀色の裏地', '2時間']);
  assert.equal(cells[3].children[0].href, 'lesson_plan_edit.html?assignment=one&id=plan');
});

test('lesson editor chooses unit from publisher contents and saves a lesson plan', async () => {
  const { context, elements } = await screen('lesson-plan-edit.js', lessonData, { search: '?assignment=one' });
  elements.contentsList.children[2].children[0].onclick();
  assert.equal(elements.planTitle.value, '銀色の裏地');
  assert.match(elements.unit.value, /銀色の裏地/);
  elements.hours.value = '1';
  elements.objectives.value = '人物の心情を読み取る';
  await elements.lessonPlanForm.onsubmit({ preventDefault() {} });
  const save = context.requests.find(request => request.settings.method === 'POST');
  assert.equal(save.url, '/api/teaching-assignments/one/lesson-plans');
  assert.equal(JSON.parse(save.settings.body).grade, 5);
  assert.equal(JSON.parse(save.settings.body).objectives, '人物の心情を読み取る');
  assert.equal(context.destination, 'lesson_plans.html?assignment=one');
});

test('lesson editor restores existing plan and keeps draft on save failure', async () => {
  const plan = { id: 'plan', title: '保存済み', unit: '単元', hours: 1, objectives: '目標', activities: '展開', assessment: '評価', notes: '準備' };
  const { context, elements, buttons } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one&id=plan', saveFailure: 500 });
  assert.equal(elements.activities.value, '展開');
  await elements.lessonPlanForm.onsubmit({ preventDefault() {} });
  assert.equal(context.requests.find(request => request.settings.method === 'PUT').url, '/api/teaching-assignments/one/lesson-plans/plan');
  assert.equal(context.destination, undefined);
  assert.equal(elements.activities.value, '展開');
  assert.equal(buttons[0].disabled, false);
});

test('unsupported contents allow manual lesson unit entry without invented chapters', async () => {
  const { elements, buttons } = await screen('lesson-plan-edit.js', { ...lessonData, contents: [] }, { search: '?assignment=one' });
  assert.equal(elements.contentsList.children.length, 0);
  assert.match(elements.contentsStatus.textContent, /未対応/);
  assert.equal(buttons[0].disabled, false);
});
