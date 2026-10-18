import {EDITOR_API_VERSION, EditorRegistry, EditorSession, DescendantSession} from '@kubohiroya/turbowarp-extension-data-editor';
import type {
  ValidationIssue as RootIssue, DescendantValidationIssue, EditorDefinition, BlockSnapshot,
  JsonObject, JsonValue, BlockEditorHost
} from '@kubohiroya/turbowarp-extension-data-editor';
import type {ValidationIssue as LegacyIssue} from '../../dist/types.js';
import type {ValidationIssue as SchemaIssue} from '@kubohiroya/turbowarp-extension-data-editor/schema';
import {createSchemaEditor, createBlockEditorService} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type {SchemaEditorOptions, BlockEditorRegistrationAPI, BlockEditorService} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import {BlockEditorDialog} from '@kubohiroya/turbowarp-extension-data-editor/react';
import type {DialogSessionState, DialogSession} from '@kubohiroya/turbowarp-extension-data-editor/react';
import {attachTurboWarpBlockEditors, createTurboWarpBlockEditorHost} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';
import type {TurboWarpBlockEditorHost, TurboWarpBlockEditorOptions} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';

export const version: 1 = EDITOR_API_VERSION;
export const root: RootIssue = {message: 'Legacy', path: '.label'};
export const legacy: LegacyIssue = root;
export const schema: SchemaIssue = legacy;
export const back: RootIssue = schema;
export interface ExtendedIssue extends LegacyIssue {readonly detail?: string;}
export const extended: ExtendedIssue = {...schema, detail: 'compatible'};
export const descendant: DescendantValidationIssue = {
  ...schema, reference: {targetId: 'sprite', blockId: 'block'}, inputPath: []
};
export const state: DialogSessionState = {status: 'editing', canSave: true, issues: [root, descendant], error: undefined};
export const definition: EditorDefinition = {
  apiVersion: version, extensionId: 'story', editorId: 'custom', opcodes: ['story_scene'], editableArguments: ['PROPERTIES'],
  read: () => ({}), validate: async () => [root], createPatch: () => [], mount: () => () => {}
};
export const options: SchemaEditorOptions = {
  apiVersion: version, extensionId: 'story', editorId: 'schema', opcodes: ['story_scene'],
  argument: 'PROPERTIES', schema: {type: 'object'}, uiSchema: {},
  validateData: async (_data: JsonValue, _snapshot: BlockSnapshot) => [schema]
};
export const json: JsonObject = {items: [1]};
json.items = [2];
export const service: BlockEditorService = createBlockEditorService();
export const api: BlockEditorRegistrationAPI = service.api;
export const editor = createSchemaEditor(options);
api.register(definition);
api.registerSchema(options);
export const registry: EditorRegistry = service.registry;
declare const host: TurboWarpBlockEditorHost;
export const baseHost: BlockEditorHost = host;
declare const session: EditorSession;
declare const descendants: DescendantSession;
export const dialogSessions: DialogSession[] = [session, descendants];
export const adapterOptions: TurboWarpBlockEditorOptions = {
  ScratchBlocks: {}, workspace: {}, vm: {}, service, label: 'Edit', canOpen: () => true, onOpen: () => {}
};
export const attachment = attachTurboWarpBlockEditors(adapterOptions);
export const hostFactory = createTurboWarpBlockEditorHost;
export const dialog = BlockEditorDialog;

// The existing API and new entry refer to one interface, including module augmentation.
declare module '../../dist/types.js' {
  interface ValidationIssue {readonly compatibilityTag?: string;}
}
export const augmented: RootIssue = {message: 'ok', compatibilityTag: 'preserved'};
export const augmentedNew: SchemaIssue = augmented;
export const tag: string | undefined = augmentedNew.compatibilityTag;
// @ts-expect-error New schema types are restricted to the schema subpath.
import type {SchemaBundle} from '@kubohiroya/turbowarp-extension-data-editor';

import {createSchemaBundleEditor} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type {SchemaBundleEditorOptions} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import {bundle, context, owner} from './schema-pure-consumer.js';
export const bundleOptions: SchemaBundleEditorOptions<{delegate: boolean; nested?: {modes: string[]}; pair: [number, string?]}> = {
  apiVersion: version, extensionId: 'story', editorId: 'bundle', opcodes: ['story_scene'], argument: 'PROPERTIES',
  schemaBundle: bundle, validationContext: () => context, ownerValidate: owner
};
export const bundleEditor = createSchemaBundleEditor(bundleOptions);
api.registerSchemaBundle?.(bundleOptions);
createBlockEditorService().api.registerSchemaBundle(bundleOptions);

// Existing host implementations remain assignable without the new optional capability.
export const oldRegistrationAPI: BlockEditorRegistrationAPI = {
  apiVersion: 1, register: () => () => {}, registerSchema: () => () => {}
};
export const oldService: BlockEditorService = {registry: new EditorRegistry(), api: oldRegistrationAPI, subscribe: () => () => {}};
