import {parseDocument, stringify} from 'yaml';
import {cloneJson} from './data.js';
import type {JsonValue} from './types.js';

export type SourceFormat = 'json' | 'yaml';

/** Convert YAML mappings without coercing non-string keys into JSON property names. */
function jsonData(value: unknown, ancestors = new Set<object>(), depth = 0): JsonValue {
  if (depth > 100) throw new TypeError('YAML data exceeds the maximum depth.');
  if (value === null || typeof value !== 'object') return cloneJson(value as JsonValue);
  if (ancestors.has(value)) throw new TypeError('YAML data must not contain cycles.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(child => jsonData(child, ancestors, depth + 1));
    if (value instanceof Map) {
      return Object.fromEntries([...value.entries()].map(([key, child]) => {
        if (typeof key !== 'string') throw new TypeError('YAML mapping keys must be strings.');
        return [key, jsonData(child, ancestors, depth + 1)];
      }));
    }
    throw new TypeError('Expected JSON-compatible YAML data.');
  } finally {
    ancestors.delete(value);
  }
}

export function decodeSource(source: string, format: SourceFormat): JsonValue {
  if (format === 'json') return cloneJson(JSON.parse(source) as JsonValue);
  const doc = parseDocument(source, {version: '1.2', schema: 'core', uniqueKeys: true});
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length) throw new TypeError(problems.map(problem => problem.message).join('\n'));
  if (doc.directives.yaml.version !== '1.2') throw new TypeError('Only YAML 1.2 is supported.');
  return jsonData(doc.toJS({mapAsMap: true, maxAliasCount: 100}));
}

export function encodeSource(data: JsonValue, format: SourceFormat): string {
  const value = cloneJson(data);
  return format === 'json' ? JSON.stringify(value) : stringify(value, {version: '1.2'});
}

/** Ignore object key order when deciding whether saving would change the data. */
export function sameData(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameData(value, right[index]!));
  }
  if (Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.hasOwn(right, key) && sameData(left[key]!, right[key]!));
}
