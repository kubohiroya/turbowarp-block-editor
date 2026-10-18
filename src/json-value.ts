import type {SchemaBundle} from './schema-types.js';

/** Every finite JSON value is accepted. The shared snapshot guard enforces JSON safety. */
export const jsonValueSchema = true;
const source = {repository: 'https://github.com/kubohiroya/turbowarp-extension-data-editor',
  path: 'src/json-value.ts', symbol: 'jsonValueSchema'} as const;
export const jsonValueSchemaBundle: SchemaBundle = Object.freeze<SchemaBundle>({
  identity: {ownerId: '@kubohiroya/turbowarp-extension-data-editor', contractId: 'json-value', revision: '1', variantId: 'json-value'},
  dialect: '2020-12',
  root: {retrievalUri: 'https://kubohiroya.github.io/turbowarp-extension-data-editor/schemas/json-value',
    document: jsonValueSchema, artifact: {role: 'canonical-schema', source}},
  resources: [],
  provenance: {canonicalSources: [source], generatedFiles: [], referenceSchemas: [], generationSources: []}
});
