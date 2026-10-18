import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {createSourceCandidate, patchDecodedSource, readSourceDocument} from './source-editor.js';
import {cloneJson} from './data.js';
import type {CapturedBinding} from './source-editor.js';
import type {SchemaJsonObject, SchemaJsonValue} from './schema-types.js';
import type {SourceDocument, SourceVariant} from './source-types.js';
import type {EditorViewContext, JsonObject, JsonValue} from './types.js';

type Node = Record<string, unknown>;
const record = (value: unknown): value is Node => !!value && typeof value === 'object' && !Array.isArray(value);
const pointer = (path: string, key: string): string => `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
const typeOf = (v: JsonValue): string => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const initial = (type: string): JsonValue => {
  switch (type) {case 'object': return {};case 'array': return [];case 'string': return '';case 'number': return 0;case 'boolean': return false;default: return null;}
};

function mergeHints(left: Node, right: Node): Node {
  const result = {...left, ...right};
  for (const field of ['properties', 'patternProperties']) {
    if (!record(left[field]) && !record(right[field])) continue;
    const a = record(left[field]) ? left[field] as Node : {};
    const b = record(right[field]) ? right[field] as Node : {};
    const combined: Node = {...a};
    for (const [key, child] of Object.entries(b)) Object.defineProperty(combined, key, {
      value: Object.hasOwn(a, key) ? {allOf: [a[key], child]} : child, enumerable: true
    });
    result[field] = combined;
  }
  if (Array.isArray(left.enum) && Array.isArray(right.enum)) {
    result.enum = left.enum.filter(value => (right.enum as unknown[]).some(other => JSON.stringify(value) === JSON.stringify(other)));
  }
  return result;
}
function propertyHint(hints: Node, key: string): unknown {
  const matches: unknown[] = [];
  if (record(hints.properties) && Object.hasOwn(hints.properties, key)) matches.push(hints.properties[key]);
  if (record(hints.patternProperties)) for (const [pattern, schema] of Object.entries(hints.patternProperties)) {
    try {if (new RegExp(pattern, 'u').test(key)) matches.push(schema);} catch { /* The canonical compiler rejects invalid patterns. */ }
  }
  return matches.length > 1 ? {allOf: matches} : matches.length ? matches[0] : hints.additionalProperties;
}

/** Presentation hints never replace canonical validation or remove schema constraints. */
function resolveHints(variant: SourceVariant, schema: unknown, data: JsonValue, seen = new Set<unknown>()): Node {
  if (!record(schema) || seen.has(schema)) return {};
  seen.add(schema);
  let result = {...schema};
  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref;
    const hash = ref.indexOf('#');
    const uri = hash < 0 ? ref : ref.slice(0, hash);
    const resources = [variant.schemaBundle.root, ...variant.schemaBundle.resources];
    const resource = uri ? resources.find(r => r.retrievalUri === uri || (record(r.document) && r.document.$id === uri)) : variant.schemaBundle.root;
    let target: unknown = resource?.document;
    const fragment = hash < 0 ? '' : decodeURIComponent(ref.slice(hash + 1));
    if (fragment.startsWith('/')) for (const part of fragment.slice(1).split('/')) {
      target = record(target) || Array.isArray(target) ? (target as Node)[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
    }
    if (!fragment || fragment.startsWith('/')) result = mergeHints(resolveHints(variant, target, data, seen), result);
  }
  if (Array.isArray(schema.allOf)) for (const part of schema.allOf) {
    const next = resolveHints(variant, part, data, seen);
    result = mergeHints(result, next);
  }
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (Array.isArray(alternatives)) {
    const choices = alternatives.filter(part => {
      if (!record(part)) return false;
      if (typeof part.type === 'string' && part.type !== typeOf(data) && !(part.type === 'integer' && typeof data === 'number')) return false;
      if (record(part.properties) && record(data)) for (const [key, child] of Object.entries(part.properties)) {
        if (record(child) && Object.hasOwn(child, 'const') && data[key] !== child.const) return false;
      }
      return true;
    });
    if (choices.length === 1) result = mergeHints(result, resolveHints(variant, choices[0], data, seen));
  }
  if (!Array.isArray(result.enum)) {
    if (Object.hasOwn(result, 'const')) result.enum = [result.const];
    else if (Array.isArray(alternatives)) {
      const enums = alternatives.map(part => resolveHints(variant, part, data, new Set(seen)));
      if (enums.length && enums.every(part => Array.isArray(part.enum))) {
        const values = enums.flatMap(part => part.enum as unknown[]);
        result.enum = [...new Map(values.map(value => [JSON.stringify(value), value])).values()];
      }
    }
  }
  return result;
}
interface FormEdit {path: string; invalidText?: string; removeIndex?: number; swap?: readonly [number, number]}
interface TreeProps {
  value: JsonValue; path: string; schema: unknown; ui: unknown; variant: SourceVariant;
  invalidNumbers: Readonly<Record<string, string>>;
  change(value: JsonValue, edit?: FormEdit): void;
}
function Tree({value, path, schema, ui, variant, invalidNumbers, change: onChange}: TreeProps): React.ReactElement {
  const hints = resolveHints(variant, schema, value);
  const uiHints = record(ui) ? ui : {};
  const [newKey, setNewKey] = React.useState('');
  const change = (next: JsonValue, edit: FormEdit = {path}): void => onChange(next, edit);
  const choices = Array.isArray(hints.enum) ? hints.enum : Array.isArray(uiHints['ui:enum']) ? uiHints['ui:enum'] : undefined;
  const label = typeof hints.title === 'string' ? hints.title : path || '/';
  const props = {'aria-label': label};
  const type = typeOf(value);
  let field: React.ReactNode;
  if (choices) {
    const serialized = JSON.stringify(value);
    const options = choices.map(item => JSON.stringify(item));
    if (!options.includes(serialized)) options.unshift(serialized);
    field = <select {...props} value={serialized} onChange={e => change(JSON.parse(e.target.value) as JsonValue)}>
      {options.map(item => <option key={item} value={item}>{item}</option>)}
    </select>;
  } else if (typeof value === 'string') {
    field = <textarea {...props} value={value} onChange={e => change(e.target.value)} />;
  } else if (typeof value === 'number') {
    field = <input {...props} type="text" inputMode="decimal" value={invalidNumbers[path] ?? String(value)} onChange={e => {
      const text = e.target.value;
      const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(text) ? Number(text) : NaN;
      change(Number.isFinite(number) ? number : value, {path, ...(Number.isFinite(number) ? {} : {invalidText: text})});
    }} />;
  } else if (typeof value === 'boolean') {
    field = <input {...props} type="checkbox" checked={value} onChange={e => change(e.target.checked)} />;
  } else if (Array.isArray(value)) {
    field = <div>{value.map((child, index) => <div key={index}>
      <Tree invalidNumbers={invalidNumbers} value={child} path={pointer(path, String(index))} variant={variant}
        schema={Array.isArray(hints.prefixItems) ? hints.prefixItems[index] ?? hints.items : Array.isArray(hints.items) ? hints.items[index] : hints.items}
        ui={uiHints.items} change={(next, edit) => {const copy = [...value];copy[index] = next;change(copy, edit);}} />
      <button type="button" aria-label={`Remove ${pointer(path, String(index))}`} onClick={() => change(value.filter((_, i) => i !== index), {path, removeIndex: index})}>Remove</button>
      <button type="button" disabled={index === 0} aria-label={`Move up ${pointer(path, String(index))}`} onClick={() => {
        const copy = [...value];[copy[index - 1], copy[index]] = [copy[index]!, copy[index - 1]!];change(copy, {path, swap: [index - 1, index]});
      }}>↑</button>
    </div>)}<button type="button" aria-label={`Add item ${path || '/'}`} onClick={() => change([...value, null], {path: pointer(path, String(value.length))})}>Add item</button></div>;
  } else if (value !== null && typeof value === 'object') {
    const properties = record(hints.properties) ? hints.properties : {};
    field = <div>{Object.entries(value).map(([key, child]) => <div key={key}>
      <Tree invalidNumbers={invalidNumbers} value={child} path={pointer(path, key)} variant={variant} schema={propertyHint(hints, key)}
        ui={uiHints[key]} change={(next, edit) => {
          const copy = cloneJson(value);Object.defineProperty(copy, key, {value: next, enumerable: true, writable: true, configurable: true});change(copy, edit);
        }} />
      <button type="button" aria-label={`Remove ${pointer(path, key)}`} onClick={() => {
        const copy = cloneJson(value);delete copy[key];change(copy, {path: pointer(path, key)});
      }}>Remove</button>
    </div>)}
      <label>Property <input aria-label={`New property ${path || '/'}`} value={newKey} onChange={e => setNewKey(e.target.value)} /></label>
      <select aria-label={`Known property ${path || '/'}`} value="" onChange={e => setNewKey(e.target.value)}>
        <option value="">Choose property</option>{Object.keys(properties).filter(key => !Object.hasOwn(value, key)).map(key => <option key={key}>{key}</option>)}
      </select>
      <button type="button" disabled={!newKey || Object.hasOwn(value, newKey)} onClick={() => {
        const copy = cloneJson(value);Object.defineProperty(copy, newKey, {value: null, enumerable: true, writable: true, configurable: true});change(copy, {path: pointer(path, newKey)});setNewKey('');
      }}>Add property</button>
    </div>;
  } else field = <span>null</span>;
  return <fieldset data-source-path={path}><legend>{label}</legend>
    <select aria-label={`Type ${path || '/'}`} value={type} onChange={e => change(initial(e.target.value))}>
      {['object', 'array', 'string', 'number', 'boolean', 'null'].map(t => <option key={t}>{t}</option>)}
    </select>{field}
  </fieldset>;
}
function liveIssues<C>(draft: JsonObject, bindings: readonly CapturedBinding<C>[]): {message: string; path?: string}[] {
  const issues: {message: string; path?: string}[] = [];
  const sources = draft.sources as JsonObject;
  for (const binding of bindings) {
    const entry = sources[binding.argument] as JsonObject;
    try {
      if (entry.invalidForm === true) throw new TypeError();
      const doc = record(entry.creating)
        ? {...entry.creating, data: entry.data} as unknown as SourceDocument
        : readSourceDocument(binding, entry.source as string);
      const validator = binding.validators.get(JSON.stringify([doc.format, doc.variantId]));
      if (validator && validator.validate((entry.mode === 'form' ? entry.data : doc.data) as SchemaJsonValue).kind !== 'valid') {
        issues.push({message: 'Value does not satisfy the schema.', path: `/${binding.argument}`});
      }
    } catch {issues.push({message: 'Repair the invalid source or form value.', path: `/${binding.argument}`});}
  }
  return issues;
}
function SourceView<C>({context, bindings}: {context: EditorViewContext; bindings: readonly CapturedBinding<C>[]}): React.ReactElement {
  const [, redraw] = React.useState(0);
  const [creating, selectCreateVariant] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    const stop = context.subscribe(() => redraw(n => n + 1));
    context.setValidationIssues(liveIssues(context.getDraft(), bindings));
    return stop;
  }, [context, bindings]);
  const state = context.getState();
  if (state.status !== 'editing' && state.status !== 'saving') return <></>;
  const draft = context.getDraft();
  const sources = draft.sources as JsonObject;
  const disabled = context.getState().status !== 'editing';
  const update = (argument: string, entry: JsonObject): void => {
    const next = context.getDraft();const nextSources = next.sources as JsonObject;
    Object.defineProperty(nextSources, argument, {value: entry, enumerable: true, configurable: true, writable: true});
    context.setDraft(next);
    context.setValidationIssues(liveIssues(next, bindings));
  };
  return <div className="block-editor-source-forms">{bindings.map(binding => {
    const entry = sources[binding.argument] as JsonObject;
    const selectedCreation = Object.hasOwn(creating, binding.argument) ? creating[binding.argument]! : '';
    let document: SourceDocument | undefined;let variant: SourceVariant | undefined;
    try {
      document = readSourceDocument(binding, entry.source as string);
      variant = binding.presentationVariants.find(v => v.format === document!.format && v.variantId === document!.variantId);
    } catch { /* The Source textarea remains available for repair. */ }
    if (record(entry.creating)) {const creation = entry.creating;variant = binding.presentationVariants.find(v => v.format === creation.format && v.variantId === creation.variantId);}
    return <fieldset key={binding.argument} disabled={disabled}><legend>{binding.label ?? binding.argument}</legend>
      <button type="button" aria-pressed={entry.mode === 'source'} onClick={() => {
        try {
          if (entry.invalidForm === true) throw new TypeError();
          const source = record(entry.creating)
            ? createSourceCandidate(entry.creating.format as 'json' | 'yaml', entry.data!)
            : entry.mode === 'form' && document && Object.hasOwn(entry, 'data')
            ? patchDecodedSource(document, entry.data!, source => readSourceDocument(binding, source)) : entry.source as string;
          const next: JsonObject = {...entry, mode: 'source', source, invalidForm: false, invalidNumbers: {}};delete next.creating;update(binding.argument, next);
        } catch {context.setValidationIssues([{message: 'This edit cannot preserve the source. Repair the Source explicitly.'}]);}
      }}>Source</button>
      <select aria-label={`${binding.argument} New format and variant`} value={selectedCreation} onChange={e => selectCreateVariant({...creating, [binding.argument]: e.target.value})}>
        <option value="">Choose new format and variant</option>{binding.presentationVariants.map(v => <option key={JSON.stringify([v.format,v.variantId])} value={JSON.stringify([v.format,v.variantId])}>{v.format} / {v.variantId}</option>)}
      </select>
      <button type="button" disabled={!selectedCreation} onClick={() => {
        const [format, variantId] = JSON.parse(selectedCreation);
        const chosen = binding.presentationVariants.find(v => v.format === format && v.variantId === variantId)!;
        const root = chosen.schemaBundle.root.document;const type = record(root) && typeof root.type === 'string' ? root.type : 'null';
        update(binding.argument, {mode: 'form', source: entry.source!, sourceEdited: true, creating: {format, variantId}, data: initial(type)});
      }}>Create document (replace source)</button>
      <button type="button" disabled={!variant} aria-pressed={entry.mode === 'form'} onClick={() => {
        if (document || entry.creating) update(binding.argument, {...entry, mode: 'form', data: Object.hasOwn(entry, 'data') ? entry.data! : document!.data as JsonValue});
      }}>Form</button>
      {entry.mode === 'form' && <button type="button" onClick={() => update(binding.argument, {mode: 'source', source: entry.source!, sourceEdited: entry.sourceEdited ?? false})}>Discard form edits</button>}
      {entry.mode === 'form' && variant && Object.hasOwn(entry, 'data')
        ? <Tree invalidNumbers={(entry.invalidNumbers ?? {}) as Record<string, string>} value={entry.data!} path="" schema={variant.schemaBundle.root.document} ui={variant.uiSchema as SchemaJsonObject | undefined}
          variant={variant} change={(data, edit = {path: ''}) => {
            const pending = (entry.invalidNumbers ?? {}) as Record<string, string>;
            const invalidNumbers: JsonObject = {};
            const prefix = `${edit.path}/`;
            for (const [path, text] of Object.entries(pending)) {
              let target = path;
              if (edit.removeIndex !== undefined || edit.swap) {
                if (path.startsWith(prefix)) {
                  const [head, ...tail] = path.slice(prefix.length).split('/');let index = Number(head);
                  if (index === edit.removeIndex) continue;
                  if (edit.removeIndex !== undefined && index > edit.removeIndex) index--;
                  if (edit.swap) index = index === edit.swap[0] ? edit.swap[1] : index === edit.swap[1] ? edit.swap[0] : index;
                  target = `${prefix}${index}${tail.length ? '/' + tail.join('/') : ''}`;
                }
              } else if (path === edit.path || path.startsWith(prefix)) continue;
              Object.defineProperty(invalidNumbers, target, {value: text, enumerable: true});
            }
            if (edit.invalidText !== undefined) Object.defineProperty(invalidNumbers, edit.path, {value: edit.invalidText, enumerable: true});
            update(binding.argument, {...entry, data, invalidNumbers, invalidForm: Object.keys(invalidNumbers).length > 0});
          }} />
        : <textarea aria-label={`${binding.argument} Source`} value={entry.source as string} onChange={e => update(binding.argument, {mode: 'source', source: e.target.value, sourceEdited: true})} />}
      {entry.invalidForm === true && <p role="alert">Enter a valid JSON number.</p>}
    </fieldset>;
  })}</div>;
}
export function mountSourceView<C>(container: HTMLElement, context: EditorViewContext,
  bindings: readonly CapturedBinding<C>[]): () => void {
  ReactDOM.render(<SourceView context={context} bindings={bindings} />, container);
  return () => {ReactDOM.unmountComponentAtNode(container);};
}
