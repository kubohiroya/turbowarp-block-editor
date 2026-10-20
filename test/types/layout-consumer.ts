import {createBlockEditorService, createSchemaEditor, createSourceEditor} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type {EditorLayout, EditorFeatureFlags, SchemaEditorOptions, SourceVariant, SourceEditorOptions} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type {SchemaBundle} from '@kubohiroya/turbowarp-extension-data-editor/schema';

const layout: EditorLayout = {version: 1, items: [{tabs: [{label: 'Main', items: [{grid: 2, items: [{field: 'x'}]}]}]}]};
const uiSchema = {'ui:options': {extensionDataLayout: layout}};
const flags: EditorFeatureFlags = {commonLayout: true};
const schema: SchemaEditorOptions = {apiVersion: 1, extensionId: 'fixture', editorId: 'fixture', opcodes: ['fixture_edit'],
  argument: 'SOURCE', schema: {type: 'object', properties: {x: {type: 'number'}}}, uiSchema};
declare const schemaBundle: SchemaBundle;
const variant: SourceVariant = {variantId: 'plain', format: 'json', schemaBundle, uiSchema};
const source: SourceEditorOptions = {apiVersion: 1, extensionId: 'fixture', editorId: 'source', opcodes: ['fixture_source'],
  validationContext: () => ({consumerId: 'fixture', nowMs: 0, settings: null}), bindings: [{argument: 'SOURCE', variants: [variant],
    decode: raw => ({source: raw, variantId: 'plain', format: 'json', data: JSON.parse(raw)}),
    validateSource: raw => ({source: raw, result: {kind: 'valid', diagnostics: []}})}]};
createSchemaEditor(schema, flags);
createSourceEditor(source, flags);
const service = createBlockEditorService(flags);
service.api.registerSchema(schema);
service.api.registerSourceEditor(source);
createBlockEditorService({commonLayout: true, fixedInputs: true}).api.registerFixedInputEditor;
// @ts-expect-error Startup flags accept only booleans.
createBlockEditorService({commonLayout: 'true'});
// @ts-expect-error Layout v1 does not accept another version.
const bad: EditorLayout = {version: 2, items: []};
void bad;
