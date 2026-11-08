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
      const result = url.endsWith('/homework/suggest') ? { suggestion: homeworkSuggestion } : url.endsWith('/suggest') ? { question_sources: options.questionSources || [], suggestion: { title: 'AIの提案', objectives: '提案した目標', activities: '導入・展開・まとめ', teacher_script: '時間：0〜5分\n先生：前の時間を思い出しましょう。', student_questions: '児童：なぜ？ 教師：比べよう。', assessment: '提案した評価', notes: '準備' } } : data;
      return { ok: !failure, status: failure || 200, json: async () => failure ? { detail: '保存できません。' } : result };
    }
  };
  for (const id of ['hours', 'objectives', 'activities', 'studentQuestions', 'assessment', 'notes']) context.document.getElementById(id);
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/dialogue-view.js'), 'utf8').replace('export function', 'function'), context);
  context.URL = URL;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/instruction-links.js'), 'utf8').replace('export function', 'function'), context);
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
  assert.deepEqual(cells[3].children.map(button => button.textContent), ['修正', '削除', '指導案', '宿題']);
  assert.equal(cells[3].children[2].href, 'lesson_plans.html?assignment=one');
  assert.equal(cells[3].children[3].href, 'homework.html?assignment=one');
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

test('unit sidebar displays creation date in Japan and uncreated status', async () => {
  const plan = { id: 'plan', title: '保存済み', unit: '国語五 銀河 ／ 銀色の裏地', hours: 1, created_at: '2026-11-07T16:00:00+00:00', activities: '保存した展開' };
  const { context, elements } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one' });
  const units = elements.contentsList.children[2].children;
  assert.equal(units[0].children[1].textContent, '作成日：2026/11/08');
  assert.equal(units[1].children[1].textContent, '未作成');
  units[0].onclick();
  assert.equal(elements.activities.value, '保存した展開');
  assert.equal(elements.planCreatedAt.textContent, '作成日：2026/11/08');
  await elements.lessonPlanForm.onsubmit({ preventDefault() {} });
  assert.equal(context.requests.find(request => request.settings.method === 'PUT').url, '/api/teaching-assignments/one/lesson-plans/plan');
});

test('switching to an uncreated unit clears the previous lesson fields', async () => {
  const plan = { id: 'plan', title: '保存済み', unit: '国語五 銀河 ／ 銀色の裏地', hours: 3, activities: '保存した展開' };
  const { context, elements } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one&id=plan' });
  elements.contentsList.children[2].children[1].onclick();
  assert.equal(elements.activities.value, '');
  assert.equal(elements.planCreatedAt.textContent, '未作成');
  assert.equal(elements.planTitle.value, '大造じいさんとガン');
  await elements.lessonPlanForm.onsubmit({ preventDefault() {} });
  assert.ok(context.requests.find(request => request.settings.method === 'POST'));
});

test('legacy saved plans are never incorrectly marked as uncreated', async () => {
  const plan = { id: 'plan', title: '保存済み', unit: '国語五 銀河 ／ 銀色の裏地', hours: 1 };
  const { elements } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one&id=plan' });
  assert.equal(elements.contentsList.children[2].children[0].children[1].textContent, '作成済み（作成日不明）');
  assert.equal(elements.planCreatedAt.textContent, '作成済み（作成日不明）');
});

test('AI suggestion fills editable draft without saving it or marking it as created', async () => {
  const { context, elements } = await screen('lesson-plan-edit.js', lessonData, { search: '?assignment=one' });
  elements.contentsList.children[2].children[0].onclick();
  await elements.suggestLessonButton.onclick();
  const calls = context.requests.filter(request => request.settings.method === 'POST');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/teaching-assignments/one/lesson-plans/suggest');
  assert.equal(JSON.parse(calls[0].settings.body).subject, '国語');
  assert.equal(elements.objectives.value, '提案した目標');
  assert.equal(elements.studentQuestions.value, '児童：なぜ？ 教師：比べよう。');
  assert.equal(elements.activities.value, '導入・展開・まとめ');
  assert.match(elements.teacherScript.value, /時間：0〜5分/);
  assert.equal(elements.planCreatedAt.textContent, '未作成');
  assert.match(elements.aiSuggestionStatus.textContent, /確認・修正/);
  assert.equal(elements.suggestLessonButton.disabled, false);
});

test('failed AI suggestion preserves entered fields and enables retry', async () => {
  const { elements } = await screen('lesson-plan-edit.js', lessonData, { search: '?assignment=one', saveFailure: 502 });
  elements.contentsList.children[2].children[0].onclick();
  elements.objectives.value = '入力した目標';
  await elements.suggestLessonButton.onclick();
  assert.equal(elements.objectives.value, '入力した目標');
  assert.equal(elements.suggestLessonButton.disabled, false);
  assert.equal(elements.objectives.disabled, false);
});

const material = { grade: 4, subject: '国語', publisher: '光村図書', title: '4年 年間指導計画', edition: '令和6年度版', url: 'https://example.org/grade4.pdf' };
test('assignment editor displays material link and clears it after changing subject', async () => {
  const fixture = { ...data, textbooks: [{ grades: [4], subject: '国語', publisher: '光村図書' }], instruction_materials: [material] };
  const { elements } = await screen('teaching-subject-edit.js', fixture);
  elements.grade.value = '4'; elements.subject.value = '国語'; elements.subject.onchange();
  assert.equal(elements.instructionMaterials.hidden, false);
  assert.equal(elements.instructionLinks.children[0].href, material.url);
  assert.equal(elements.instructionLinks.children[0].rel, 'noopener noreferrer');
  elements.subject.value = '理科'; elements.subject.onchange();
  assert.equal(elements.instructionLinks.children.length, 0);
  assert.match(elements.instructionLinks.textContent, /未確認/);
});

test('assignment list displays publisher materials below textbook name', async () => {
  const fixture = { ...data, assignments: [{ ...data.assignments[0], instruction_materials: [material] }] };
  const { elements } = await screen('teaching-subjects.js', fixture);
  const links = elements.subjectList.children[0].children[2].children[0];
  assert.equal(links.children[0].href, material.url);
  assert.match(links.children[0].textContent, /年間指導計画/);
});

test('student dialogue is restored and saved independently from lesson flow', async () => {
  const plan = { id: 'plan', title: '授業', unit: '単元', hours: 1, activities: '授業の流れ', student_questions: '児童：なぜ？ 教師：図で比べよう。' };
  const { context, elements } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one&id=plan' });
  assert.equal(elements.activities.value, '授業の流れ');
  assert.equal(elements.studentQuestions.value, plan.student_questions);
  elements.studentQuestions.value = '修正した想定問答';
  await elements.lessonPlanForm.onsubmit({ preventDefault() {} });
  const body = JSON.parse(context.requests.find(request => request.settings.method === 'PUT').settings.body);
  assert.equal(body.student_questions, '修正した想定問答');
  assert.equal(body.activities, '授業の流れ');
});

test('older lesson plans keep flow and open empty question area', async () => {
  const plan = { id: 'plan', title: '以前の授業', unit: '単元', hours: 1, activities: '以前の内容' };
  const { elements } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one&id=plan' });
  assert.equal(elements.activities.value, '以前の内容');
  assert.equal(elements.studentQuestions.value, '');
  assert.equal(elements.teacherScript.value, '');
});

test('chronological teacher speech is restored and saved separately from questions and flow', async () => {
  const script = '時間：0〜5分\n場面：導入\n先生：どんな考え方を使えそうですか。\n時間：5〜15分\n場面：個人思考\n先生：図に表してみましょう。';
  const plan = { id: 'plan', title: '授業', unit: '単元', hours: 1, teacher_script: script, activities: '活動', student_questions: '想定質問' };
  const { context, elements } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one&id=plan' });
  assert.equal(elements.teacherScript.value, script);
  elements.teacherScript.value += '\n先生：今日分かったことを振り返りましょう。';
  await elements.lessonPlanForm.onsubmit({ preventDefault() {} });
  const body = JSON.parse(context.requests.find(call => call.settings.method === 'PUT').settings.body);
  assert.equal(body.teacher_script, elements.teacherScript.value);
  assert.equal(body.student_questions, '想定質問');
  assert.equal(body.activities, '活動');
});

test('dialogue reading view separates parts and speakers while keeping original editable text', async () => {
  const script = '時間：0〜5分 場面：導入 先生：前の時間を思い出そう。\n時間：5〜15分 場面：展開 先生：図に表そう。';
  const questions = '場面：導入\n児童：なぜ？\n教師：比べよう。\n確かめる問い：何が違う？\n\n場面：展開\n児童：これでいい？\n教師：図で確認しよう。';
  const plan = { id: 'plan', unit: '単元', teacher_script: script, student_questions: questions };
  const { elements } = await screen('lesson-plan-edit.js', { ...lessonData, plans: [plan] }, { search: '?assignment=one&id=plan' });
  assert.equal(elements.teacherScript.hidden, true);
  assert.equal(elements.teacherScriptPreview.children.length, 2);
  assert.equal(elements.studentQuestionsPreview.children.length, 2);
  assert.equal(elements.teacherScriptPreview.children[0].children[0].textContent, 'パート 1');
  assert.ok(elements.studentQuestionsPreview.children[0].children.some(row => row.className === 'dialogue-line dialogue-student'));
  elements.teacherScriptToggle.onclick();
  assert.equal(elements.teacherScript.hidden, false);
  assert.equal(elements.teacherScriptPreview.hidden, true);
  assert.equal(elements.teacherScript.value, script);
  elements.teacherScript.value = '時間：0〜5分 場面：導入 先生：修正した言葉';
  elements.teacherScriptToggle.onclick();
  assert.equal(elements.teacherScriptPreview.children.length, 1);
  assert.equal(elements.teacherScript.value, '時間：0〜5分 場面：導入 先生：修正した言葉');
});

const homeworkSuggestion = { title: '整数と小数の宿題', ...Object.fromEntries(['beginner', 'intermediate', 'advanced'].flatMap(level => [[`${level}_questions`, `${level}の問題`], [`${level}_answers`, `${level}の解答`]])) };
const homeworkData = { ...lessonData, homework: [] };

test('homework generation fills three levels and answers without autosaving', async () => {
  const { context, elements } = await screen('homework-edit.js', homeworkData, { search: '?assignment=one' });
  elements.unit.value = '整数と小数'; elements.minutes.value = '15';
  await elements.generateHomeworkButton.onclick();
  assert.equal(context.requests.filter(call => call.settings.method === 'POST').length, 1);
  for (const key of Object.keys(homeworkSuggestion)) assert.equal(elements[key === 'title' ? 'homeworkTitle' : key].value, homeworkSuggestion[key]);
  assert.match(elements.generationStatus.textContent, /確認・修正/);
  await elements.homeworkForm.onsubmit({ preventDefault() {} });
  const saved = context.requests.find(call => call.url.endsWith('/homework') && call.settings.method === 'POST');
  assert.equal(JSON.parse(saved.settings.body).advanced_answers, 'advancedの解答');
  assert.equal(context.destination, 'homework.html?assignment=one');
});

test('homework generation failure keeps the draft available for retry', async () => {
  const { elements } = await screen('homework-edit.js', homeworkData, { search: '?assignment=one', saveFailure: 502 });
  elements.unit.value = '単元'; elements.minutes.value = '15'; elements.beginner_questions.value = '下書き';
  await elements.generateHomeworkButton.onclick();
  assert.equal(elements.beginner_questions.value, '下書き');
  assert.equal(elements.generateHomeworkButton.disabled, false);
});

test('homework list and editor restore saved content and update original record', async () => {
  const fixture = { ...homeworkData, homework: [{ ...homeworkSuggestion, id: 'saved', unit: '単元', minutes: 15, created_at: '2026-11-07T16:00:00+00:00' }] };
  const list = await screen('homework.js', fixture, { search: '?assignment=one' });
  assert.equal(list.elements.homeworkList.children[0].children[2].textContent, '2026/11/8');
  assert.equal(list.elements.homeworkList.children[0].children[3].children[0].href, 'homework_edit.html?assignment=one&id=saved');
  const { context, elements } = await screen('homework-edit.js', fixture, { search: '?assignment=one&id=saved' });
  assert.equal(elements.advanced_answers.value, 'advancedの解答');
  await elements.homeworkForm.onsubmit({ preventDefault() {} });
  assert.equal(context.requests.find(call => call.settings.method === 'PUT').url, '/api/teaching-assignments/one/homework/saved');
});

test('question references are displayed, saved, restored and cleared on unit switch', async () => {
  const reference = { id: 'reviewed', title: '公開指導資料', organization: '教育委員会', url: 'https://example.org/reference.pdf', location: '2ページ', scope: '単元のつまずき', summary: '確認済みの要約' };
  const { context, elements } = await screen('lesson-plan-edit.js', lessonData, { search: '?assignment=one', questionSources: [reference] });
  elements.contentsList.children[2].children[0].onclick();
  await elements.suggestLessonButton.onclick();
  assert.equal(elements.questionSources.children[0].children[0].href, reference.url);
  assert.equal(elements.questionSources.children[0].children[2].textContent, reference.summary);
  await elements.lessonPlanForm.onsubmit({ preventDefault() {} });
  const save = context.requests.find(call => call.url.endsWith('/lesson-plans') && call.settings.method === 'POST');
  assert.deepEqual(JSON.parse(save.settings.body).question_source_ids, ['reviewed']);
  const restored = await screen('lesson-plan-edit.js', { ...lessonData, plans: [{ id: 'saved', unit: '国語五 銀河 ／ 銀色の裏地', question_sources: [reference] }] }, { search: '?assignment=one&id=saved' });
  assert.equal(restored.elements.questionSources.children.length, 1);
  restored.elements.contentsList.children[2].children[1].onclick();
  assert.equal(restored.elements.questionSources.children.length, 0);
});
