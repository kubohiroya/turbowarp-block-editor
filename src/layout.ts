/** JSON-only presentation metadata. Field names are literal immediate object keys, never paths. */
export type EditorLayoutItem =
  | {readonly field: string}
  | {readonly group: string; readonly items: readonly EditorLayoutItem[]}
  | {readonly grid: number; readonly items: readonly EditorLayoutItem[]}
  | {readonly tabs: readonly {readonly label: string; readonly items: readonly EditorLayoutItem[]}[]};
export type EditorLayout = {
  readonly version: 1;
  readonly items: readonly EditorLayoutItem[];
};
export type LayoutResolution =
  | {readonly kind: 'absent'}
  | {readonly kind: 'invalid'; readonly diagnostic: string}
  | {readonly kind: 'layout'; readonly items: readonly EditorLayoutItem[]; readonly fields: ReadonlySet<string>};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Validate the whole declaration before moving any controls. Invalid metadata never hides fields. */
export function resolveEditorLayout(ui: unknown, knownFields: readonly string[]): LayoutResolution {
  if (!record(ui) || !record(ui['ui:options']) || !Object.hasOwn(ui['ui:options'], 'extensionDataLayout')) return {kind: 'absent'};
  const input = ui['ui:options'].extensionDataLayout;
  const known = new Set(knownFields), fields = new Set<string>();
  let count = 0;
  const fail = (message: string): never => {throw new TypeError(message);};
  const keys = (node: Record<string, unknown>, expected: string[]): void => {
    if (Object.keys(node).some(key => !expected.includes(key))) fail('Unknown layout option.');
  };
  const label = (text: unknown): string => typeof text === 'string' && text.trim().length > 0 && text.length <= 128 ? text : fail('Invalid layout label.');
  const items = (value: unknown, depth: number): EditorLayoutItem[] => {
    if (depth > 8 || !Array.isArray(value) || value.length > 256) return fail('Layout limit exceeded.');
    return value.map((node: unknown): EditorLayoutItem => {
      if (++count > 256 || !record(node)) return fail('Invalid layout item or limit exceeded.');
      if (Object.hasOwn(node, 'field')) {
        keys(node, ['field']);
        if (typeof node.field !== 'string' || !known.has(node.field)) return fail('Unknown layout field.');
        if (fields.has(node.field)) return fail('Duplicate layout field.');
        fields.add(node.field);return {field: node.field};
      }
      if (Object.hasOwn(node, 'group')) {keys(node, ['group', 'items']);return {group: label(node.group), items: items(node.items, depth + 1)};}
      if (Object.hasOwn(node, 'grid')) {
        keys(node, ['grid', 'items']);
        if (typeof node.grid !== 'number' || !Number.isInteger(node.grid) || node.grid < 1 || node.grid > 4) return fail('Grid columns must be 1–4.');
        return {grid: node.grid, items: items(node.items, depth + 1)};
      }
      if (Object.hasOwn(node, 'tabs')) {
        keys(node, ['tabs']);
        if (!Array.isArray(node.tabs) || !node.tabs.length || node.tabs.length > 16) return fail('Invalid tab count.');
        return {tabs: node.tabs.map((tab: unknown) => {
          if (++count > 256 || !record(tab)) return fail('Invalid tab or limit exceeded.');
          keys(tab, ['label', 'items']);return {label: label(tab.label), items: items(tab.items, depth + 1)};
        })};
      }
      return fail('Unknown layout item.');
    });
  };
  try {
    if (!record(input) || input.version !== 1) return fail('Unsupported layout version.');
    keys(input, ['version', 'items']);
    return {kind: 'layout', items: items(input.items, 0), fields};
  } catch (error) {return {kind: 'invalid', diagnostic: error instanceof Error ? error.message : 'Invalid layout.'};}
}
