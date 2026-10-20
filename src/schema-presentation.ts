type SchemaNode = Record<string, unknown>;
export const schemaRecord = (value: unknown): value is SchemaNode => !!value && typeof value === 'object' && !Array.isArray(value);
export const jsonTypes = ['object', 'array', 'string', 'number', 'boolean', 'null'] as const;
const valueType = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

/** Only schema constraints prove a type; a currently matching union branch does not. */
export function presentationTypes(schema: unknown, reference: (ref: string) => unknown = () => undefined,
  seen = new Set<unknown>()): ReadonlySet<string> {
  if (schema === false) return new Set();
  if (!schemaRecord(schema) || seen.has(schema)) return new Set(jsonTypes);
  const visited = new Set(seen);visited.add(schema);
  let types: Set<string> = new Set(jsonTypes);
  const intersect = (other: ReadonlySet<string>): void => {types = new Set([...types].filter(type => other.has(type)));};
  const infer = (child: unknown): ReadonlySet<string> => presentationTypes(child, reference, visited);
  if (typeof schema.$ref === 'string') intersect(infer(reference(schema.$ref)));
  if (schema.type !== undefined) {
    const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
    intersect(new Set(declared.map(type => type === 'integer' ? 'number' : type)));
  }
  if (Object.hasOwn(schema, 'const')) intersect(new Set([valueType(schema.const)]));
  if (Array.isArray(schema.enum)) intersect(new Set(schema.enum.map(valueType)));
  if (Array.isArray(schema.allOf)) schema.allOf.forEach(child => intersect(infer(child)));
  for (const keyword of ['anyOf', 'oneOf']) {
    const children = schema[keyword];
    if (Array.isArray(children)) intersect(new Set(children.flatMap(child => [...infer(child)])));
  }
  return types;
}

/** Initial values are produced only after an explicit add/type-change action, never on mount. */
export function presentationInitial(schema: unknown): unknown {
  if (schemaRecord(schema)) {
    if (Object.hasOwn(schema, 'const')) return schema.const;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  }
  const types = presentationTypes(schema);
  if (types.size !== 1) return null;
  switch ([...types][0]) {
    case 'object': return {};
    case 'array': return [];
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    default: return null;
  }
}

/** A deliberately small tri-state evaluator for presentation-only if/then/else hints. */
export function presentationCondition(schema: unknown, data: unknown, reference: (ref: string) => unknown,
  seen = new Set<unknown>()): boolean | undefined {
  if (typeof schema === 'boolean') return schema;
  if (!schemaRecord(schema) || seen.has(schema)) return undefined;
  const supported = ['type', 'const', 'enum', 'required', 'properties', 'allOf', 'anyOf', 'oneOf', 'not', '$ref', '$id', '$schema', 'title', 'description', '$comment'];
  if (Object.keys(schema).some(key => !supported.includes(key))) return undefined;
  const visited = new Set(seen);visited.add(schema);
  const test = (child: unknown, value = data): boolean | undefined => presentationCondition(child, value, reference, visited);
  const equal = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((child, index) => equal(child, b[index]));
    return schemaRecord(a) && schemaRecord(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  };
  const results: (boolean | undefined)[] = [];
  if (typeof schema.$ref === 'string') results.push(test(reference(schema.$ref)));
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    results.push(types.some(type => type === 'integer' ? typeof data === 'number' && Number.isInteger(data) : type === valueType(data)));
  }
  if (Object.hasOwn(schema, 'const')) results.push(equal(data, schema.const));
  if (Array.isArray(schema.enum)) results.push(schema.enum.some(item => equal(data, item)));
  if (schemaRecord(data)) {
    if (Array.isArray(schema.required)) results.push(schema.required.every(key => typeof key === 'string' && Object.hasOwn(data, key)));
    if (schemaRecord(schema.properties)) for (const [key, child] of Object.entries(schema.properties)) if (Object.hasOwn(data, key)) results.push(test(child, data[key]));
  }
  if (Array.isArray(schema.allOf)) results.push(...schema.allOf.map(child => test(child)));
  for (const keyword of ['anyOf', 'oneOf']) {
    const children = schema[keyword];
    if (!Array.isArray(children)) continue;
    const states = children.map(child => test(child));
    if (keyword === 'anyOf') results.push(states.includes(true) ? true : states.includes(undefined) ? undefined : false);
    else results.push(states.includes(undefined) ? undefined : states.filter(Boolean).length === 1);
  }
  if (Object.hasOwn(schema, 'not')) {const result = test(schema.not);results.push(result === undefined ? undefined : !result);}
  return results.includes(false) ? false : results.includes(undefined) ? undefined : true;
}
