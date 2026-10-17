import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {EditorRegistry} from '../dist/index.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node']) {
  Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
Object.defineProperty(globalThis, 'MessageChannel', {value: undefined, configurable: true});
after(() => dom.window.close());
const {createSchemaEditor} = await import('../dist/rjsf.js');
const require = createRequire(import.meta.url);
const {act, Simulate} = require('react-dom/test-utils');

const schema = {
  type: 'object',
  properties: {
    label: {type: 'string', minLength: 1, title: 'Scene label'},
    duration: {type: 'number', minimum: 1, maximum: 60, title: 'Duration'}
  },
  required: ['label', 'duration'], additionalProperties: false
};

function fixture(options = {}, stored = '{"label":"Opening","duration":2}') {
  const definition = createSchemaEditor({
    apiVersion: 1, extensionId: 'story', editorId: 'schema', opcodes: ['story_scene'],
    argument: 'PROPERTIES', schema, ...options
  });
  const registry = new EditorRegistry();
  registry.register(definition);
  let committed = 0;
  const block = {targetId: 'sprite', blockId: 'scene', opcode: 'story_scene', revision: '1',
    arguments: {PROPERTIES: {kind: 'literal', value: stored}}};
  const host = {readBlock: () => block, commit: request => {
    committed++;
    block.arguments.PROPERTIES.value = request.changes[0].value;
  }};
  return {session: registry.open(block, host), block, committed: () => committed};
}

test('schema validation is mandatory even without mounting a form', async () => {
  const invalid = [
    {}, {label: '', duration: 2}, {label: 'Opening', duration: 0},
    {label: 'Opening', duration: 61}, {label: 'Opening', duration: '2'},
    {label: 'Opening', duration: 2, unknown: true}
  ];
  for (const data of invalid) {
    const f = fixture();
    f.session.setDraft({data});
    const result = await f.session.save();
    assert.equal(result.status, 'invalid');
    assert.equal(f.committed(), 0);
    assert.equal(f.block.arguments.PROPERTIES.value, '{"label":"Opening","duration":2}');
    assert.equal(f.session.getState().canSave, false);
    assert.deepEqual(f.session.getDraft(), {data});
    f.session.dispose();
  }
});

test('valid data is JSON-serialized into the designated argument once', async () => {
  const f = fixture();
  f.session.setDraft({data: {label: 'Closing', duration: 3}});
  assert.equal((await f.session.save()).status, 'saved');
  assert.equal(f.committed(), 1);
  assert.deepEqual(JSON.parse(f.block.arguments.PROPERTIES.value), {label: 'Closing', duration: 3});
});

test('custom business validation runs only after schema validation and blocks commit', async () => {
  let calls = 0;
  const f = fixture({validateData: async data => {
    calls++;
    return data.label === 'Forbidden' ? [{message: 'Choose another label.'}] : [];
  }});
  f.session.setDraft({data: {label: 'Forbidden', duration: 0}});
  assert.equal((await f.session.save()).status, 'invalid');
  assert.equal(calls, 0);
  f.session.setDraft({data: {label: 'Forbidden', duration: 2}});
  assert.equal((await f.session.save()).status, 'invalid');
  assert.equal(calls, 1);
  assert.equal(f.committed(), 0);
  f.session.dispose();
});

test('invalid schemas and unresolved references fail registration without network access', () => {
  for (const bad of [{type: 'not-a-type'}, {$ref: 'https://example.invalid/schema.json'}]) {
    assert.throws(() => fixture({schema: bad}), /Invalid or unsupported JSON Schema/);
  }
});

test('arrays and scalar JSON roots are supported by the internal draft envelope', async () => {
  for (const [s, value, replacement] of [
    [{type: 'array', minItems: 1, items: {type: 'integer'}}, [1], [2, 3]],
    [{type: 'boolean'}, true, false],
    [{type: 'string', minLength: 1}, 'opening', 'closing']
  ]) {
    const f = fixture({schema: s}, JSON.stringify(value));
    f.session.setDraft({data: replacement});
    assert.equal((await f.session.save()).status, 'saved');
    assert.deepEqual(JSON.parse(f.block.arguments.PROPERTIES.value), replacement);
  }
});

test('RJSF automatically builds controls, reports live invalid state, and cleans up on cancel', async t => {
  const f = fixture();
  const container = document.createElement('div');
  document.body.appendChild(container);
  t.after(() => { f.session.dispose(); container.remove(); });
  await act(async () => { f.session.mount(container); });
  const number = container.querySelector('input[type="number"]');
  const text = container.querySelector('input[type="text"]');
  assert.ok(number);
  assert.ok(text);
  assert.equal(text.value, 'Opening');
  assert.equal(f.session.getState().canSave, true);
  assert.equal(container.querySelector('button[type="submit"]'), null);
  await act(async () => { Simulate.change(number, {target: {value: '0'}}); });
  assert.equal(f.session.getState().canSave, false);
  assert.equal(f.committed(), 0);
  assert.ok(f.session.getState().issues.length > 0);
  assert.equal((await f.session.save()).status, 'invalid');
  await act(async () => { Simulate.change(number, {target: {value: '3'}}); });
  assert.equal(f.session.getState().canSave, true);
  await act(async () => { f.session.cancel(); });
  assert.equal(container.childNodes.length, 0);
  assert.equal(f.committed(), 0);
});

test('schema defaults affect only the draft until the user saves', async t => {
  const f = fixture({schema: {type: 'object', properties: {
    duration: {type: 'number', default: 2, minimum: 1}
  }, required: ['duration']}}, '{}');
  const container = document.createElement('div');
  document.body.appendChild(container);
  t.after(() => { f.session.dispose(); container.remove(); });
  await act(async () => { f.session.mount(container); });
  assert.deepEqual(f.session.getDraft(), {data: {duration: 2}});
  assert.equal(f.block.arguments.PROPERTIES.value, '{}');
  assert.equal(f.committed(), 0);
  await act(async () => { assert.equal((await f.session.save()).status, 'saved'); });
  assert.equal(f.block.arguments.PROPERTIES.value, '{"duration":2}');
});
