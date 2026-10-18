// Shared schema contracts. Engine and owner composition implementations are provided separately.

export interface ValidationIssue {
  readonly message: string;
  readonly path?: string;
}
export type NonEmpty<T> = readonly [T, ...T[]];
export type JsonPointer = '' | `/${string}`;
export type SchemaDialect = 'draft-07' | '2020-12';
export type SchemaJsonValue =
  | null | string | number | boolean
  | readonly SchemaJsonValue[]
  | {readonly [key: string]: SchemaJsonValue};
export type SchemaJsonObject = {readonly [key: string]: SchemaJsonValue};
export type SchemaDocument = boolean | SchemaJsonObject;
export type JsonSettings<T> =
  T extends null | string | number | boolean ? T
  : T extends (...args: never[]) => unknown ? never
  : T extends abstract new (...args: never[]) => unknown ? never
  : T extends readonly unknown[] ? {readonly [K in keyof T]: JsonSettings<T[K]>}
  : T extends object ? {readonly [K in keyof T]: JsonSettings<T[K]>}
  : never;

export interface SchemaIdentity {
  readonly ownerId: string;
  readonly contractId: string;
  readonly revision: string;
  readonly variantId: string;
}
export interface SchemaSourceReference {
  readonly repository: string;
  readonly path: string;
  readonly symbol?: string;
  readonly version?: string;
  readonly sha256?: string;
}
export interface SchemaProvenance {
  readonly canonicalSources: NonEmpty<SchemaSourceReference>;
  readonly generatedFiles: readonly SchemaSourceReference[];
  readonly referenceSchemas: readonly SchemaSourceReference[];
  readonly generationSources: readonly SchemaSourceReference[];
}
export type SchemaArtifact =
  | {readonly role: 'canonical-schema'; readonly source: SchemaSourceReference}
  | {readonly role: 'generated-schema'; readonly source: SchemaSourceReference;
     readonly generatedFrom: NonEmpty<SchemaSourceReference>};
export interface SchemaResource {
  readonly retrievalUri: string;
  readonly document: SchemaDocument;
  readonly artifact: SchemaArtifact;
}
export interface SchemaBundle {
  readonly identity: SchemaIdentity;
  readonly dialect: SchemaDialect;
  readonly root: SchemaResource;
  readonly resources: readonly SchemaResource[];
  readonly provenance: SchemaProvenance;
}

export interface SchemaDiagnosticScope {
  readonly identity: SchemaIdentity;
  readonly consumerId?: string;
}
export interface SchemaDiagnosticBase {
  readonly scope: SchemaDiagnosticScope;
  readonly resourceUri?: string;
  readonly schemaPath?: JsonPointer;
}
export type CompileDiagnosticCode =
  | 'dialect-required' | 'dialect-unsupported' | 'dialect-conflict'
  | 'resource-invalid' | 'resource-id-conflict' | 'ref-unresolved'
  | 'schema-invalid' | 'artifact-role-invalid';
export type CompileDiagnostic = SchemaDiagnosticBase & {
  readonly phase: 'compile';
  readonly code: CompileDiagnosticCode;
};
export type InputDiagnostic = SchemaDiagnosticBase & (
  | {readonly phase: 'decode';
     readonly code: 'input-format-invalid' | 'variant-unrecognized';
     readonly dataPath: JsonPointer}
  | {readonly phase: 'structure';
     readonly code: 'input-not-json' | 'schema-data-invalid';
     readonly dataPath: JsonPointer; readonly keyword?: string}
  | {readonly phase: 'semantic'; readonly code: 'owner-input-invalid';
     readonly dataPath: JsonPointer; readonly ruleId: string}
);
export type CompileExecutionDiagnostic = SchemaDiagnosticBase & {
  readonly phase: 'execution'; readonly operation: 'compile';
  readonly code: 'engine-failed' | 'limit-exceeded';
};
export type DecodeExecutionDiagnostic = SchemaDiagnosticBase & {
  readonly phase: 'execution'; readonly operation: 'decode';
  readonly code: 'engine-failed' | 'limit-exceeded';
};
export type StructuralExecutionDiagnostic = SchemaDiagnosticBase & {
  readonly phase: 'execution'; readonly operation: 'structure';
  readonly code: 'engine-failed' | 'limit-exceeded';
};
export type OwnerExecutionDiagnostic = SchemaDiagnosticBase & {
  readonly phase: 'execution'; readonly operation: 'semantic';
  readonly code: 'owner-validation-failed' | 'owner-context-invalid'
    | 'async-owner-unsupported' | 'owner-result-invalid'
    | 'engine-failed' | 'limit-exceeded';
};
export type ExecutionDiagnostic = CompileExecutionDiagnostic | DecodeExecutionDiagnostic
  | StructuralExecutionDiagnostic | OwnerExecutionDiagnostic;
export type ValidationExecutionDiagnostic = DecodeExecutionDiagnostic
  | StructuralExecutionDiagnostic | OwnerExecutionDiagnostic;
export type SchemaDiagnostic = CompileDiagnostic | InputDiagnostic | ExecutionDiagnostic;
export type SchemaValidationResult<
  D extends InputDiagnostic = InputDiagnostic,
  E extends ValidationExecutionDiagnostic = ValidationExecutionDiagnostic
> =
  | {readonly kind: 'valid'; readonly diagnostics: readonly []}
  | {readonly kind: 'invalid'; readonly diagnostics: NonEmpty<D>}
  | {readonly kind: 'execution-error'; readonly diagnostics: NonEmpty<E>};
export type StructuralValidationResult = SchemaValidationResult<
  Extract<InputDiagnostic, {phase: 'structure'}>, StructuralExecutionDiagnostic
>;
export type SchemaInputValidationResult = SchemaValidationResult<
  Extract<InputDiagnostic, {phase: 'structure' | 'semantic'}>,
  StructuralExecutionDiagnostic | OwnerExecutionDiagnostic
>;
export interface CompiledSchema {
  readonly identity: SchemaIdentity;
  readonly dialect: SchemaDialect;
  readonly validate: (data: SchemaJsonValue, context?: {readonly consumerId: string}) =>
    StructuralValidationResult;
}
export type SchemaCompileResult =
  | {readonly kind: 'compiled'; readonly validator: CompiledSchema;
     readonly diagnostics: readonly []}
  | {readonly kind: 'schema-error'; readonly diagnostics: NonEmpty<CompileDiagnostic>}
  | {readonly kind: 'execution-error'; readonly diagnostics: NonEmpty<CompileExecutionDiagnostic>};

export interface SchemaValidationContext<C = null> {
  readonly consumerId: string;
  readonly nowMs: number;
  readonly settings: JsonSettings<C>;
}
export interface OwnerInputIssue {
  readonly dataPath: JsonPointer;
  readonly ruleId: string;
}
export type OwnerValidationResult =
  | {readonly kind: 'valid'; readonly issues: readonly []}
  | {readonly kind: 'invalid'; readonly issues: NonEmpty<OwnerInputIssue>};
export type SyncOwnerValidator<C = null> = (
  data: SchemaJsonValue,
  context: SchemaValidationContext<C>
) => OwnerValidationResult;
