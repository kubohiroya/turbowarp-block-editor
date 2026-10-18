import type {SchemaBundle, SchemaJsonObject, SchemaJsonValue, SchemaValidationContext} from './schema-types.js';

/** Source strings remain authoritative; decoded values are only an editing view. */
export interface SourceDocument {
  readonly source: string;
  readonly format: 'json' | 'yaml';
  readonly variantId: string;
  readonly data: SchemaJsonValue;
}
export interface SourceVariant {
  readonly variantId: string;
  readonly format: 'json' | 'yaml';
  readonly schemaBundle: SchemaBundle;
  readonly uiSchema?: SchemaJsonObject;
}
export interface SourceValidation {
  readonly source: string;
  readonly result:
    | {readonly kind: 'valid'; readonly diagnostics: readonly []}
    | {readonly kind: 'invalid' | 'execution-error' | 'schema-error';
       readonly diagnostics: readonly {readonly code: string; readonly dataPath?: string}[]};
}
export interface SourceBinding<C = null> {
  readonly argument: string;
  readonly label?: string;
  readonly variants: readonly SourceVariant[];
  /** Explicit owner-defined source-only cases, for example a valid empty scene. */
  readonly sourceOnlyVariants?: readonly {readonly variantId: string; readonly format: 'json' | 'yaml'}[];
  decode(source: string): SourceDocument;
  validateSource(source: string, context: SchemaValidationContext<C>): SourceValidation;
}
export interface SourceEditorOptions<C = null> {
  readonly apiVersion: 1;
  readonly extensionId: string;
  readonly editorId: string;
  readonly opcodes: readonly string[];
  readonly bindings: readonly SourceBinding<C>[];
  readonly validationContext: () => SchemaValidationContext<C>;
}
