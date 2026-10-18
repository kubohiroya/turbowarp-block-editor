import {Ajv, MissingRefError, type ErrorObject, type ValidateFunction} from 'ajv';
import {Ajv2020} from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import uri from 'fast-uri';
import type {
  CompileDiagnosticCode, CompiledSchema, InputDiagnostic, JsonPointer, SchemaBundle, SchemaCompileResult,
  SchemaDiagnosticScope, SchemaDialect, SchemaDocument, SchemaIdentity, SchemaJsonValue, SchemaSourceReference,
  StructuralValidationResult
} from './schema-types.js';
import {appendPointer, isJsonRecord, JsonSnapshotError, snapshotJson} from './schema-json.js';

const DIALECT_07 = 'http://json-schema.org/draft-07/schema#';
const DIALECT_2020 = 'https://json-schema.org/draft/2020-12/schema';
const {parse, resolve, normalize} = uri;
const maps = ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas', 'dependencies'];
const singles = ['additionalProperties', 'additionalItems', 'contains', 'propertyNames', 'not', 'if', 'then', 'else',
  'unevaluatedProperties', 'unevaluatedItems', 'contentSchema'];
const arrays = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

class BundleError extends Error {
  constructor(readonly code: CompileDiagnosticCode) {super('Invalid schema bundle.');}
}
function fail(code: CompileDiagnosticCode): never {throw new BundleError(code);}
const ownString = (value: object, name: string): string | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string' ? descriptor.value : undefined;
};
const freezeIdentity = (identity: SchemaIdentity): SchemaIdentity => Object.freeze({...identity});
function scopeFor(value: unknown): SchemaDiagnosticScope {
  const fallback = freezeIdentity({ownerId: 'unknown', contractId: 'unknown', revision: 'unknown', variantId: 'default'});
  try {
    if (!isJsonRecord(value)) return Object.freeze({identity: fallback});
    const descriptor = Object.getOwnPropertyDescriptor(value, 'identity');
    const id: unknown = descriptor && 'value' in descriptor ? descriptor.value : null;
    if (!isJsonRecord(id)) return Object.freeze({identity: fallback});
    const ownerId = ownString(id, 'ownerId'), contractId = ownString(id, 'contractId');
    const revision = ownString(id, 'revision'), variantId = ownString(id, 'variantId');
    if (ownerId === undefined || contractId === undefined || revision === undefined || variantId === undefined) return Object.freeze({identity: fallback});
    return Object.freeze({identity: freezeIdentity({ownerId, contractId, revision, variantId})});
  } catch {return Object.freeze({identity: fallback});}
}
function dialectFor(uri: unknown): SchemaDialect | undefined {
  if (typeof uri !== 'string') return undefined;
  const canonical = uri.replace(/#$/, '').replace(/^https:/, 'http:');
  if (canonical === 'http://json-schema.org/draft-07/schema') return 'draft-07';
  if (canonical === 'http://json-schema.org/draft/2020-12/schema') return '2020-12';
  return undefined;
}
const normalizeUri = (uri: string): string => normalize(uri).replace(/#$/, '');
function absoluteUri(uri: unknown, fragments: boolean): string {
  if (typeof uri !== 'string' || !uri) return fail('resource-invalid');
  const parsed = parse(uri);
  if (parsed.error || !parsed.scheme || (!fragments && parsed.fragment !== undefined)) return fail('resource-invalid');
  return normalizeUri(uri);
}
function referenceKey(value: unknown): string {
  if (!isJsonRecord(value) || typeof value.repository !== 'string' || typeof value.path !== 'string') return fail('artifact-role-invalid');
  for (const key of ['symbol', 'version', 'sha256']) if (key in value && typeof value[key] !== 'string') return fail('artifact-role-invalid');
  return JSON.stringify([value.repository, value.path, value.symbol ?? null]);
}

/** Check declared provenance only; paths and retrieval URIs are never fetched. */
function validateArtifacts(bundle: SchemaBundle): void {
  const provenance: unknown = bundle.provenance;
  if (!isJsonRecord(provenance)) fail('artifact-role-invalid');
  const roles = new Map<string, string>();
  for (const role of ['canonicalSources', 'generatedFiles', 'referenceSchemas', 'generationSources']) {
    const refs = provenance[role];
    if (!Array.isArray(refs) || (role === 'canonicalSources' && refs.length === 0)) fail('artifact-role-invalid');
    for (const ref of refs) {
      const key = referenceKey(ref);
      if (roles.has(key)) fail('artifact-role-invalid');
      roles.set(key, role);
    }
  }
  for (const resource of [bundle.root, ...bundle.resources]) {
    if (!isJsonRecord(resource) || !isJsonRecord(resource.artifact)) fail('artifact-role-invalid');
    const artifact = resource.artifact;
    const key = referenceKey(artifact.source);
    if (artifact.role === 'canonical-schema') {
      if (roles.get(key) !== 'canonicalSources') fail('artifact-role-invalid');
    } else if (artifact.role === 'generated-schema') {
      if (roles.get(key) !== 'generatedFiles' || !Array.isArray(artifact.generatedFrom) || !artifact.generatedFrom.length) fail('artifact-role-invalid');
      for (const ref of artifact.generatedFrom as readonly SchemaSourceReference[]) if (roles.get(referenceKey(ref)) !== 'canonicalSources') fail('artifact-role-invalid');
    } else fail('artifact-role-invalid');
  }
}

function prepare(bundle: SchemaBundle, ajv: Ajv | Ajv2020): {root: string; resources: {uri: string; document: SchemaDocument}[]} {
  const registry = new Map<string, string>();
  const register = (id: string, location: string) => {
    const key = normalizeUri(id), previous = registry.get(key);
    if (previous !== undefined && previous !== location) fail('resource-id-conflict');
    registry.set(key, location);
  };
  const resources: {uri: string; document: SchemaDocument}[] = [];
  const walk = (node: unknown, base: string, location: string): void => {
    if (typeof node === 'boolean') return;
    if (!isJsonRecord(node)) return;
    if ('$schema' in node) {
      const dialect = dialectFor(node.$schema);
      if (!dialect) fail('dialect-unsupported');
      if (dialect !== bundle.dialect) fail('dialect-conflict');
      // Canonicalize identifiers in the private snapshot, never in the owner's document.
      node.$schema = dialect === 'draft-07' ? DIALECT_07 : DIALECT_2020;
    }
    if ('$id' in node) {
      if (typeof node.$id !== 'string') fail('schema-invalid');
      base = absoluteUri(resolve(base, node.$id as string), true);
      register(base, location);node.$id = base;
    }
    for (const key of ['$anchor', '$dynamicAnchor']) if (typeof node[key] === 'string') register(`${base.replace(/#.*$/, '')}#${node[key]}`, location);
    if (node.$async === true) fail('schema-invalid');
    if (typeof node.format === 'string' && !ajv.formats[node.format]) fail('schema-invalid');
    for (const key of maps) if (isJsonRecord(node[key])) {
      for (const [name, child] of Object.entries(node[key] as object)) if (typeof child === 'boolean' || isJsonRecord(child)) walk(child, base, appendPointer(appendPointer(location, key), name));
    }
    for (const key of singles) if (typeof node[key] === 'boolean' || isJsonRecord(node[key])) walk(node[key], base, `${location}/${key}`);
    for (const key of [...arrays, 'items']) {
      const children = node[key];
      if (Array.isArray(children)) children.forEach((child, index) => walk(child, base, `${location}/${key}/${index}`));
      else if (key === 'items' && (typeof children === 'boolean' || isJsonRecord(children))) walk(children, base, `${location}/${key}`);
    }
  };
  const supplied = [bundle.root, ...bundle.resources];
  for (let index = 0; index < supplied.length; index++) {
    const resource = supplied[index];
    if (!isJsonRecord(resource) || (typeof resource.document !== 'boolean' && !isJsonRecord(resource.document))) fail('resource-invalid');
    const uri = absoluteUri(resource.retrievalUri, false);
    register(uri, `${index}`);walk(resource.document, uri, `${index}`);
    resources.push({uri, document: resource.document as SchemaDocument});
  }
  return {root: resources[0]!.uri, resources};
}

function structuralDiagnostics(errors: readonly ErrorObject[], scope: SchemaDiagnosticScope, rootUri: string): readonly InputDiagnostic[] {
  return Object.freeze(errors.map(error => {
    let dataPath = error.instancePath as JsonPointer;
    if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') dataPath = appendPointer(dataPath, error.params.missingProperty);
    if (error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string') dataPath = appendPointer(dataPath, error.params.additionalProperty);
    const hash = error.schemaPath.indexOf('#');
    const resourceUri = hash > 0 ? error.schemaPath.slice(0, hash) : rootUri;
    const schemaPath = decodeURIComponent(hash >= 0 ? error.schemaPath.slice(hash + 1) : error.schemaPath) as JsonPointer;
    return Object.freeze({scope, phase: 'structure' as const, code: 'schema-data-invalid' as const, dataPath, schemaPath, resourceUri, keyword: error.keyword});
  }));
}

function makeValidator(validate: ValidateFunction, scope: SchemaDiagnosticScope, dialect: SchemaDialect, rootUri: string): CompiledSchema {
  return Object.freeze({identity: scope.identity, dialect, validate(data: SchemaJsonValue, context?: {readonly consumerId: string}): StructuralValidationResult {
    let currentScope = scope;
    try {
      if (context !== undefined) {
        if (!isJsonRecord(context)) throw new Error();
        const consumerId = ownString(context, 'consumerId');
        if (consumerId === undefined) throw new Error();
        currentScope = Object.freeze({...scope, consumerId});
      }
      const input = snapshotJson(data);
      if (validate(input)) return Object.freeze({kind: 'valid', diagnostics: Object.freeze([]) as readonly []});
      const diagnostics = structuralDiagnostics(validate.errors ?? [], currentScope, rootUri);
      if (!diagnostics.length) throw new Error();
      return Object.freeze({kind: 'invalid', diagnostics: diagnostics as readonly [InputDiagnostic & {phase: 'structure'}, ...(InputDiagnostic & {phase: 'structure'})[]]});
    } catch (error) {
      if (error instanceof JsonSnapshotError && error.kind === 'invalid') return Object.freeze({kind: 'invalid', diagnostics: Object.freeze([
        Object.freeze({scope: currentScope, phase: 'structure', code: 'input-not-json', dataPath: error.dataPath})
      ] as const)});
      return Object.freeze({kind: 'execution-error', diagnostics: Object.freeze([Object.freeze({scope: currentScope, phase: 'execution', operation: 'structure',
        code: error instanceof JsonSnapshotError && error.kind === 'limit' || error instanceof RangeError ? 'limit-exceeded' : 'engine-failed'})] as const)});
    }
  }});
}

/** Compile an isolated synchronous validator from an immutable private snapshot. */
export function compileSchemaBundle(input: SchemaBundle): SchemaCompileResult {
  const scope = scopeFor(input);
  try {
    if (!isJsonRecord(input)) fail('resource-invalid');
    const declaredDialect = Object.getOwnPropertyDescriptor(input, 'dialect');
    if (!declaredDialect || 'value' in declaredDialect && declaredDialect.value === undefined) fail('dialect-required');
    if (!('value' in declaredDialect)) fail('resource-invalid');
    if (declaredDialect.value !== 'draft-07' && declaredDialect.value !== '2020-12') fail('dialect-unsupported');
    const candidate = snapshotJson(input);
    if (!isJsonRecord(candidate) || !isJsonRecord(candidate.identity)) fail('resource-invalid');
    for (const key of ['ownerId', 'contractId', 'revision', 'variantId']) if (typeof candidate.identity[key] !== 'string') fail('resource-invalid');
    if (!candidate.dialect) fail('dialect-required');
    if (candidate.dialect !== 'draft-07' && candidate.dialect !== '2020-12') fail('dialect-unsupported');
    if (!Array.isArray(candidate.resources) || !isJsonRecord(candidate.root)) fail('resource-invalid');
    const bundle = candidate as unknown as SchemaBundle;
    validateArtifacts(bundle);
    const options = {allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false,
      strict: false, logger: false as const, ownProperties: true};
    const ajv = bundle.dialect === 'draft-07' ? new Ajv(options) : new Ajv2020(options);
    formats.default(ajv);
    const prepared = prepare(bundle, ajv);
    for (const resource of prepared.resources) {
      if (!ajv.validateSchema(resource.document)) fail('schema-invalid');
      ajv.addSchema(resource.document, resource.uri);
    }
    const validate = ajv.getSchema(prepared.root);
    if (!validate || ('$async' in validate && validate.$async)) fail('schema-invalid');
    return Object.freeze({kind: 'compiled', validator: makeValidator(validate as ValidateFunction, scope, bundle.dialect, prepared.root), diagnostics: Object.freeze([]) as readonly []});
  } catch (error) {
    let code: CompileDiagnosticCode | undefined;
    if (error instanceof BundleError) code = error.code;
    else if (error instanceof MissingRefError) code = 'ref-unresolved';
    else if (error instanceof JsonSnapshotError && error.kind === 'invalid') code = 'resource-invalid';
    else if (error instanceof SyntaxError) code = 'schema-invalid';
    if (code) return Object.freeze({kind: 'schema-error', diagnostics: Object.freeze([Object.freeze({scope, phase: 'compile', code})] as const)});
    return Object.freeze({kind: 'execution-error', diagnostics: Object.freeze([Object.freeze({scope, phase: 'execution', operation: 'compile',
      code: error instanceof JsonSnapshotError && error.kind === 'limit' || error instanceof RangeError ? 'limit-exceeded' : 'engine-failed'})] as const)});
  }
}
