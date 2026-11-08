const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function screen(file, options = {}) {
  const elements = {};
  const node = () => ({ hidden: true, disabled: false, value: '', children: [], textContent: '',
    replaceChildren(...values) { this.children = values; }, append(...values) { this.children.push(...values); }, reportValidity: () => true });
  const model = { id: 'one', provider: 'openai', model_name: '<example-model>', enabled: false };
  const user = { getIdToken: async () => 'token' };
  const context = {
    document: { getElementById: id => elements[id] ||= node(), createElement: node }, URLSearchParams,
    window: { confirm: () => options.confirm !== false, location: { search: options.search || '', replace(value) { context.destination = value; } } },
    initializeAuth: async () => ({ auth: { currentUser: user } }),
    onAuthStateChanged(auth, callback) { context.observe = callback; },
    loadSession: async () => ({ is_system_administrator: options.administrator !== false }),
    signOut: async () => {}, showError: error => { context.error = error.message; }, API_BASE_URL: '/api',
    fetch: async (url, settings) => {
      context.requests ||= [];
      context.requests.push({ url, settings });
      const failure = settings.method && options.saveFailure;
      return { ok: !failure, status: failure || 200, json: async () => failure ? { detail: '重複しています。' } : url.endsWith('/one') ? model : { models: options.empty ? [] : [model] } };
    }
  };
  context.document.getElementById('provider').value = 'openai';
  context.document.getElementById('enabled').value = 'true';
  vm.createContext(context);
  const shared = fs.readFileSync(path.join(__dirname, '../js/system-page.js'), 'utf8').replace(/^import .*;$/gm, '').replace('export async function', 'async function');
  vm.runInContext(shared, context);
  const source = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8').replace(/^import .*;$/gm, '');
  await vm.runInContext(`(async () => {${source}})()`, context);
  await context.observe(options.anonymous ? null : user);
  return { context, elements };
}

test('model list displays provider, literal model name, enabled state and edit link', async () => {
  const { elements } = await screen('system-models.js');
  const cells = elements.modelList.children[0].children;
  assert.deepEqual(cells.slice(0, 3).map(cell => cell.textContent), ['OpenAI', '<example-model>', '無効']);
  assert.equal(cells[3].children[0].href, 'system_model_edit.html?id=one');
});

test('model registration sends only three fields and returns to list', async () => {
  const { context, elements } = await screen('system-model-edit.js');
  context.document.getElementById('modelName').value = ' example-model ';
  await elements.modelForm.onsubmit({ preventDefault() {} });
  const request = context.requests[0];
  assert.equal(request.url, '/api/system/models');
  assert.equal(request.settings.method, 'POST');
  assert.deepEqual(JSON.parse(request.settings.body), { provider: 'openai', model_name: 'example-model', enabled: true });
  assert.equal(context.destination, 'system_models.html');
});

test('model modification restores disabled state and updates existing ID', async () => {
  const { context, elements } = await screen('system-model-edit.js', { search: '?id=one' });
  assert.equal(elements.enabled.value, 'false');
  assert.equal(elements.modelName.value, '<example-model>');
  await elements.modelForm.onsubmit({ preventDefault() {} });
  const request = context.requests.find(item => item.settings.method === 'PUT');
  assert.equal(request.url, '/api/system/models/one');
  assert.equal(JSON.parse(request.settings.body).enabled, false);
});

test('failed save preserves form and enables retry', async () => {
  const { context, elements } = await screen('system-model-edit.js', { search: '?id=one', saveFailure: 409 });
  await elements.modelForm.onsubmit({ preventDefault() {} });
  assert.equal(context.destination, undefined);
  assert.equal(elements.modelName.value, '<example-model>');
  assert.equal(elements.saveButton.disabled, false);
  assert.ok(context.error);
});

test('delete cancellation does not mutate models and confirmation calls delete', async () => {
  const cancelled = await screen('system-models.js', { confirm: false });
  await cancelled.elements.modelList.children[0].children[3].children[1].onclick();
  assert.equal(cancelled.context.requests.length, 1);
  const active = await screen('system-models.js');
  await active.elements.modelList.children[0].children[3].children[1].onclick();
  assert.equal(active.context.requests[1].settings.method, 'DELETE');
  assert.equal(active.context.requests[1].url, '/api/system/models/one');
});

test('nonadministrators and anonymous users cannot load model data', async () => {
  const teacher = await screen('system-models.js', { administrator: false });
  assert.equal(teacher.context.destination, 'home.html');
  assert.equal(teacher.context.requests, undefined);
  assert.equal(teacher.elements.content.hidden, true);
  const anonymous = await screen('system-models.js', { anonymous: true });
  assert.equal(anonymous.context.destination, '../index.html');
  assert.equal(anonymous.context.requests, undefined);
});
