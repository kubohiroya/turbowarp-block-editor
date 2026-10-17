import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {EditorRegistry} from '../dist/index.js';
import {decodeSource} from '../dist/codec.js';

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

test('remount preserves the session draft and business validation errors', async t => {
  const f = fixture({validateData: () => [{message: 'Choose another label.', path: '.label'}]});
  const container = document.createElement('div');
  document.body.appendChild(container);
  t.after(() => { f.session.dispose(); container.remove(); });
  let unmount;
  await act(async () => { unmount = f.session.mount(container); });
  await act(async () => {
    Simulate.change(container.querySelector('input[type="text"]'), {target: {value: 'Forbidden'}});
  });
  await act(async () => {
    assert.equal((await f.session.save()).status, 'invalid');
  });
  const draft = f.session.getDraft();
  const state = f.session.getState();
  await act(async () => { unmount(); });
  assert.deepEqual(f.session.getDraft(), draft);
  await act(async () => { f.session.mount(container); });
  assert.deepEqual(f.session.getDraft(), draft);
  assert.deepEqual(f.session.getState(), state);
  assert.equal(container.querySelector('input[type="text"]').value, 'Forbidden');
  assert.equal(f.committed(), 0);
});

test('cleared default values remain cleared across unmount and remount', async t => {
  const f = fixture({schema: {type: 'object', properties: {
    duration: {type: 'number', default: 2, minimum: 1}
  }, required: ['duration']}}, '{}');
  assert.deepEqual(f.session.getDraft(), {data: {duration: 2}});
  const container = document.createElement('div');
  document.body.appendChild(container);
  t.after(() => { f.session.dispose(); container.remove(); });
  let unmount;
  await act(async () => { unmount = f.session.mount(container); });
  await act(async () => {
    Simulate.change(container.querySelector('input[type="number"]'), {target: {value: ''}});
  });
  const draft = f.session.getDraft();
  const state = f.session.getState();
  assert.deepEqual(draft, {data: {}});
  assert.equal(state.canSave, false);
  await act(async () => { unmount(); });
  await act(async () => { f.session.mount(container); });
  assert.deepEqual(f.session.getDraft(), draft);
  assert.deepEqual(f.session.getState(), state);
  assert.equal(container.querySelector('input[type="number"]').value, '');
  assert.equal(f.block.arguments.PROPERTIES.value, '{}');
  assert.equal(f.committed(), 0);
});

test('simultaneous standard forms have separate field IDs and drafts', async t => {
  const first = fixture();
  const second = fixture();
  const containers = [document.createElement('div'), document.createElement('div')];
  containers.forEach(container => document.body.appendChild(container));
  t.after(() => {
    act(() => { first.session.dispose(); second.session.dispose(); });
    containers.forEach(container => container.remove());
  });
  await act(async () => {
    first.session.mount(containers[0]);
    second.session.mount(containers[1]);
  });
  const ids = containers.flatMap(container => [...container.querySelectorAll('[id]')].map(node => node.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const container of containers) {
    for (const label of container.querySelectorAll('label[for]')) {
      assert.ok(container.contains(document.getElementById(label.htmlFor)));
    }
  }
  await act(async () => {
    Simulate.change(containers[0].querySelector('input[type="text"]'), {target: {value: 'First only'}});
  });
  assert.equal(first.session.getDraft().data.label, 'First only');
  assert.equal(second.session.getDraft().data.label, 'Opening');
  assert.equal(first.committed(), 0);
  assert.equal(second.committed(), 0);
});

const yamlSource = '# Existing YAML, not JSON\nlabel: \'日本語「春」 & "scene"\'\nduration: 2\nbody: |\n  一行目\n  二行目\n';
const yamlSchema = {...schema, additionalProperties: true};

test('YAML reads existing source, retains unedited properties, and saves as YAML', async () => {
  const f = fixture({format: 'yaml', schema: yamlSchema}, yamlSource);
  const data = f.session.getDraft().data;
  assert.equal(data.label, '日本語「春」 & "scene"');
  assert.equal(data.body, '一行目\n二行目\n');
  f.session.setDraft({data: {...data, duration: 3}});
  assert.equal((await f.session.save()).status, 'saved');
  const saved = f.block.arguments.PROPERTIES.value;
  assert.deepEqual(decodeSource(saved, 'yaml'), {...data, duration: 3});
  assert.throws(() => JSON.parse(saved));
  assert.equal(f.committed(), 1);
});

test('unchanged JSON/YAML keeps the original bytes and creates no undo entry', async () => {
  for (const [format, stored] of [['json', ' { "duration": 2, "label": "Opening" } '], ['yaml', yamlSource]]) {
    const f = fixture({format, schema: yamlSchema}, stored);
    const data = f.session.getDraft().data;
    f.session.setDraft({data: Object.fromEntries(Object.entries(data).reverse())});
    assert.deepEqual(await f.session.save(), {status: 'saved', changed: false});
    assert.equal(f.committed(), 0);
    assert.equal(f.block.arguments.PROPERTIES.value, stored);
  }
});

test('invalid YAML/schema/format does not initialize or commit replacement values', async () => {
  for (const source of ['label: [broken', 'label: one\nlabel: two', 'label: !custom name']) {
    assert.throws(() => fixture({format: 'yaml'}, source));
  }
  assert.throws(() => fixture({format: 'toml'}), /Unsupported source format/);
  const f = fixture({format: 'yaml', schema: yamlSchema}, yamlSource);
  f.session.setDraft({data: {...f.session.getDraft().data, duration: 0}});
  assert.equal((await f.session.save()).status, 'invalid');
  assert.equal(f.block.arguments.PROPERTIES.value, yamlSource);
  assert.equal(f.committed(), 0);
  f.session.cancel();
});

test('YAML form disables invalid Save and async validation locks editing, saving and closing', async t => {
  let finish;
  const f = fixture({format: 'yaml', schema: yamlSchema,
    validateData: () => new Promise(resolve => { finish = resolve; })}, yamlSource);
  const container = document.createElement('div');
  document.body.appendChild(container);
  t.after(() => { f.session.dispose(); container.remove(); });
  await act(async () => { f.session.mount(container); });
  const number = container.querySelector('input[type="number"]');
  await act(async () => { Simulate.change(number, {target: {value: '0'}}); });
  assert.equal(f.session.getState().canSave, false);
  assert.equal((await f.session.save()).status, 'invalid');
  await act(async () => { Simulate.change(number, {target: {value: '4'}}); });
  let saving;
  await act(async () => { saving = f.session.save(); });
  assert.equal(f.session.getState().status, 'saving');
  assert.equal(container.querySelector('input[type="number"]').disabled, true);
  assert.equal((await f.session.save()).status, 'busy');
  assert.equal(f.session.cancel(), false);
  assert.equal(f.session.dispose(), false);
  assert.throws(() => f.session.setDraft({data: {}}), /not editable/);
  assert.equal(f.block.arguments.PROPERTIES.value, yamlSource);
  await act(async () => { finish([]); await saving; });
  assert.equal(f.committed(), 1);
  assert.equal(decodeSource(f.block.arguments.PROPERTIES.value, 'yaml').duration, 4);
  assert.equal(container.childNodes.length, 0);
});

test('YAML Cancel retains exact source and unmounts the form', async t => {
  const f = fixture({format: 'yaml', schema: yamlSchema}, yamlSource);
  const container = document.createElement('div');
  document.body.appendChild(container);
  t.after(() => container.remove());
  await act(async () => { f.session.mount(container); });
  await act(async () => {
    Simulate.change(container.querySelector('input[type="number"]'), {target: {value: '9'}});
    assert.equal(f.session.cancel(), true);
  });
  assert.equal(container.childNodes.length, 0);
  assert.equal(f.committed(), 0);
  assert.equal(f.block.arguments.PROPERTIES.value, yamlSource);
});
