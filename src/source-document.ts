import {isAlias, isMap, isNode, isScalar, isSeq, parseDocument} from 'yaml';
import type {Node as YamlNode} from 'yaml';
import type {JsonValue} from './types.js';
import {snapshotJson} from './schema-json.js';

type Patch = {start: number; end: number; text: string};
type Entry = {start: number; end: number; node: JsonNode; key?: string};
type JsonNode = {start: number; end: number; entries?: Entry[]; commas?: number[]; kind: 'object' | 'array' | 'value'};
type SequenceItem = {index: number; value: JsonValue} | {value: JsonValue};

function fail(): never {throw new Error('Source cannot be edited without changing unedited data.');}
function record(value: JsonValue): value is {[key: string]: JsonValue} {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function equal(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equal(value, right[index]!));
  }
  if (record(left) && record(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key]!, right[key]!));
  }
  return false;
}
function serialize(value: JsonValue): string {return JSON.stringify(value);}
// snapshotJson creates fresh mutable arrays; its public result type is readonly.
function snapshot(value: unknown): JsonValue {return snapshotJson(value) as JsonValue;}
function apply(source: string, patches: Patch[]): string {
  const ordered = patches.map((patch, order) => ({...patch, order}));
  ordered.sort((a, b) => b.start - a.start || b.end - a.end || b.order - a.order);
  let boundary = source.length;
  let result = source;
  for (const patch of ordered) {
    if (patch.start < 0 || patch.end < patch.start || patch.end > boundary) fail();
    result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
    boundary = patch.start;
  }
  return result;
}

/** Align equal array values first, including duplicates; pair edits between anchors. */
function alignSequence(original: JsonValue[], edited: JsonValue[]): SequenceItem[] {
  if ((original.length + 1) * (edited.length + 1) > 1_000_000) fail();
  const width = edited.length + 1;
  const lengths = new Uint32Array((original.length + 1) * width);
  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = edited.length - 1; j >= 0; j--) {
      lengths[i * width + j] = equal(original[i]!, edited[j]!)
        ? 1 + lengths[(i + 1) * width + j + 1]!
        : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const anchors: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < original.length && j < edited.length) {
    if (equal(original[i]!, edited[j]!)) {anchors.push([i++, j++]);}
    else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) i++;
    else j++;
  }
  anchors.push([original.length, edited.length]);
  const result: SequenceItem[] = [];
  i = 0;
  j = 0;
  for (const [oldEnd, newEnd] of anchors) {
    while (i < oldEnd && j < newEnd) result.push({index: i++, value: edited[j++]!});
    while (j < newEnd) result.push({value: edited[j++]!});
    i = oldEnd;
    if (oldEnd < original.length) {result.push({index: i++, value: edited[j++]!});}
  }
  return result;
}

function sequence(original: JsonValue[], edited: JsonValue[]): SequenceItem[] {
  let prefix = 0;
  while (prefix < original.length && prefix < edited.length && equal(original[prefix]!, edited[prefix]!)) prefix++;
  let oldEnd = original.length;
  let newEnd = edited.length;
  while (oldEnd > prefix && newEnd > prefix && equal(original[oldEnd - 1]!, edited[newEnd - 1]!)) {oldEnd--; newEnd--;}
  const result: SequenceItem[] = original.slice(0, prefix).map((value, index) => ({index, value}));
  const middle = alignSequence(original.slice(prefix, oldEnd), edited.slice(prefix, newEnd));
  for (const item of middle) result.push('index' in item ? {...item, index: item.index + prefix} : item);
  for (let index = oldEnd; index < original.length; index++) result.push({index, value: original[index]!});
  return result;
}

/** JSON.parse remains the authority for accepted syntax; this only locates tokens. */
function jsonRanges(source: string): JsonNode {
  let offset = 0;
  const whitespace = () => {while (/[\t\n\r ]/.test(source[offset] ?? '\0')) offset++;};
  const string = () => {
    const start = offset++;
    while (source[offset] !== '"') {if (source[offset++] === '\\') offset++;}
    offset++;
    return JSON.parse(source.slice(start, offset)) as string;
  };
  const value = (): JsonNode => {
    whitespace();
    const start = offset;
    const first = source[offset];
    if (first === '{' || first === '[') {
      offset++;
      const entries: Entry[] = [];
      const commas: number[] = [];
      const close = first === '{' ? '}' : ']';
      whitespace();
      while (source[offset] !== close) {
        const memberStart = offset;
        let key: string | undefined;
        if (first === '{') {key = string(); whitespace(); offset++;}
        const child = value();
        entries.push({...key === undefined ? {} : {key}, start: memberStart, end: child.end, node: child});
        whitespace();
        if (source[offset] !== ',') break;
        commas.push(offset++);
        whitespace();
      }
      offset++;
      return {start, end: offset, kind: first === '{' ? 'object' : 'array', entries, commas};
    }
    if (first === '"') string();
    else {while (offset < source.length && !/[\t\n\r ,\]}]/.test(source[offset]!)) offset++;}
    return {start, end: offset, kind: 'value'};
  };
  return value();
}

function delimited(
  entries: readonly {start: number; end: number}[], commas: readonly number[], end: number,
  items: SequenceItem[], patches: Patch[], print: (item: SequenceItem) => string,
  remove: (start: number, end: number) => void
): void {
  const retained = new Set(items.flatMap(item => 'index' in item ? [item.index] : []));
  for (let index = 0; index < entries.length; index++) {
    if (!retained.has(index)) remove(entries[index]!.start, entries[index]!.end);
  }
  const indices = [...retained];
  const keepCommas = new Set(indices.slice(0, -1).map(index => commas[index]));
  for (const comma of commas) if (!keepCommas.has(comma)) patches.push({start: comma, end: comma + 1, text: ''});
  let pending: string[] = [];
  for (const item of items) {
    if (!('index' in item)) {pending.push(print(item)); continue;}
    if (pending.length) {
      patches.push({start: entries[item.index]!.start, end: entries[item.index]!.start, text: `${pending.join(',')},`});
      pending = [];
    }
  }
  if (pending.length) patches.push({start: end - 1, end: end - 1, text: `${retained.size ? ',' : ''}${pending.join(',')}`});
}

function patchJson(source: string, original: JsonValue, edited: JsonValue): string {
  const patches: Patch[] = [];
  const visit = (node: JsonNode, before: JsonValue, after: JsonValue): void => {
    if (equal(before, after)) return;
    if (record(before) && record(after) && node.kind === 'object') {
      const entries = node.entries!;
      // JSON.parse exposes the last occurrence. Earlier duplicates stay byte-exact
      // on updates; deleting a key removes every occurrence so none can reappear.
      const last = new Map<string, number>();
      entries.forEach((entry, index) => last.set(entry.key!, index));
      const items: SequenceItem[] = [];
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;
        if (Object.hasOwn(after, entry.key!)) {
          if (last.get(entry.key!) === index) visit(entry.node, before[entry.key!]!, after[entry.key!]!);
          items.push({index, value: after[entry.key!]!});
        }
      }
      const additions = Object.keys(after).filter(key => !Object.hasOwn(before, key));
      if (items.length !== entries.length || additions.length) {
        for (const key of additions) items.push({value: after[key]!});
        let addition = 0;
        delimited(entries, node.commas!, node.end, items, patches,
          item => `${JSON.stringify(additions[addition++]!)}:${serialize(item.value)}`,
          (start, end) => patches.push({start, end, text: ''}));
      }
      return;
    }
    if (Array.isArray(before) && Array.isArray(after) && node.kind === 'array') {
      const items = sequence(before, after);
      for (const item of items) if ('index' in item) visit(node.entries![item.index]!.node, before[item.index]!, item.value);
      if (items.length !== before.length || items.some((item, index) => !('index' in item) || item.index !== index)) {
        delimited(node.entries!, node.commas!, node.end, items, patches, item => serialize(item.value),
          (start, end) => patches.push({start, end, text: ''}));
      }
      return;
    }
    patches.push({start: node.start, end: node.end, text: serialize(after)});
  };
  visit(jsonRanges(source), original, edited);
  return apply(source, patches);
}

type YamlEntry = {start: number; end: number; node: YamlNode | null; key?: string};
function yamlRange(node: YamlNode | null): [number, number, number] {
  if (!node?.range) fail();
  return node.range;
}
function checkYamlKeys(node: YamlNode | null): void {
  if (isMap(node)) {
    const keys = new Set<string>();
    for (const pair of node.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || keys.has(pair.key.value)) fail();
      keys.add(pair.key.value);
      checkYamlKeys(isNode(pair.value) ? pair.value : null);
    }
  } else if (isSeq(node)) {
    for (const item of node.items) checkYamlKeys(isNode(item) ? item : null);
  }
}
function yamlDocument(source: string) {
  const document = parseDocument(source[0] === '\uFEFF' ? source.slice(1) : source, {keepSourceTokens: true, uniqueKeys: true, strict: true, version: '1.2', prettyErrors: false});
  if (document.errors.length || document.warnings.length) fail();
  checkYamlKeys(document.contents);
  return document;
}
function yamlValue(source: string): JsonValue {
  return snapshot(yamlDocument(source).toJS({maxAliasCount: 100}));
}
function patchYaml(source: string, original: JsonValue, edited: JsonValue): string {
  // YAML 2.x mis-parses a BOM immediately followed by a block sequence. Keep
  // the BOM outside the patch coordinate system and put its exact byte back.
  if (source[0] === '\uFEFF') return '\uFEFF' + patchYaml(source.slice(1), original, edited);
  const document = yamlDocument(source);
  const patches: Patch[] = [];
  const comments: [number, number][] = [];
  const annotations: [number, number][] = [];
  // CST nodes are library-owned, never user-provided objects or iterators.
  const tokens = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {for (const child of value) tokens(child); return;}
    const token = value as {type?: string; offset?: number; source?: string};
    if (typeof token.offset === 'number' && typeof token.source === 'string') {
      const span: [number, number] = [token.offset, token.offset + token.source.length];
      if (token.type === 'comment') comments.push(span);
      if (token.type === 'anchor' || token.type === 'tag' || token.type === 'alias') annotations.push(span);
    }
    for (const child of Object.values(value)) tokens(child);
  };
  tokens(document.contents?.srcToken);
  const remove = (start: number, end: number) => {
    if (comments.some(([a, b]) => a < end && b > start) || annotations.some(([a, b]) => a < end && b > start)) fail();
    patches.push({start, end, text: ''});
  };
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const trimEol = (end: number): number => source[end - 1] === '\n' ? end - (source[end - 2] === '\r' ? 2 : 1) : end;
  const lineStart = (offset: number) => source.lastIndexOf('\n', offset - 1) + 1;
  const visit = (node: YamlNode | null, before: JsonValue, after: JsonValue): void => {
    if (equal(before, after)) return;
    if (!node || isAlias(node) || ('anchor' in node && node.anchor) || node.tag) fail();
    const [start, end] = yamlRange(node);
    if ((isMap(node) && record(before) && record(after)) || (isSeq(node) && Array.isArray(before) && Array.isArray(after))) {
      const entries: YamlEntry[] = [];
      const items: SequenceItem[] = [];
      const additions: string[] = [];
      if (isMap(node) && record(before) && record(after)) {
        for (const pair of node.items) {
          if (!isScalar(pair.key) || typeof pair.key.value !== 'string') fail();
          const child = isNode(pair.value) ? pair.value : null;
          entries.push({start: yamlRange(pair.key)[0], end: child ? yamlRange(child)[1] : yamlRange(pair.key)[1], node: child, key: pair.key.value});
        }
        for (let index = 0; index < entries.length; index++) {
          const entry = entries[index]!;
          if (Object.hasOwn(after, entry.key!)) {visit(entry.node, before[entry.key!]!, after[entry.key!]!); items.push({index, value: after[entry.key!]!});}
        }
        for (const key of Object.keys(after)) if (!Object.hasOwn(before, key)) {additions.push(key); items.push({value: after[key]!});}
      } else if (isSeq(node) && Array.isArray(before) && Array.isArray(after)) {
        for (const child of node.items) {
          if (!isNode(child)) fail();
          const range = yamlRange(child);
          entries.push({start: range[0], end: range[1], node: child});
        }
        items.push(...sequence(before, after));
        for (const item of items) if ('index' in item) visit(entries[item.index]!.node, before[item.index]!, item.value);
      }
      if (items.length === entries.length && items.every((item, index) => 'index' in item && item.index === index)) return;
      let additionIndex = 0;
      const print = (item: SequenceItem) => isMap(node)
        ? `${JSON.stringify(additions[additionIndex++]!)}: ${serialize(item.value)}` : serialize(item.value);
      const token = node.srcToken;
      if (node.flow) {
        if (token?.type !== 'flow-collection') fail();
        const commas = token.items.flatMap(item => item.start.filter(part => part.type === 'comma').map(part => part.offset));
        commas.push(...token.end.filter(part => part.type === 'comma').map(part => part.offset));
        if (commas.length < Math.max(0, entries.length - 1)) fail();
        delimited(entries, commas, end, items, patches, print, remove);
      } else {
        if (token?.type !== 'block-map' && token?.type !== 'block-seq') fail();
        const indent = ' '.repeat(token.indent);
        if (token.type === 'block-seq') {
          for (let index = 0; index < entries.length; index++) {
            const marker = token.items[index]?.start.find(part => part.type === 'seq-item-ind');
            if (!marker) fail();
            entries[index]!.start = marker.offset;
          }
        }
        const retained = new Set(items.flatMap(item => 'index' in item ? [item.index] : []));
        for (let index = 0; index < entries.length; index++) if (!retained.has(index)) remove(entries[index]!.start, trimEol(entries[index]!.end));
        let pending: string[] = [];
        for (const item of items) {
          if (!('index' in item)) {pending.push(`${indent}${isSeq(node) ? '- ' : ''}${print(item)}`); continue;}
          if (pending.length) {
            const offset = lineStart(entries[item.index]!.start);
            if (!/^ *$/.test(source.slice(offset, entries[item.index]!.start))) fail();
            patches.push({start: offset, end: offset, text: pending.join(eol) + eol});
            pending = [];
          }
        }
        if (pending.length) {
          const atLineStart = end === 0 || source[end - 1] === '\n';
          patches.push({start: end, end, text: `${atLineStart ? '' : eol}${pending.join(eol)}${atLineStart ? eol : ''}`});
        }
        if (!items.length) patches.push({start, end: start, text: isMap(node) ? '{}' : '[]'});
      }
      return;
    }
    if (annotations.some(([a, b]) => a < end && b > start) || comments.some(([a, b]) => a < end && b > start)) fail();
    let text = serialize(after);
    if (end > start && source[end - 1] === '\n') text += source[end - 2] === '\r' ? '\r\n' : '\n';
    if (start === end && /[:-]/.test(source[start - 1] ?? '')) text = ` ${text}`;
    if (start === end && source[start] === '#') text += ' ';
    patches.push({start, end, text});
  };
  visit(document.contents, original, edited);
  return apply(source, patches);
}

/** Patch only edited source ranges; unsupported lossless operations fail closed. */
export function patchSource(source: string, format: 'json' | 'yaml', original: JsonValue, edited: JsonValue): string {
  if (typeof source !== 'string' || (format !== 'json' && format !== 'yaml')) fail();
  const before = snapshot(original);
  const after = snapshot(edited);
  // No-op (including edit-and-revert) must retain even an invalid raw document.
  if (equal(before, after)) return source;
  // Whitespace-only input is an explicit creation surface, not a parsed document.
  if (/^[\t\r\n ]*$/.test(source)) return serialize(after);
  const parse = format === 'json' ? (text: string): JsonValue => snapshot(JSON.parse(text)) : yamlValue;
  if (!equal(parse(source), before)) fail();
  const result = format === 'json' ? patchJson(source, before, after) : patchYaml(source, before, after);
  if (!equal(parse(result), after)) fail();
  return result;
}
