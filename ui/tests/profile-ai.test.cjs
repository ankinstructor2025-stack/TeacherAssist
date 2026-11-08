const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function screen(options = {}) {
  const elements = {};
  const node = () => ({ value: '', children: [], hidden: true, textContent: '', disabled: true,
    replaceChildren(...values) { this.children = values; }, add(value) { this.children.push(value); }, reportValidity: () => true });
  const secret = 'test-key-not-real';
  const models = [{ id: 'one', provider: 'openai', model_name: 'model-one' }, { id: 'two', provider: 'gemini', model_name: 'model-two' }];
  const settings = options.unsaved ? { model_id: '', has_api_key: false, api_key: '' } : { model_id: 'one', provider: 'openai', model_name: 'model-one', has_api_key: true, api_key: secret };
  const calls = [];
  const context = {
    document: { getElementById: id => elements[id] ||= node() },
    Option: function(text, value) { this.text = text; this.value = value; },
    request: async (path, input = {}) => {
      calls.push({ path, ...input });
      if (input.method === 'PUT') {
        if (options.saveFails) throw Error('保存失敗');
        const body = JSON.parse(input.body);
        const model = models.find(item => item.id === body.model_id);
        return { settings: { model_id: model.id, provider: model.provider, model_name: model.model_name, has_api_key: true } };
      }
      if (input.method === 'POST') {
        if (options.testFails) throw Error('認証失敗');
        return { ok: true, message: '疎通テストに成功しました。' };
      }
      return { models, settings };
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/profile-ai.js'), 'utf8').replace(/^export /gm, ''), context);
  vm.runInContext('resetProfileAi()', context);
  await vm.runInContext('setupProfileAi(request, () => true)', context);
  return { context, elements, calls, secret };
}

test('saved key is masked and can be shown then hidden', async () => {
  const { elements, secret } = await screen();
  assert.equal(elements.aiApiKey.value, secret);
  assert.equal(elements.aiApiKey.type, 'password');
  elements.toggleAiKey.onclick();
  assert.equal(elements.aiApiKey.type, 'text');
  assert.equal(elements.aiApiKey.value, secret);
  elements.toggleAiKey.onclick();
  assert.equal(elements.aiApiKey.type, 'password');
});

test('connection test sends no user message or key and displays success', async () => {
  const { elements, calls } = await screen();
  assert.equal(elements.testAiButton.disabled, false);
  await elements.testAiButton.onclick();
  assert.deepEqual(calls[1], { path: '/profile/ai/test', method: 'POST' });
  assert.equal(elements.aiTestResult.textContent, '疎通テストに成功しました。');
  assert.equal(elements.testAiButton.disabled, false);
});

test('new key is saved and remains available behind masked field', async () => {
  const { elements, calls } = await screen({ unsaved: true });
  elements.aiModel.value = 'one';
  elements.aiModel.onchange();
  elements.aiApiKey.value = 'new-test-key';
  elements.aiApiKey.oninput();
  assert.equal(elements.testAiButton.disabled, true);
  await elements.aiSettingsForm.onsubmit({ preventDefault() {} });
  assert.equal(JSON.parse(calls[1].body).api_key, 'new-test-key');
  assert.equal(elements.aiApiKey.type, 'password');
  assert.equal(elements.aiApiKey.value, 'new-test-key');
  assert.equal(elements.testAiButton.disabled, false);
});

test('switching providers clears old key and requires saving before testing', async () => {
  const { elements, secret } = await screen();
  elements.aiModel.value = 'two';
  elements.aiModel.onchange();
  assert.equal(elements.aiApiKey.value, '');
  assert.equal(elements.testAiButton.disabled, true);
  elements.aiModel.value = 'one';
  elements.aiModel.onchange();
  assert.equal(elements.aiApiKey.value, secret);
});

test('failed test shows failure and enables retry', async () => {
  const { elements } = await screen({ testFails: true });
  await elements.testAiButton.onclick();
  assert.equal(elements.aiTestResult.textContent, '認証失敗');
  assert.equal(elements.testAiButton.disabled, false);
});

test('authentication reset clears visible credential', async () => {
  const { context, elements } = await screen();
  elements.toggleAiKey.onclick();
  vm.runInContext('resetProfileAi()', context);
  assert.equal(elements.profileAi.hidden, true);
  assert.equal(elements.aiApiKey.value, '');
  assert.equal(elements.aiApiKey.type, 'password');
  assert.equal(elements.testAiButton.disabled, true);
});
