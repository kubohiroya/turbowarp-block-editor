import {createBlockEditorService} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import type {
  BlockEditorRegistrationAPI, BlockEditorService, SchemaBundleBlockEditorRegistrationAPI,
  SourceBlockEditorRegistrationAPI, FixedBlockEditorRegistrationAPI, FixedInputEditorOptions
} from '@kubohiroya/turbowarp-extension-data-editor/rjsf';
import {options} from './fixed-pure-consumer.js';

// All existing host contracts stay valid without a new capability method.
export const oldAPI: BlockEditorRegistrationAPI = {apiVersion: 1, register: () => () => {}, registerSchema: () => () => {}};
export const oldBundle: SchemaBundleBlockEditorRegistrationAPI = {...oldAPI, registerSchemaBundle: () => () => {}};
export const oldSource: SourceBlockEditorRegistrationAPI = {...oldBundle, registerSourceEditor: () => () => {}};
export const service: BlockEditorService = createBlockEditorService();
export const sourceService: SourceBlockEditorRegistrationAPI = createBlockEditorService().api;
export const fixedService: FixedBlockEditorRegistrationAPI = createBlockEditorService({fixedInputs: true}).api;
export const defaultOptions: FixedInputEditorOptions = options;
oldAPI.registerFixedInputEditor?.(defaultOptions);
fixedService.registerFixedInputEditor(defaultOptions);

// @ts-expect-error Legacy source APIs do not guarantee fixed registration.
export const missingFixed: FixedBlockEditorRegistrationAPI = oldSource;
// @ts-expect-error The zero-argument factory must not expose fixed APIs as guaranteed.
createBlockEditorService().api.registerFixedInputEditor(options);
// @ts-expect-error Settings-free defaults reject non-null settings.
export const badDefaults: FixedInputEditorOptions = {...options, validationContext: () => ({consumerId: 'owner', nowMs: 0, settings: {enabled: true}})};

// The lower-level native host opts in independently of the GUI bridge.
import {createTurboWarpBlockEditorHost} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';
import type {TurboWarpHostOptions} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';
import {EditorRegistry} from '@kubohiroya/turbowarp-extension-data-editor';
import type {FixedInputDeclaration} from '@kubohiroya/turbowarp-extension-data-editor';
const registry = new EditorRegistry();
export const oldHostOptions: TurboWarpHostOptions = {ScratchBlocks: {}, workspace: {}, vm: {}, registry};
export const newHostOptions: TurboWarpHostOptions = {...oldHostOptions, enableFixedInputs: true};
export const nativeHost = createTurboWarpBlockEditorHost(newHostOptions);
export const authority: FixedInputDeclaration | undefined = registry.resolveFixed('owner_fixed');
// @ts-expect-error Only a boolean explicitly opts in to the lower-level port.
export const invalidNativeFlag: TurboWarpHostOptions = {...oldHostOptions, enableFixedInputs: 'true'};
// @ts-expect-error The callback-free authority never exposes owner callbacks.
authority?.readFixed({});

// GUI presentation locale is independent of candidate validation and feature startup.
createBlockEditorService({fixedInputs: true, fixedInputMessages: {reset: 'リセット'}});
createBlockEditorService({fixedInputs: true, fixedInputMessages: () => ({reset: 'Reset', readOnly: 'Read only'})});
// @ts-expect-error Presentation providers cannot return asynchronous messages.
createBlockEditorService({fixedInputs: true, fixedInputMessages: async () => ({reset: 'Reset'})});
import {attachTurboWarpBlockEditors} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';
const bridgeOptions = {...oldHostOptions, enabled: false, service: {registry, subscribe: () => () => {}},
  label: 'Edit', canOpen: () => false, onOpen: () => {}};
attachTurboWarpBlockEditors(bridgeOptions);
attachTurboWarpBlockEditors({...bridgeOptions, fixedInputs: true});
// @ts-expect-error The fixed bridge startup option must be a boolean.
attachTurboWarpBlockEditors({...bridgeOptions, fixedInputs: '1'});
