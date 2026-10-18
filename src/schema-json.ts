import type {JsonPointer, SchemaJsonValue} from './schema-types.js';

export class JsonSnapshotError extends Error {
  constructor(readonly kind: 'invalid' | 'limit', readonly dataPath: JsonPointer) {
    super('JSON snapshot failed.');
  }
}

export function appendPointer(path: string, key: string): JsonPointer {
  return `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}` as JsonPointer;
}

/** Copy JSON values without invoking accessors, toJSON, or input iterators. */
export function snapshotJson(value: unknown): SchemaJsonValue {
  const active = new WeakSet<object>();
  let remaining = 100_000;
  const visit = (input: unknown, path: JsonPointer, depth: number): SchemaJsonValue => {
    if (--remaining < 0 || depth > 128) throw new JsonSnapshotError('limit', path);
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || input === null || active.has(input)) throw new JsonSnapshotError('invalid', path);
    const array = Array.isArray(input);
    const prototype = Object.getPrototypeOf(input);
    if (!array && prototype !== null && prototype !== Object.prototype) throw new JsonSnapshotError('invalid', path);
    if (Object.getOwnPropertySymbols(input).length) throw new JsonSnapshotError('invalid', path);
    active.add(input);
    try {
      if (array) {
        const length = input.length;
        if (!Number.isSafeInteger(length) || length > remaining) throw new JsonSnapshotError('limit', path);
        const result: SchemaJsonValue[] = [];
        for (let i = 0; i < length; i++) {
          const child = appendPointer(path, String(i));
          const descriptor = Object.getOwnPropertyDescriptor(input, i);
          if (!descriptor || !('value' in descriptor)) throw new JsonSnapshotError('invalid', child);
          result.push(visit(descriptor.value, child, depth + 1));
        }
        for (const key of Object.keys(input)) {
          if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) throw new JsonSnapshotError('invalid', appendPointer(path, key));
        }
        return result;
      }
      const result: Record<string, SchemaJsonValue> = {};
      for (const key of Object.keys(input)) {
        const child = appendPointer(path, key);
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor || !('value' in descriptor)) throw new JsonSnapshotError('invalid', child);
        Object.defineProperty(result, key, {value: visit(descriptor.value, child, depth + 1), enumerable: true, writable: true, configurable: true});
      }
      return result;
    } finally {active.delete(input);}
  };
  return visit(value, '', 0);
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
