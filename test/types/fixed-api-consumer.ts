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
