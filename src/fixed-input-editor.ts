import {compileSchemaBundle} from './schema-engine.js';
import {isJsonRecord, snapshotJson} from './schema-json.js';
import {isLiteral} from './data.js';
import {parseFixedNumberInput} from './fixed-input-schema.js';
import {captureFixedInputDeclaration} from './fixed-input-snapshot.js';
import type {FixedBlockSnapshot, FixedInputDeclaration, FixedInputEditorDefinition, FixedPreparedSave} from './fixed-input-types.js';
import type {CompiledSchema, SchemaBundle, SchemaValidationContext} from './schema-types.js';
import type {EditorDefinition, JsonObject, JsonValue, LiteralArgumentChange, LiteralValue, ValidationIssue} from './types.js';

export interface FixedInputBinding<C = null> {
  readonly argument: string;
  readonly schemaBundle: SchemaBundle;
  /** Produce a JSON editing projection. Throw to retain the raw literal as readonly. */
  read(value: LiteralValue): JsonValue;
  /** Construct the exact literal candidate once. A numeric buffer supplies its validated string token, which must be returned unchanged. Neither this nor validation may be asynchronous. */
  encode(value: JsonValue, context: SchemaValidationContext<C>): LiteralValue;
  /** Check the exact candidate. Messages from this callback are never rendered verbatim. */
  validateCandidate(candidate: LiteralValue, context: SchemaValidationContext<C>, snapshot: FixedBlockSnapshot): readonly ValidationIssue[];
}
export interface FixedInputEditorOptions<C = null> {
  readonly apiVersion: 1;
  readonly extensionId: string;
  readonly editorId: string;
  readonly opcodes: readonly string[];
  readonly contractId: string;
  readonly contractRevision: string;
  readonly readOnlyArguments?: readonly string[];
  readonly dependencies?: FixedInputDeclaration['dependencies'];
  readonly bindings: readonly FixedInputBinding<C>[];
  readonly validationContext: () => SchemaValidationContext<C>;
}
function fixedDeclarationError(): never {throw new TypeError('Invalid fixed editor declaration.');}
function plainDeclaration(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
      Object.getOwnPropertySymbols(value).length) fixedDeclarationError();
}
/** Callback-bearing declarations cannot be JSON-copied as a whole. Read own data only. */
function ownData(value: unknown, key: string, optional = false): unknown {
  if (!value || typeof value !== 'object') return fixedDeclarationError();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {if (optional) return undefined;return fixedDeclarationError();}
  if (!('value' in descriptor)) return fixedDeclarationError();
  return descriptor.value;
}
function declarationText(value: unknown): string {
  if (typeof value !== 'string' || !value) return fixedDeclarationError();
  return value;
}
/** Capture callback-bearing array elements by index, without running input iterators. */
function declarationArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length) return fixedDeclarationError();
  const length = ownData(value, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 100_000) return fixedDeclarationError();
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) return fixedDeclarationError();
  }
  const items: unknown[] = [];
  for (let i = 0; i < length; i++) items.push(ownData(value, String(i)));
  return Object.freeze(items);
}
function declarationJson(value: unknown): ReturnType<typeof snapshotJson> {
  try {return snapshotJson(value);} catch {return fixedDeclarationError();}
}
function fixedDeclaration(value: FixedInputDeclaration): FixedInputDeclaration {
  try {return captureFixedInputDeclaration(value);} catch {return fixedDeclarationError();}
}
function captureOpcodes(value: unknown, extensionId: string): readonly string[] {
  const items = declarationJson(value);
  if (!Array.isArray(items) || !items.length || items.some(opcode => typeof opcode !== 'string' ||
      !opcode.startsWith(`${extensionId}_`) || opcode === `${extensionId}_`) || new Set(items).size !== items.length) return fixedDeclarationError();
  return Object.freeze(items as string[]);
}
/** Capture exactly the callbacks and declaration values subsequently registered. */
export function captureFixedInputEditorDefinition<C = null>(value: FixedInputEditorDefinition<C>): FixedInputEditorDefinition<C> {
  plainDeclaration(value);
  const apiVersion = ownData(value, 'apiVersion');
  const extensionId = declarationText(ownData(value, 'extensionId'));
  const editorId = declarationText(ownData(value, 'editorId'));
  const saveContract = ownData(value, 'saveContract');
  if (apiVersion !== 1 || saveContract !== 'prepared-fixed-v1') return fixedDeclarationError();
  const opcodes = captureOpcodes(ownData(value, 'opcodes'), extensionId);
  const declaration = fixedDeclaration({
    contractId: declarationText(ownData(value, 'contractId')), contractRevision: declarationText(ownData(value, 'contractRevision')),
    editableArguments: ownData(value, 'editableArguments') as readonly string[],
    readOnlyArguments: ownData(value, 'readOnlyArguments') as readonly string[],
    dependencies: ownData(value, 'dependencies') as FixedInputDeclaration['dependencies']
  });
  const read = ownData(value, 'read');
  const validate = ownData(value, 'validate');
  const createPatch = ownData(value, 'createPatch');
  const readFixed = ownData(value, 'readFixed');
  const prepareFixedSave = ownData(value, 'prepareFixedSave');
  const mount = ownData(value, 'mount', true);
  if (typeof read !== 'function' || typeof validate !== 'function' || typeof createPatch !== 'function' ||
      typeof readFixed !== 'function' || typeof prepareFixedSave !== 'function' ||
      (mount !== undefined && typeof mount !== 'function')) return fixedDeclarationError();
  return Object.freeze({apiVersion, extensionId, editorId, opcodes, saveContract, ...declaration,
    read: read as EditorDefinition['read'], validate: validate as EditorDefinition['validate'], createPatch: createPatch as EditorDefinition['createPatch'],
    readFixed: readFixed as FixedInputEditorDefinition<C>['readFixed'], prepareFixedSave: prepareFixedSave as FixedInputEditorDefinition<C>['prepareFixedSave'],
    ...(mount === undefined ? {} : {mount: mount as NonNullable<EditorDefinition['mount']>})});
}
function drain(value: unknown): void {
  try {void Promise.prototype.then.call(value as Promise<unknown>, () => undefined, () => undefined);}
  catch { /* Reject arbitrary thenables without invoking then. */ }
}
function copySync(value: unknown): ReturnType<typeof snapshotJson> {
  try {return snapshotJson(value);} catch (error) {drain(value);throw error;}
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
}
function sameProjection(left: JsonValue, right: JsonValue): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameProjection(value, right[index]!));
  }
  const names = Object.keys(left);
  return names.length === Object.keys(right).length && names.every(name => Object.hasOwn(right, name) && sameProjection(left[name]!, right[name]!));
}
const pointer = (name: string): string => `/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`;
export function isFixedInputEditor(definition: EditorDefinition): definition is FixedInputEditorDefinition<unknown> {
  return (definition as Partial<FixedInputEditorDefinition<unknown>>).saveContract === 'prepared-fixed-v1';
}
/** Capture a synchronous callback result without invoking getters, iterators, or toJSON. */
export function captureFixedPreparedSave<C = null>(definition: FixedInputEditorDefinition<C>, draft: JsonObject,
  snapshot: FixedBlockSnapshot): FixedPreparedSave<C> {
  const value = copySync(definition.prepareFixedSave(draft, snapshot));
  if (!isJsonRecord(value)) throw new TypeError('Invalid fixed prepared save.');
  if (value.kind === 'invalid' && Array.isArray(value.issues) && value.issues.length > 0) {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < value.issues.length; i++) {
      const issue = value.issues[i];
      if (!isJsonRecord(issue) || typeof issue.message !== 'string' || (issue.path !== undefined && typeof issue.path !== 'string')) throw new TypeError('Invalid fixed issue.');
      issues.push(Object.freeze({message: issue.message, ...(issue.path === undefined ? {} : {path: issue.path})}));
    }
    return Object.freeze({kind: 'invalid', issues: Object.freeze(issues)});
  }
  if (value.kind !== 'ready' || !Array.isArray(value.changes) || !isJsonRecord(value.context) ||
      typeof value.context.consumerId !== 'string' || !value.context.consumerId ||
      typeof value.context.nowMs !== 'number' || !Number.isFinite(value.context.nowMs) || !Object.hasOwn(value.context, 'settings')) throw new TypeError('Invalid fixed prepared save.');
  const changes: LiteralArgumentChange[] = [];
  for (let i = 0; i < value.changes.length; i++) {
    const change = value.changes[i];
    if (!isJsonRecord(change) || typeof change.argument !== 'string' || !isLiteral(change.value)) throw new TypeError('Invalid fixed change.');
    changes.push(Object.freeze({argument: change.argument, value: change.value}));
  }
  freeze(value.context);
  return Object.freeze({kind: 'ready', changes: Object.freeze(changes), context: value.context as unknown as SchemaValidationContext<C>});
}

/** Fixed inputs are additive: legacy callbacks cannot accidentally save their drafts. */
export function createFixedInputEditor<C = null>(options: FixedInputEditorOptions<C>): FixedInputEditorDefinition<C> {
  plainDeclaration(options);
  const apiVersion = ownData(options, 'apiVersion');
  const extensionId = declarationText(ownData(options, 'extensionId'));
  const editorId = declarationText(ownData(options, 'editorId'));
  const contractId = declarationText(ownData(options, 'contractId'));
  const contractRevision = declarationText(ownData(options, 'contractRevision'));
  const contextProvider = ownData(options, 'validationContext');
  const opcodes = captureOpcodes(ownData(options, 'opcodes'), extensionId);
  const inputBindings = declarationArray(ownData(options, 'bindings'));
  const readOnlyArguments = ownData(options, 'readOnlyArguments', true);
  const dependencies = ownData(options, 'dependencies', true);
  if (apiVersion !== 1 || !inputBindings.length || typeof contextProvider !== 'function') throw new TypeError('Invalid fixed editor options.');
  const provider = contextProvider as FixedInputEditorOptions<C>['validationContext'];
  const bindings: {argument: string; read: FixedInputBinding<C>['read']; encode: FixedInputBinding<C>['encode']; validateCandidate: FixedInputBinding<C>['validateCandidate']; validator: CompiledSchema}[] = [];
  for (let i = 0; i < inputBindings.length; i++) {
    const binding = inputBindings[i];plainDeclaration(binding);
    const argument = declarationText(ownData(binding, 'argument'));
    const read = ownData(binding, 'read');
    const encode = ownData(binding, 'encode');
    const validateCandidate = ownData(binding, 'validateCandidate');
    const schemaBundle = declarationJson(ownData(binding, 'schemaBundle')) as unknown as SchemaBundle;
    if (typeof read !== 'function' || typeof encode !== 'function' || typeof validateCandidate !== 'function') throw new TypeError('Invalid fixed binding callbacks.');
    const result = compileSchemaBundle(schemaBundle);
    if (result.kind !== 'compiled') throw new TypeError('Invalid fixed input schema.');
    bindings.push(Object.freeze({argument, read: read as FixedInputBinding<C>['read'], encode: encode as FixedInputBinding<C>['encode'],
      validateCandidate: validateCandidate as FixedInputBinding<C>['validateCandidate'], validator: result.validator}));
  }
  const declaration = fixedDeclaration({contractId, contractRevision,
    editableArguments: bindings.map(binding => binding.argument), readOnlyArguments: (readOnlyArguments ?? []) as readonly string[],
    dependencies: (dependencies ?? []) as FixedInputDeclaration['dependencies']});
  const diagnostic = (code: string, argument?: string): ValidationIssue => Object.freeze({
    message: `Fixed input validation failed: ${code}; contract=${JSON.stringify(contractId)}${argument === undefined ? '' : `; argument=${JSON.stringify(argument)}`}.`,
    ...(argument === undefined ? {} : {path: pointer(argument)})
  });
  const project = (binding: typeof bindings[number], snapshot: FixedBlockSnapshot): JsonObject => {
    const slot = Object.hasOwn(snapshot.arguments, binding.argument) ? snapshot.arguments[binding.argument] : undefined;
    const metadata = snapshot.fixedContext.inputs[binding.argument];
    if (slot?.kind !== 'literal' || metadata?.role !== 'editable' || (metadata.source !== 'field' && metadata.source !== 'shadow')) return {readOnly: true};
    try {return {value: copySync(binding.read(slot.value)) as JsonValue, changed: false};}
    catch {return {readOnly: true};}
  };
  return Object.freeze({
    apiVersion, extensionId, editorId, opcodes, ...declaration,
    saveContract: 'prepared-fixed-v1' as const,
    read: () => {throw new TypeError('Fixed editors require a compatible host.');},
    validate: () => [diagnostic('fixed-host-required')],
    createPatch: () => {throw new TypeError('Fixed editors require a compatible host.');},
    readFixed: (snapshot: FixedBlockSnapshot) => {
      const inputs: JsonObject = {};
      for (const binding of bindings) Object.defineProperty(inputs, binding.argument, {value: project(binding, snapshot), enumerable: true});
      return {inputs};
    },
    prepareFixedSave: (draft: JsonObject, snapshot: FixedBlockSnapshot): FixedPreparedSave<C> => {
      const issues: ValidationIssue[] = [];
      const changes: LiteralArgumentChange[] = [];
      let context: SchemaValidationContext<C>;
      try {
        const value = copySync(provider());
        if (!isJsonRecord(value) || typeof value.consumerId !== 'string' || !value.consumerId || typeof value.nowMs !== 'number' || !Number.isFinite(value.nowMs) || !Object.hasOwn(value, 'settings')) throw new TypeError();
        freeze(value);context = value as unknown as SchemaValidationContext<C>;
      } catch {return {kind: 'invalid', issues: [diagnostic('owner-context-invalid')]};}
      for (const binding of bindings) {
        const {argument} = binding;
        try {
          const original = project(binding, snapshot);
          const entry = isJsonRecord(draft.inputs) && Object.hasOwn(draft.inputs, argument) ? draft.inputs[argument] : undefined;
          if (!isJsonRecord(entry)) throw new TypeError();
          if (original.readOnly === true) {
            if (sameProjection(original, entry as JsonObject)) continue;
            const metadata = snapshot.fixedContext.inputs[argument];
            if (entry.repair !== true || snapshot.arguments[argument]?.kind !== 'literal' || metadata?.role !== 'editable' ||
                (metadata.source !== 'field' && metadata?.source !== 'shadow')) throw new TypeError();
          }
          if (!Object.hasOwn(entry, 'value') || typeof entry.changed !== 'boolean' || entry.readOnly === true) throw new TypeError();
          let value = copySync(entry.value) as JsonValue;
          let token: string | undefined;
          if (Object.hasOwn(entry, 'buffer')) {
            if (!entry.changed || typeof entry.buffer !== 'string') throw new TypeError();
            const parsed = parseFixedNumberInput(entry.buffer);
            if (parsed.kind !== 'valid' || typeof value !== 'number' || !Object.is(parsed.value, value)) throw new TypeError();
            token = parsed.token;value = token;
          }
          if (token === undefined && original.readOnly !== true && sameProjection(original.value!, value)) continue;
          if (!entry.changed) throw new TypeError();
          if (declaration.dependencies.some(group => group.selector === argument || group.dependents.includes(argument))) {
            issues.push(diagnostic('fixed-dependency-validation-unavailable', argument));continue;
          }
          const raw: unknown = binding.encode(value, context);
          if (!isLiteral(raw)) {drain(raw);throw new TypeError();}
          const candidate = raw;
          if (token !== undefined && candidate !== token) throw new TypeError();
          const projectedCandidate = copySync(binding.read(candidate));
          const validation = binding.validator.validate(projectedCandidate, {consumerId: context.consumerId});
          if (validation.kind !== 'valid') {issues.push(diagnostic('schema-data-invalid', argument));continue;}
          const owner = copySync(binding.validateCandidate(candidate, context, snapshot));
          if (!Array.isArray(owner)) throw new TypeError();
          for (let i = 0; i < owner.length; i++) {
            const issue = owner[i];
            if (!isJsonRecord(issue) || typeof issue.message !== 'string' || (issue.path !== undefined && typeof issue.path !== 'string')) throw new TypeError();
          }
          if (owner.length) {issues.push(diagnostic('owner-input-invalid', argument));continue;}
          const slot = snapshot.arguments[argument];
          if (slot?.kind !== 'literal') throw new TypeError();
          if (!Object.is(candidate, slot.value)) changes.push(Object.freeze({argument, value: candidate}));
        } catch {issues.push(diagnostic('fixed-input-invalid', argument));}
      }
      return issues.length ? {kind: 'invalid', issues} : {kind: 'ready', changes, context};
    }
  });
}
