const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function editor(custom = true, fail = false) {
  const elements = {};
  const context = { document: { getElementById: id => elements[id] ||= { value: '', textContent: '', disabled: true } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/prompt-editor.js'), 'utf8').replace('export function', 'function'), context);
  const calls = [];
  context.data = { prompt_text: custom ? '' : '共通方針', common_prompt_text: '共通の方針', use_common: true, fixed_rules: '固定出力ルール' };
  context.request = async (url, settings) => { calls.push({ url, ...settings }); if (fail) throw Error('保存失敗'); return {}; };
  vm.runInContext(`setupPromptEditor(data, request, '/lesson_plan', () => true, ${custom})`, context);
  return { context, elements, calls };
}

test('user common mode is read-only and restoring it sends empty override', async () => {
  const { elements, calls } = editor();
  assert.equal(elements.promptText.value, '共通の方針');
  assert.equal(elements.promptText.readOnly, true);
  await elements.promptForm.onsubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(calls[0].body), { prompt_text: '' });
});

test('custom mode preserves draft across common toggles and saves only policy', async () => {
  const { elements, calls } = editor();
  elements.useCommonPrompt.checked = false;
  elements.useCommonPrompt.onchange();
  assert.equal(elements.promptText.readOnly, false);
  elements.promptText.value = '対話を増やす';
  elements.useCommonPrompt.checked = true;
  elements.useCommonPrompt.onchange();
  assert.equal(elements.promptText.value, '共通の方針');
  elements.useCommonPrompt.checked = false;
  elements.useCommonPrompt.onchange();
  assert.equal(elements.promptText.value, '対話を増やす');
  await elements.promptForm.onsubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(calls[0].body), { prompt_text: '対話を増やす' });
  assert.equal(elements.fixedRules.textContent, '固定出力ルール');
});

test('failed administrator save keeps text and enables retry', async () => {
  const { elements } = editor(false, true);
  elements.promptText.value = '具体的な発問を書く';
  await elements.promptForm.onsubmit({ preventDefault() {} });
  assert.equal(elements.promptText.value, '具体的な発問を書く');
  assert.equal(elements.promptText.readOnly, false);
  assert.equal(elements.saveButton.disabled, false);
  assert.equal(elements.message.textContent, '保存失敗');
});

test('empty custom text requires selecting common rather than accidental removal', async () => {
  const { elements, calls } = editor();
  elements.useCommonPrompt.checked = false;
  elements.useCommonPrompt.onchange();
  await elements.promptForm.onsubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  assert.match(elements.message.textContent, /共通設定/);
});
