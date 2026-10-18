import {snapshotJson} from './schema-json.js';
import type {PreparedEditorDefinition, PreparedSave} from './prepared-types.js';
import type {BlockSnapshot, EditorDefinition, JsonObject, LiteralArgumentChange, ValidationIssue} from './types.js';

export function isPreparedEditor(definition: EditorDefinition): definition is PreparedEditorDefinition {
  return (definition as Partial<PreparedEditorDefinition>).saveContract === 'prepared-source-v1';
}

/** Capture callback output before checking it; accessors and iterators never supply writes. */
export function capturePreparedSave(definition: PreparedEditorDefinition, draft: JsonObject,
  snapshot: BlockSnapshot): PreparedSave {
  const output: unknown = definition.prepareSave(draft, snapshot);
  try {
    const value = snapshotJson(output);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid prepared save.');
    const result = value as Record<string, unknown>;
    if (result.kind === 'ready' && Array.isArray(result.changes)) {
      const changes: LiteralArgumentChange[] = [];
      for (let i = 0; i < result.changes.length; i++) {
        const change = result.changes[i] as Record<string, unknown>;
        if (!change || typeof change.argument !== 'string' ||
            !(typeof change.value === 'string' || typeof change.value === 'boolean' ||
              (typeof change.value === 'number' && Number.isFinite(change.value)))) {
          throw new TypeError('Invalid prepared change.');
        }
        changes.push(Object.freeze({argument: change.argument, value: change.value}));
      }
      return Object.freeze({kind: 'ready', changes: Object.freeze(changes)});
    }
    if (result.kind === 'invalid' && Array.isArray(result.issues) && result.issues.length > 0) {
      const issues: ValidationIssue[] = [];
      for (let i = 0; i < result.issues.length; i++) {
        const issue = result.issues[i] as Record<string, unknown>;
        if (!issue || typeof issue.message !== 'string' || (issue.path !== undefined && typeof issue.path !== 'string')) {
          throw new TypeError('Invalid prepared issue.');
        }
        issues.push(Object.freeze({message: issue.message, ...(issue.path === undefined ? {} : {path: issue.path})}));
      }
      return Object.freeze({kind: 'invalid', issues: Object.freeze(issues)});
    }
    throw new TypeError('Invalid prepared save.');
  } catch (error) {
    // A synchronous contract never awaits foreign thenables. Drain native rejected promises.
    try {void Promise.prototype.then.call(output as Promise<unknown>, () => undefined, () => undefined);}
    catch { /* Non-promises are rejected without touching their then property. */ }
    throw error;
  }
}
