import {compileSchemaBundle, toValidationIssues} from '@kubohiroya/turbowarp-extension-data-editor/schema';
import type {
  ValidationIssue, NonEmpty, JsonPointer, SchemaDialect, SchemaJsonValue, SchemaJsonObject,
  SchemaDocument, JsonSettings, SchemaIdentity, SchemaSourceReference, SchemaProvenance,
  SchemaArtifact, SchemaResource, SchemaBundle, SchemaDiagnosticScope, SchemaDiagnosticBase,
  CompileDiagnosticCode, CompileDiagnostic, InputDiagnostic, CompileExecutionDiagnostic,
  DecodeExecutionDiagnostic, StructuralExecutionDiagnostic, OwnerExecutionDiagnostic,
  ExecutionDiagnostic, ValidationExecutionDiagnostic, SchemaDiagnostic, SchemaValidationResult,
  StructuralValidationResult, SchemaInputValidationResult, CompiledSchema, SchemaCompileResult,
  SchemaValidationContext, OwnerInputIssue, OwnerValidationResult, SyncOwnerValidator
} from '@kubohiroya/turbowarp-extension-data-editor/schema';

export const identity: SchemaIdentity = {ownerId: 'owner', contractId: 'tree', revision: '1', variantId: 'default'};
export const source: SchemaSourceReference = {repository: 'owner', path: 'src/contracts.ts', symbol: 'Tree'};
export const generated: SchemaSourceReference = {repository: 'owner', path: 'schemas/tree.json', sha256: 'hash'};
export const provenance: SchemaProvenance = {
  canonicalSources: [source], generatedFiles: [generated], referenceSchemas: [], generationSources: []
};
export const document: SchemaDocument = {$id: 'https://example.invalid/tree', type: 'object',
  properties: {children: {type: 'array', items: {$ref: '#'}}}};
export const booleanDocument: SchemaDocument = false;
export const object: SchemaJsonObject = {values: [null, true, 'value', 1, {nested: false}]};
export const data: SchemaJsonValue[] = [null, true, 1, 'scalar', [1], object];
export const artifact: SchemaArtifact = {role: 'generated-schema', source: generated, generatedFrom: [source]};
export const resource: SchemaResource = {retrievalUri: 'https://example.invalid/tree', document, artifact};
export const bundle: SchemaBundle = {identity, dialect: 'draft-07', root: resource, resources: [], provenance};
export const otherDialect: SchemaDialect = '2020-12';
export const manual: SchemaArtifact = {role: 'canonical-schema', source};
export const pointer: JsonPointer = '/a~1b/~0key';
export const scope: SchemaDiagnosticScope = {identity, consumerId: 'consumer'};
export const base: SchemaDiagnosticBase = {scope, resourceUri: resource.retrievalUri, schemaPath: '/type'};
export const compileCode: CompileDiagnosticCode = 'ref-unresolved';
export const compileDiagnostic: CompileDiagnostic = {...base, phase: 'compile', code: compileCode};
export const decode: InputDiagnostic = {scope, phase: 'decode', code: 'variant-unrecognized', dataPath: ''};
export const structural: InputDiagnostic = {scope, phase: 'structure', code: 'schema-data-invalid', dataPath: pointer};
export const semantic: InputDiagnostic = {scope, phase: 'semantic', code: 'owner-input-invalid', dataPath: '', ruleId: 'fixed'};
export const nonempty: NonEmpty<InputDiagnostic> = [decode, structural, semantic];
export const issues: readonly ValidationIssue[] = toValidationIssues(nonempty);
export const compileFailure: CompileExecutionDiagnostic = {scope, phase: 'execution', operation: 'compile', code: 'engine-failed'};
export const decodeFailure: DecodeExecutionDiagnostic = {scope, phase: 'execution', operation: 'decode', code: 'limit-exceeded'};
export const structuralFailure: StructuralExecutionDiagnostic = {scope, phase: 'execution', operation: 'structure', code: 'engine-failed'};
export const ownerFailure: OwnerExecutionDiagnostic = {scope, phase: 'execution', operation: 'semantic', code: 'owner-context-invalid'};
export const execution: ExecutionDiagnostic[] = [compileFailure, decodeFailure, structuralFailure, ownerFailure];
export const validationExecution: ValidationExecutionDiagnostic[] = [decodeFailure, structuralFailure, ownerFailure];
export const diagnostics: SchemaDiagnostic[] = [compileDiagnostic, ...nonempty, ...execution];
export const genericResult: SchemaValidationResult = {kind: 'invalid', diagnostics: [decode]};
export const structuralResult: StructuralValidationResult = {kind: 'invalid', diagnostics: [structural]};
export const inputResult: SchemaInputValidationResult = {kind: 'invalid', diagnostics: [semantic]};
export const compiled: CompiledSchema = {identity, dialect: 'draft-07', validate: () => ({kind: 'valid', diagnostics: []})};
export const compileResult: SchemaCompileResult = {kind: 'compiled', validator: compiled, diagnostics: []};
export const schemaError: SchemaCompileResult = {kind: 'schema-error', diagnostics: [compileDiagnostic]};
export const compileError: SchemaCompileResult = {kind: 'execution-error', diagnostics: [compileFailure]};
export const structuralError: StructuralValidationResult = {kind: 'execution-error', diagnostics: [structuralFailure]};
export const inputError: SchemaInputValidationResult = {kind: 'execution-error', diagnostics: [ownerFailure]};
export const ownerIssue: OwnerInputIssue = {dataPath: '', ruleId: 'fixed'};
export const ownerInvalid: OwnerValidationResult = {kind: 'invalid', issues: [ownerIssue]};

interface Settings {delegate: boolean; nested?: {modes: string[]}; pair: [number, string?];}
type Alias = {readonly mode: 'first'; values: number[]} | {readonly mode: 'second'; value: string};
export const context: SchemaValidationContext<Settings> = {
  consumerId: 'consumer', nowMs: 0, settings: {delegate: true, nested: {modes: ['a']}, pair: [1]}
};
export const alias: JsonSettings<Alias> = {mode: 'first', values: [1]};
export const owner: SyncOwnerValidator<Settings> = (_data, context) =>
  context.settings.delegate ? {kind: 'valid', issues: []} : ownerInvalid;
export const nullSettings: SchemaValidationContext = {consumerId: 'consumer', nowMs: 0, settings: null};

// This signature describes the later composition API; S1-1 must not export its implementation.
declare function validateSchemaInput<C>(compiled: CompiledSchema, data: SchemaJsonValue, options: {
  readonly context: SchemaValidationContext<C>; readonly ownerValidate?: SyncOwnerValidator<C>;
}): SchemaInputValidationResult;
export const inferred = validateSchemaInput(compiled, object, {context, ownerValidate: owner});
export const explicit = validateSchemaInput<Settings>(compiled, object, {context, ownerValidate: owner});
export const inline = validateSchemaInput(compiled, object, {
  context: {consumerId: 'consumer', nowMs: 0, settings: {delegate: true}},
  ownerValidate: (_data, c) => c.settings.delegate ? {kind: 'valid', issues: []} : ownerInvalid
});

// Negative fixtures must fail at the public package boundary.
// @ts-expect-error Unsupported dialect.
export const badDialect: SchemaDialect = 'draft-04';
// @ts-expect-error Reference-only schemas cannot be active artifacts.
export const referenceArtifact: SchemaArtifact = {role: 'reference-schema', source};
// @ts-expect-error Generated files require a canonical source.
export const emptyGeneratedFrom: SchemaArtifact = {role: 'generated-schema', source: generated, generatedFrom: []};
// @ts-expect-error A string is not a schema document.
export const badDocument: SchemaDocument = 'schema';
// @ts-expect-error This boundary only accepts JSON-compatible data.
export const badData: SchemaJsonValue = 1n;
// @ts-expect-error Failure diagnostics must not be empty.
export const emptyFailure: StructuralValidationResult = {kind: 'invalid', diagnostics: []};
// @ts-expect-error Success cannot carry failure diagnostics.
export const mixedSuccess: SchemaCompileResult = {kind: 'compiled', validator: compiled, diagnostics: [compileDiagnostic]};
// @ts-expect-error Compiler results cannot carry owner execution failures.
export const badCompile: SchemaCompileResult = {kind: 'execution-error', diagnostics: [ownerFailure]};
// @ts-expect-error Owner codes cannot use the compile operation.
export const badCompileCode: CompileExecutionDiagnostic = {scope, phase: 'execution', operation: 'compile', code: 'async-owner-unsupported'};
// @ts-expect-error Structural results cannot carry compile execution failures.
export const badStructuralCompile: StructuralValidationResult = {kind: 'execution-error', diagnostics: [compileFailure]};
// @ts-expect-error Structural results cannot carry decode execution failures.
export const badStructuralDecode: StructuralValidationResult = {kind: 'execution-error', diagnostics: [decodeFailure]};
// @ts-expect-error Structural results cannot carry owner execution failures.
export const badStructuralOwner: StructuralValidationResult = {kind: 'execution-error', diagnostics: [ownerFailure]};
// @ts-expect-error Structural results cannot carry semantic input failures.
export const badStructuralInput: StructuralValidationResult = {kind: 'invalid', diagnostics: [semantic]};
// @ts-expect-error Input composition does not decode source text.
export const badInputDecode: SchemaInputValidationResult = {kind: 'invalid', diagnostics: [decode]};
// @ts-expect-error Input composition cannot carry compile execution failures.
export const badInputCompile: SchemaInputValidationResult = {kind: 'execution-error', diagnostics: [compileFailure]};
// @ts-expect-error Even generic validation results cannot include compile execution failures.
export type BadGeneric = SchemaValidationResult<InputDiagnostic, CompileExecutionDiagnostic>;
// @ts-expect-error Only synchronous owner validators are supported.
export const asyncOwner: SyncOwnerValidator = async () => ({kind: 'valid', issues: []});
// @ts-expect-error Input conversion does not accept compile diagnostics.
toValidationIssues([compileDiagnostic]);
// @ts-expect-error Input conversion does not accept execution diagnostics.
toValidationIssues([ownerFailure]);
// @ts-expect-error A JSON Pointer must be empty or start with slash.
export const dotPath: JsonPointer = '.label';
// @ts-expect-error Settings properties are deeply readonly.
context.settings.delegate = false;
// @ts-expect-error Arrays in settings are readonly.
context.settings.nested?.modes.push('b');
// @ts-expect-error Known functions are not settings values.
export const functionSettings: SchemaValidationContext<{f: () => number}> = {consumerId: 'c', nowMs: 0, settings: {f: () => 1}};
declare class Constructor {}
// @ts-expect-error Known constructors are not settings values.
export const constructorSettings: SchemaValidationContext<{ctor: typeof Constructor}> = {consumerId: 'c', nowMs: 0, settings: {ctor: Constructor}};
// @ts-expect-error Known bigint values are not settings values.
export const bigintSettings: SchemaValidationContext<{n: bigint}> = {consumerId: 'c', nowMs: 0, settings: {n: 1n}};
// @ts-expect-error Known symbols are not settings values.
export const symbolSettings: SchemaValidationContext<{n: symbol}> = {consumerId: 'c', nowMs: 0, settings: {n: Symbol()}};
// @ts-expect-error An optional property can be omitted but cannot contain explicit undefined.
export const undefinedSettings: SchemaValidationContext<{n?: string}> = {consumerId: 'c', nowMs: 0, settings: {n: undefined}};
// @ts-expect-error An optional tuple element cannot contain explicit undefined.
export const undefinedTuple: SchemaValidationContext<Settings> = {consumerId: 'c', nowMs: 0, settings: {delegate: true, pair: [1, undefined]}};
// @ts-expect-error Generic inference must not admit functions into settings.
validateSchemaInput(compiled, object, {context: {consumerId: 'c', nowMs: 0, settings: {f: () => 1}}});
export const checkedBundle: SchemaCompileResult = compileSchemaBundle(bundle);
// @ts-expect-error The composition implementation is not exported in S1-1.
import {validateSchemaInput as unpublishedComposition} from '@kubohiroya/turbowarp-extension-data-editor/schema';
