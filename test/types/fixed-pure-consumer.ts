import {EDITOR_API_VERSION, FIXED_INPUTS_CAPABILITY, EditorRegistry, createFixedInputEditor} from '@kubohiroya/turbowarp-extension-data-editor';
import type {
  BlockSnapshot, BlockEditorHost, EditorDefinition, FixedBlockSnapshot, FixedInputDeclaration,
  FixedInputEditorDefinition, FixedInputEditorHost, FixedInputMetadata, FixedPreparedSave,
  FixedInputEditorOptions, PreparedEditorDefinition, FixedInputDraft
} from '@kubohiroya/turbowarp-extension-data-editor';
import type {SchemaBundle} from '@kubohiroya/turbowarp-extension-data-editor/schema';

export const apiVersion: 1 = EDITOR_API_VERSION;
export const capability: 'fixed-inputs-v1' = FIXED_INPUTS_CAPABILITY;
export const legacySnapshot: BlockSnapshot = {
  targetId: 'sprite', blockId: 'block', opcode: 'owner_number', revision: '1',
  arguments: {VALUE: {kind: 'literal', value: '001'}, CONDITION: {kind: 'reporter'}}
};
export const oldHost: BlockEditorHost = {readBlock: () => legacySnapshot, commit: () => {}};
export const oldDefinition: EditorDefinition = {
  apiVersion: 1, extensionId: 'owner', editorId: 'old', opcodes: ['owner_number'], editableArguments: ['VALUE'],
  read: () => ({}), validate: () => [], createPatch: () => []
};
export const oldPrepared: PreparedEditorDefinition = {
  ...oldDefinition, saveContract: 'prepared-source-v1', prepareSave: () => ({kind: 'ready', changes: []})
};
export const declaration: FixedInputDeclaration = {
  contractId: 'owner.numbers', contractRevision: '1', editableArguments: ['VALUE'],
  readOnlyArguments: ['CONDITION'], dependencies: []
};
export const input: FixedInputMetadata = {role: 'editable', source: 'shadow', identity: 'shadow-v1',
  field: {blockId: 'shadow', name: 'NUM', type: 'math_number'}};
export const fixedSnapshot: FixedBlockSnapshot = {...legacySnapshot, fixedContext: {
  contractId: 'owner.numbers', contractRevision: '1', generation: 'generation-1',
  readOnlyArguments: ['CONDITION'], dependencies: [],
  inputs: {VALUE: input, CONDITION: {role: 'readonly', source: 'reporter', identity: 'reporter-v1'}}
}};
export const preservedLegacySnapshot: BlockSnapshot = fixedSnapshot;
export const fixedHost: FixedInputEditorHost = {
  capability, readBlock: () => fixedSnapshot, commit: () => {}
};
export const mixedHost: BlockEditorHost = {...oldHost, fixedInputs: fixedHost};
export const commitForHost: Parameters<FixedInputEditorHost['commit']>[0] = {
  expected: fixedSnapshot, changes: [], signal: new AbortController().signal,
  context: {consumerId: 'owner', nowMs: 0, settings: {mode: 'exact', values: [null, true, 2]}}
};
fixedHost.commit(commitForHost);
export const incompleteDraft: FixedInputDraft = {inputs: {VALUE: {value: 1, changed: true, buffer: '1e'}}};
export const defaultReady: FixedPreparedSave = {kind: 'ready', changes: [], context: {consumerId: 'owner', nowMs: 0, settings: null}};
export const configuredReady: FixedPreparedSave<{mode: string}> = {
  kind: 'ready', changes: [{argument: 'VALUE', value: '002'}], context: {consumerId: 'owner', nowMs: 0, settings: {mode: 'exact'}}
};

declare const bundle: SchemaBundle;
export const options: FixedInputEditorOptions = {
  apiVersion: 1, extensionId: 'owner', editorId: 'fixed', opcodes: ['owner_number'],
  contractId: 'owner.numbers', contractRevision: '1', bindings: [{
    argument: 'VALUE', schemaBundle: bundle, read: value => Number(value), encode: value => String(value),
    validateCandidate: () => []
  }], validationContext: () => ({consumerId: 'owner', nowMs: 0, settings: null})
};
export const fixed: FixedInputEditorDefinition = createFixedInputEditor(options);
export const inferred = createFixedInputEditor({
  apiVersion: 1, extensionId: 'owner', editorId: 'inferred', opcodes: ['owner_number'],
  contractId: 'owner.numbers', contractRevision: '1',
  bindings: [{argument: 'VALUE', schemaBundle: bundle, read: value => Number(value), encode: value => String(value), validateCandidate: () => []}],
  validationContext: () => ({consumerId: 'owner', nowMs: 0, settings: {enabled: true}})
});
export const registry = new EditorRegistry();
registry.register(oldDefinition);
registry.registerPrepared(oldPrepared);
registry.registerFixed(fixed);

// Negative fixtures must fail through the public package declarations.
// @ts-expect-error Legacy snapshots cannot satisfy the fixed metadata contract.
export const missingContext: FixedBlockSnapshot = legacySnapshot;
// @ts-expect-error Only fixed capability v1 is supported.
export const wrongCapability: FixedInputEditorHost = {...fixedHost, capability: 'prepared-source-v1'};
// @ts-expect-error Settings-free defaults only admit null context.
export const wrongDefaultContext: FixedPreparedSave = {kind: 'ready', changes: [], context: {consumerId: 'owner', nowMs: 0, settings: {enabled: true}}};
// @ts-expect-error Fixed save is synchronous and must not return a promise.
export const asyncPrepared: FixedInputEditorDefinition = {...fixed, prepareFixedSave: async () => defaultReady};
// @ts-expect-error The new prepared discriminator cannot replace the source contract.
export const replacedSource: PreparedEditorDefinition = {...oldPrepared, saveContract: 'prepared-fixed-v1'};
// @ts-expect-error Unknown input roles cannot be serialized as fixed metadata.
export const invalidRole: FixedInputMetadata = {...input, role: 'write-through'};
// @ts-expect-error The default settings context rejects owner-specific values.
export const badDefault: FixedInputEditorOptions = {...options, validationContext: () => ({consumerId: 'owner', nowMs: 0, settings: {enabled: true}})};
// @ts-expect-error Owner validation is strictly synchronous.
export const asyncValidation: FixedInputEditorOptions = {...options, bindings: [{...options.bindings[0]!, validateCandidate: async () => []}]};

// @ts-expect-error Session draft declarations cannot be reassigned by consumers.
incompleteDraft.inputs = {};
// @ts-expect-error Read-only input maps cannot acquire write candidates.
incompleteDraft.inputs.CONDITION = {value: 'text', changed: true};
// @ts-expect-error Read projections cannot return promises.
export const asyncProjection: FixedInputEditorOptions = {...options, bindings: [{...options.bindings[0]!, read: async () => 1}]};
// @ts-expect-error Encoders cannot return promises.
export const asyncEncoder: FixedInputEditorOptions = {...options, bindings: [{...options.bindings[0]!, encode: async () => '1'}]};
// @ts-expect-error Context providers cannot return promises.
export const asyncContext: FixedInputEditorOptions = {...options, validationContext: async () => ({consumerId: 'owner', nowMs: 0, settings: null})};
// @ts-expect-error Known functions are not owner settings.
export const functionSettings: FixedInputEditorOptions<{fn: () => number}> = {...options, validationContext: () => ({consumerId: 'owner', nowMs: 0, settings: {fn: () => 1}})};
// @ts-expect-error Host-erased contexts remain JSON-compatible.
export const functionHostSettings: Parameters<FixedInputEditorHost['commit']>[0] = {...commitForHost, context: {consumerId: 'owner', nowMs: 0, settings: {fn: () => 1}}};
