import type {CompiledSchema, InputDiagnostic, SchemaDiagnosticScope, SchemaInputValidationResult,
  SchemaJsonValue, SchemaValidationContext, SyncOwnerValidator, OwnerExecutionDiagnostic} from './schema-types.js';
import {scopeFor} from './schema-engine.js';
import {isJsonRecord, JsonSnapshotError, snapshotJson} from './schema-json.js';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function ownerFailure(scope: SchemaDiagnosticScope, code: OwnerExecutionDiagnostic['code']): SchemaInputValidationResult {
  return Object.freeze({kind: 'execution-error', diagnostics: Object.freeze([
    Object.freeze({scope, phase: 'execution', operation: 'semantic', code})
  ] as const)});
}

function asyncResult(value: object): boolean {
  // Handle rejected native/cross-realm promises without running a user-defined `then` getter.
  try {
    void Promise.prototype.then.call(value, () => undefined, () => undefined);
    return true;
  } catch { /* Non-promises have no Promise internal slots. */ }
  return 'then' in value;
}

/** Validate one protected candidate/context snapshot, then invoke a synchronous owner at most once. */
export function validateSchemaInput<C>(compiled: CompiledSchema, data: SchemaJsonValue, options: {
  readonly context: SchemaValidationContext<C>;
  readonly ownerValidate?: SyncOwnerValidator<C>;
}): SchemaInputValidationResult {
  let scope = scopeFor(compiled);
  let context: SchemaValidationContext<C>;
  let owner: unknown;
  try {
    if (!isJsonRecord(options)) return ownerFailure(scope, 'owner-context-invalid');
    const descriptor = Object.getOwnPropertyDescriptor(options, 'context');
    if (!descriptor || !('value' in descriptor)) return ownerFailure(scope, 'owner-context-invalid');
    const candidate = snapshotJson(descriptor.value);
    if (!isJsonRecord(candidate) || typeof candidate.consumerId !== 'string' ||
      typeof candidate.nowMs !== 'number' || !Number.isFinite(candidate.nowMs) || !Object.hasOwn(candidate, 'settings')) {
      return ownerFailure(scope, 'owner-context-invalid');
    }
    context = deepFreeze(candidate) as unknown as SchemaValidationContext<C>;
    scope = Object.freeze({...scope, consumerId: context.consumerId});
    const ownerDescriptor = Object.getOwnPropertyDescriptor(options, 'ownerValidate');
    if (ownerDescriptor && !('value' in ownerDescriptor)) return ownerFailure(scope, 'owner-result-invalid');
    owner = ownerDescriptor?.value;
    if (owner !== undefined && typeof owner !== 'function') return ownerFailure(scope, 'owner-result-invalid');
  } catch {return ownerFailure(scope, 'owner-context-invalid');}

  let input: SchemaJsonValue;
  try {
    input = deepFreeze(snapshotJson(data));
    const structural = compiled.validate(input, {consumerId: context.consumerId});
    if (!isJsonRecord(structural) || !Array.isArray(structural.diagnostics) ||
      (structural.kind === 'valid' ? structural.diagnostics.length !== 0 : structural.diagnostics.length === 0) ||
      !['valid', 'invalid', 'execution-error'].includes(structural.kind)) throw new Error();
    if (structural.kind !== 'valid') return structural;
  } catch (error) {
    if (error instanceof JsonSnapshotError && error.kind === 'invalid') return Object.freeze({kind: 'invalid', diagnostics: Object.freeze([
      Object.freeze({scope, phase: 'structure', code: 'input-not-json', dataPath: error.dataPath})
    ] as const)});
    return Object.freeze({kind: 'execution-error', diagnostics: Object.freeze([Object.freeze({scope, phase: 'execution', operation: 'structure',
      code: error instanceof JsonSnapshotError && error.kind === 'limit' || error instanceof RangeError ? 'limit-exceeded' : 'engine-failed'})] as const)});
  }
  if (!owner) return Object.freeze({kind: 'valid', diagnostics: Object.freeze([]) as readonly []});
  let result: unknown;
  try {result = (owner as SyncOwnerValidator<C>)(input, context);} catch {return ownerFailure(scope, 'owner-validation-failed');}
  try {
    if (result !== null && (typeof result === 'object' || typeof result === 'function') && asyncResult(result)) return ownerFailure(scope, 'async-owner-unsupported');
    const snapshot = snapshotJson(result);
    if (!isJsonRecord(snapshot) || !Array.isArray(snapshot.issues)) return ownerFailure(scope, 'owner-result-invalid');
    if (snapshot.kind === 'valid' && snapshot.issues.length === 0) return Object.freeze({kind: 'valid', diagnostics: Object.freeze([]) as readonly []});
    if (snapshot.kind !== 'invalid' || snapshot.issues.length === 0) return ownerFailure(scope, 'owner-result-invalid');
    const diagnostics: InputDiagnostic[] = [];
    for (const issue of snapshot.issues) {
      if (!isJsonRecord(issue) || typeof issue.dataPath !== 'string' ||
        (issue.dataPath !== '' && !issue.dataPath.startsWith('/')) || /~(?:[^01]|$)/u.test(issue.dataPath) || typeof issue.ruleId !== 'string') {
        return ownerFailure(scope, 'owner-result-invalid');
      }
      diagnostics.push(Object.freeze({scope, phase: 'semantic', code: 'owner-input-invalid', dataPath: issue.dataPath as '' | `/${string}`, ruleId: issue.ruleId}));
    }
    return Object.freeze({kind: 'invalid', diagnostics: Object.freeze(diagnostics) as readonly [InputDiagnostic & {phase: 'semantic'}, ...(InputDiagnostic & {phase: 'semantic'})[]]});
  } catch {return ownerFailure(scope, 'owner-result-invalid');}
}
