import {Ajv} from 'ajv';
import {Ajv2020} from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import uri from 'fast-uri';
import type {SchemaBundle} from './schema-types.js';
import {prepare} from './schema-engine.js';
import {snapshotJson} from './schema-json.js';
import type {RJSFSchema, ErrorSchema} from '@rjsf/utils';
import type {ValidationIssue} from './types.js';

/** RJSF v5 only resolves fragment pointers; flatten a private, already checked resource graph. */
export function schemaView(input: SchemaBundle): RJSFSchema {
  const bundle = snapshotJson(input) as unknown as SchemaBundle;
  const ajv = bundle.dialect === 'draft-07' ? new Ajv({strict: false}) : new Ajv2020({strict: false});
  formats.default(ajv);
  const prepared = prepare(bundle, ajv);
  const pointerFor = (reference: string, base: string): string => {
    const absolute = uri.normalize(uri.resolve(base, reference)).replace(/#$/, '');
    let location = prepared.registry.get(absolute);
    if (location === undefined) {
      const hash = absolute.indexOf('#');
      const resource = prepared.registry.get(hash < 0 ? absolute : absolute.slice(0, hash));
      const fragment = hash < 0 ? '' : decodeURIComponent(absolute.slice(hash + 1));
      if (resource === undefined || (fragment !== '' && !fragment.startsWith('/'))) throw new TypeError('Unsupported form reference.');
      location = resource + fragment;
    }
    const slash = location.indexOf('/');
    const index = slash < 0 ? location : location.slice(0, slash);
    return `#${encodeURIComponent(`/definitions/__resource${index}${slash < 0 ? '' : location.slice(slash)}`).replace(/%2F/g, '/')}`;
  };
  for (const {node, base} of prepared.nodes) {
    // These constructs cannot be represented faithfully by this RJSF version.
    if ('$dynamicRef' in node || '$recursiveRef' in node || 'prefixItems' in node) throw new TypeError('Unsupported form schema keyword.');
    if (typeof node.$ref === 'string') node.$ref = pointerFor(node.$ref, base);
    // Every reference is now absolute within the presentation wrapper; canonical documents are untouched.
    delete node.$id;delete node.$anchor;delete node.$dynamicAnchor;
  }
  if (typeof bundle.root.document === 'boolean') throw new TypeError('A form requires an object schema.');
  const view = {$schema: bundle.dialect === 'draft-07' ? 'http://json-schema.org/draft-07/schema#' : 'https://json-schema.org/draft/2020-12/schema',
    definitions: Object.fromEntries(prepared.resources.map((resource, index) => [`__resource${index}`, resource.document])),
    $ref: '#/definitions/__resource0'} as RJSFSchema;
  assertFiniteObjectRendering(view, prepared.nodes.map(({node}) => node));
  return view;
}

// RJSF eagerly expands object defaults even for absent optional properties. Array items
// are expanded only for actual elements, so recursion through arrays remains supported.
function assertFiniteObjectRendering(root: RJSFSchema, seeds: readonly object[]): void {
  const active = new Set<object>(), done = new Set<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (active.has(value)) throw new TypeError('Unsupported recursive object form schema.');
    if (done.has(value)) return;
    active.add(value);
    const node = value as Record<string, unknown>;
    if (typeof node.$ref === 'string') {
      let target: unknown = root;
      for (const segment of decodeURIComponent(node.$ref.slice(1)).slice(1).split('/')) {
        target = (target as Record<string, unknown>)[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
      }
      visit(target);
    }
    for (const key of ['properties', 'patternProperties', 'dependentSchemas', 'dependencies']) {
      const map = node[key];if (map && typeof map === 'object') Object.values(map).forEach(visit);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(node[key])) node[key].forEach(visit);
    for (const key of ['additionalProperties', 'if', 'then', 'else']) visit(node[key]);
    active.delete(value);done.add(value);
  };
  visit(root);seeds.forEach(visit);
}

/** Keep literal property names, including dots and pointer escapes, intact. */
export function fieldErrors(issues: readonly ValidationIssue[]): ErrorSchema {
  const root: Record<string, unknown> = Object.create(null);
  for (const issue of issues) {
    let node = root;
    const path = issue.path;
    const segments = path?.startsWith('/') ? path.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')) : [];
    // RJSF reserves __errors; retain this diagnostic at the root rather than losing it.
    if (!segments.includes('__errors')) for (const segment of segments) {
      if (!Object.hasOwn(node, segment)) Object.defineProperty(node, segment, {value: Object.create(null), enumerable: true});
      node = node[segment] as Record<string, unknown>;
    }
    if (!Object.hasOwn(node, '__errors')) Object.defineProperty(node, '__errors', {value: [], enumerable: true});
    (node.__errors as string[]).push(issue.message);
  }
  return root as ErrorSchema;
}
