import {compileSchemaBundle} from './schema-engine.js';
import {snapshotJson, isJsonRecord} from './schema-json.js';
import {stringify} from 'yaml';
import {sameData} from './codec.js';
import {patchSource} from './source-document.js';
import {prepareSourceVariant} from './source-schema-hints.js';
import {mountSourceView} from './source-view.js';
import type {CompiledSchema, SchemaValidationContext} from './schema-types.js';
import type {PreparedEditorDefinition} from './prepared-types.js';
import type {SourceBinding, SourceDocument, SourceEditorOptions, SourceVariant} from './source-types.js';
import type {JsonObject, JsonValue, ValidationIssue} from './types.js';

export interface CapturedBinding<C> extends SourceBinding<C> {
  readonly validators: ReadonlyMap<string, CompiledSchema>;
  readonly presentationVariants: readonly SourceVariant[];
}
const keyFor = (format: string, variant: string): string => JSON.stringify([format, variant]);
const issue = (code: string, path?: string): ValidationIssue => ({message: `Source validation failed: ${code}.`, ...(path === undefined ? {} : {path})});
function drain(value: unknown): void {
  try {void Promise.prototype.then.call(value as Promise<unknown>, () => undefined, () => undefined);}
  catch { /* Synchronous callbacks never await arbitrary thenables. */ }
}
export function createSourceCandidate(format: 'json' | 'yaml', data: JsonValue): string {
  const value = snapshotJson(data);
  return format === 'json' ? JSON.stringify(value, null, 2) : '---\n' + stringify(value, {version: '1.2'});
}
export function patchDecodedSource(document: SourceDocument, data: JsonValue, decode?: (source: string) => SourceDocument): string {
  // Only an owner-accepted document reaches this path. Preserve outer whitespace
  // accepted by that owner without broadening the strict standalone JSON codec.
  if (document.format === 'json') {
    const body = document.source.trim();
    const start = document.source.length - document.source.trimStart().length;
    return document.source.slice(0, start) + patchSource(body, 'json', document.data as JsonValue, data) + document.source.slice(start + body.length);
  }
  let candidate = patchSource(document.source, document.format, document.data as JsonValue, data);
  if (decode && decode(candidate).format !== document.format) {
    // Auto-detecting owners must still see YAML after a root collection becomes empty.
    candidate = candidate.startsWith('\uFEFF') ? '\uFEFF---\n' + candidate.slice(1) : '---\n' + candidate;
  }
  return candidate;
}
export function readSourceDocument<C>(binding: SourceBinding<C>, source: string): SourceDocument {
  const output: unknown = binding.decode(source);
  try {
    const doc = snapshotJson(output) as unknown as SourceDocument;
    if (!isJsonRecord(doc) || doc.source !== source || (doc.format !== 'json' && doc.format !== 'yaml') ||
        typeof doc.variantId !== 'string' || !Object.hasOwn(doc, 'data')) throw new TypeError();
    return doc;
  } catch {drain(output);throw new TypeError('The source could not be decoded.');}
}
function entryFor(draft: JsonObject, argument: string): JsonObject {
  const entries = draft.sources;
  const entry = isJsonRecord(entries) && Object.hasOwn(entries, argument) ? entries[argument] : undefined;
  if (!isJsonRecord(entry) || typeof entry.source !== 'string' || (entry.mode !== 'source' && entry.mode !== 'form')) {
    throw new TypeError('Invalid source draft.');
  }
  return entry as JsonObject;
}
/** An additive path: legacy validate/createPatch deliberately refuse prepared definitions. */
export function createSourceEditor<C = null>(options: SourceEditorOptions<C>): PreparedEditorDefinition {
  const {apiVersion, extensionId, editorId, validationContext: provider} = options;
  if (apiVersion !== 1 || typeof provider !== 'function' || !Array.isArray(options.bindings) || !options.bindings.length) {
    throw new TypeError('Invalid source editor options.');
  }
  const inputBindings = options.bindings;
  const bindings: CapturedBinding<C>[] = [];
  const names = new Set<string>();
  for (let i = 0; i < inputBindings.length; i++) {
    const binding = inputBindings[i]!;
    const {argument, label, decode, validateSource} = binding;
    if (typeof argument !== 'string' || !argument || names.has(argument) || typeof decode !== 'function' ||
        typeof validateSource !== 'function' || (label !== undefined && typeof label !== 'string')) throw new TypeError('Invalid source binding.');
    names.add(argument);
    const variants = snapshotJson(binding.variants) as unknown as readonly SourceVariant[];
    if (!Array.isArray(variants) || !variants.length) throw new TypeError('Source variants are required.');
    const sourceOnlyVariants = snapshotJson(binding.sourceOnlyVariants ?? []) as unknown as NonNullable<SourceBinding<C>['sourceOnlyVariants']>;
    if (!Array.isArray(sourceOnlyVariants) || sourceOnlyVariants.some(v => !v || typeof v.variantId !== 'string' || (v.format !== 'json' && v.format !== 'yaml'))) throw new TypeError('Invalid source-only variants.');
    const validators = new Map<string, CompiledSchema>();
    for (const variant of variants) {
      if (!variant || typeof variant.variantId !== 'string' || (variant.format !== 'json' && variant.format !== 'yaml')) throw new TypeError('Invalid source variant.');
      const key = keyFor(variant.format, variant.variantId);
      if (validators.has(key)) throw new TypeError('Duplicate source variant.');
      const compiled = compileSchemaBundle(variant.schemaBundle);
      if (compiled.kind !== 'compiled') throw new TypeError(`Invalid source schema: ${compiled.diagnostics[0].code}.`);
      validators.set(key, compiled.validator);
    }
    bindings.push(Object.freeze({argument, ...(label === undefined ? {} : {label}), variants, decode, validateSource, sourceOnlyVariants, validators, presentationVariants: variants.map(prepareSourceVariant)}));
  }
  return Object.freeze<PreparedEditorDefinition>({
    apiVersion, extensionId, editorId, opcodes: Object.freeze([...options.opcodes]),
    editableArguments: Object.freeze([...names]), saveContract: 'prepared-source-v1' as const,
    read: snapshot => {
      const sources: JsonObject = {};
      for (const binding of bindings) {
        const slot = snapshot.arguments[binding.argument];
        if (slot?.kind !== 'literal' || typeof slot.value !== 'string') throw new TypeError('Source editors require literal string arguments.');
        let entry: JsonObject = {mode: 'source', source: slot.value};
        try {
          const doc = readSourceDocument(binding, slot.value);
          if (binding.validators.has(keyFor(doc.format, doc.variantId))) entry = {mode: 'form', source: slot.value, data: doc.data as JsonValue};
        } catch { /* Invalid raw data stays available for explicit repair in Source. */ }
        Object.defineProperty(sources, binding.argument, {value: entry, enumerable: true});
      }
      return {sources};
    },
    validate: () => [issue('prepared-host-required')],
    createPatch: () => {throw new TypeError('Prepared source editors require a compatible host.');},
    prepareSave: (draft, snapshot) => {
      const issues: ValidationIssue[] = [];
      const changes: {argument: string; value: string}[] = [];
      let context: SchemaValidationContext<C>;
      let raw: unknown;
      try {
        raw = provider();
        context = snapshotJson(raw) as unknown as SchemaValidationContext<C>;
        if (!isJsonRecord(context) || typeof context.consumerId !== 'string' || !context.consumerId ||
            typeof context.nowMs !== 'number' || !Number.isFinite(context.nowMs) || !Object.hasOwn(context, 'settings')) throw new TypeError();
      } catch {drain(raw);return {kind: 'invalid', issues: [issue('owner-context-invalid')]};}
      // Freeze the fresh context so one binding cannot alter validation of another binding.
      const freeze = (value: unknown): void => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {Object.values(value).forEach(freeze);Object.freeze(value);}
      };
      freeze(context);
      for (const binding of bindings) {
        const path = `/${binding.argument.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        try {
          const entry = entryFor(draft, binding.argument);
          if (entry.invalidForm === true) {issues.push(issue('form-value-invalid', path));continue;}
          const slot = snapshot.arguments[binding.argument];
          if (slot?.kind !== 'literal' || typeof slot.value !== 'string') throw new TypeError();
          let candidate = entry.source as string;
          if (entry.mode === 'form') {
            if (!Object.hasOwn(entry, 'data')) throw new TypeError();
            const data = snapshotJson(entry.data) as JsonValue;
            if (isJsonRecord(entry.creating)) {
              const {format, variantId} = entry.creating;
              if ((format !== 'json' && format !== 'yaml') || typeof variantId !== 'string' || !binding.validators.has(keyFor(format, variantId))) throw new TypeError();
              candidate = createSourceCandidate(format, data);
            } else {
              const original = readSourceDocument(binding, candidate);
              candidate = sameData(original.data as JsonValue, data) ? candidate : patchDecodedSource(original, data, source => readSourceDocument(binding, source));
            }
          }
          if (entry.sourceEdited !== true && candidate !== slot.value) {
            try {
              const opened = readSourceDocument(binding, slot.value);
              const final = readSourceDocument(binding, candidate);
              if (opened.format === final.format && opened.variantId === final.variantId && sameData(opened.data as JsonValue, final.data as JsonValue)) candidate = slot.value;
            } catch { /* A repaired original source is compared only when both versions decode. */ }
          }
          if (entry.mode === 'form' && !isJsonRecord(entry.creating)) {
            const original = readSourceDocument(binding, entry.source as string);
            const final = readSourceDocument(binding, candidate);
            if (original.format !== final.format || original.variantId !== final.variantId) {issues.push(issue('variant-change-requires-source', path));continue;}
          }
          // Source-bound owner validation sees exactly the string committed below, once.
          const rawResult: unknown = binding.validateSource(candidate, context);
          let validation;
          try {validation = snapshotJson(rawResult) as unknown as ReturnType<SourceBinding<C>['validateSource']>;}
          catch {drain(rawResult);throw new TypeError();}
          if (!isJsonRecord(validation) || validation.source !== candidate || !isJsonRecord(validation.result) ||
              !Array.isArray(validation.result.diagnostics)) throw new TypeError();
          if (validation.result.kind !== 'valid') {
            if (!['invalid', 'execution-error', 'schema-error'].includes(validation.result.kind)) throw new TypeError();
            issues.push(issue('owner-input-invalid', path));continue;
          }
          if (validation.result.diagnostics.length) throw new TypeError();
          // Empty/no-op variants can be accepted by the owner without inventing a form variant.
          const document = readSourceDocument(binding, candidate);
          if (isJsonRecord(entry.creating) && (document.format !== entry.creating.format || document.variantId !== entry.creating.variantId)) {issues.push(issue('variant-unrecognized', path));continue;}
          const validator = binding.validators.get(keyFor(document.format, document.variantId));
          if (validator) {
            const result = validator.validate(document.data, {consumerId: context.consumerId});
            if (result.kind !== 'valid') {issues.push(issue('schema-data-invalid', path));continue;}
          } else if (entry.mode === 'form' || (candidate !== slot.value && !binding.sourceOnlyVariants?.some(v => v.variantId === document.variantId && v.format === document.format))) {
            issues.push(issue('variant-unrecognized', path));continue;
          }
          if (candidate !== slot.value) changes.push(Object.freeze({argument: binding.argument, value: candidate}));
        } catch {issues.push(issue('source-invalid', path));}
      }
      return issues.length ? {kind: 'invalid', issues} : {kind: 'ready', changes};
    },
    mount: (container, context) => mountSourceView(container, context, bindings)
  });
}
