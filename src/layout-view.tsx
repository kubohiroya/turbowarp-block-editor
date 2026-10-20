import * as React from 'react';
import type {EditorLayoutItem} from './layout.js';
import {resolveEditorLayout} from './layout.js';
import type {EditorViewContext} from './types.js';

const Environment = React.createContext({enabled: false, reveal: 0, disabled: false});
export const useCommonLayout = (): boolean => React.useContext(Environment).enabled;
let nextId = 0;
const css = `.block-editor-layout-grid{display:grid;gap:1rem;grid-template-columns:repeat(var(--editor-columns),minmax(0,1fr))}.block-editor-layout-grid>*{min-width:0}.block-editor-layout-tabs>[role=tablist]{display:flex;flex-wrap:wrap;gap:.25rem}.block-editor-layout-tabs>[role=tablist]>[aria-selected=true]{font-weight:bold;text-decoration:underline}.block-editor-layout-tabs>[hidden]{display:none!important}@media(max-width:600px){.block-editor-layout-grid{grid-template-columns:minmax(0,1fr)}}`;

/** One environment for the entire editor; saving reveals errors without changing the draft. */
export function LayoutHost({enabled, context, children}: {enabled: boolean; context: EditorViewContext; children: React.ReactNode}): React.ReactElement {
  const [reveal, setReveal] = React.useState(0);
  const [status, setStatus] = React.useState(context.getState().status);
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let saving = context.getState().status === 'saving';
    let active = true;
    const stop = context.subscribe(() => {
      const state = context.getState();
      const failed = saving && state.status === 'editing' && state.issues.length > 0;
      saving = state.status === 'saving';
      setStatus(state.status);
      if (failed) void Promise.resolve().then(() => {if (active) setReveal(n => n + 1);});
    });
    return () => {active = false;stop();};
  }, [context]);
  React.useEffect(() => {
    if (!enabled || !reveal) return;
    const timer = setTimeout(() => {
      const controls = root.current?.querySelectorAll<HTMLElement>('[data-layout-error="true"] input, [data-layout-error="true"] textarea, [data-layout-error="true"] select');
      const candidates = Array.from(controls ?? []).filter(control => !control.closest('[hidden]') && !control.matches(':disabled') && !control.hasAttribute('data-source-type-control'));
      const target = candidates.find(control => control.closest('[data-source-path]')?.getAttribute('data-source-error') === 'true')
        ?? candidates.find(control => control.closest('.form-group')?.classList.contains('has-error'))
        ?? candidates.find(control => control.closest('[data-layout-field]')?.getAttribute('data-layout-error') === 'true');
      target?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [enabled, reveal]);
  return <Environment.Provider value={{enabled, reveal, disabled: status !== 'editing'}}>
    {enabled ? <div ref={root}><style>{css}</style>{children}</div> : children}
  </Environment.Provider>;
}

export interface LayoutField {readonly name: string; readonly content: React.ReactNode; readonly errors?: number}
function names(items: readonly EditorLayoutItem[]): string[] {
  return items.flatMap(item => 'field' in item ? [item.field] : 'tabs' in item ? item.tabs.flatMap(tab => names(tab.items)) : names(item.items));
}
function Items({items, fields}: {items: readonly EditorLayoutItem[]; fields: ReadonlyMap<string, LayoutField>}): React.ReactElement {
  return <>{items.map((item, index) => {
    if ('field' in item) {
      const field = fields.get(item.field);
      return field ? <div key={index} data-layout-field={item.field} data-layout-error={!!field.errors}>{field.content}</div> : null;
    }
    if ('tabs' in item) return <Tabs key={index} tabs={item.tabs} fields={fields} />;
    if ('group' in item) return <fieldset key={index}><legend>{item.group}</legend><Items items={item.items} fields={fields} /></fieldset>;
    return <div key={index} className="block-editor-layout-grid" style={{'--editor-columns': item.grid} as React.CSSProperties}><Items items={item.items} fields={fields} /></div>;
  })}</>;
}
function Tabs({tabs, fields}: {tabs: Extract<EditorLayoutItem, {tabs: unknown}>['tabs']; fields: ReadonlyMap<string, LayoutField>}): React.ReactElement {
  const {reveal, disabled} = React.useContext(Environment);
  const [selected, select] = React.useState(0);
  const [id] = React.useState(() => `block-editor-layout-${++nextId}`);
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const counts = tabs.map(tab => names(tab.items).reduce((total, name) => total + (fields.get(name)?.errors ?? 0), 0));
  const errors = counts.join(',');
  const handled = React.useRef(0);
  React.useEffect(() => {
    if (reveal <= handled.current) return;
    const first = counts.findIndex(count => count > 0);
    if (first >= 0) {handled.current = reveal;select(first);}
    // Wait for delayed RJSF error propagation, then consume this save attempt once.
  }, [reveal, errors]);
  const current = Math.min(selected, tabs.length - 1);
  return <div className="block-editor-layout-tabs" data-layout-errors={errors}>
    <div role="tablist" aria-label="フォームの項目">
      {tabs.map((tab, index) => <button key={index} ref={element => {buttons.current[index] = element;}} type="button"
        role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={current === index}
        disabled={disabled} tabIndex={current === index ? 0 : -1} onClick={() => select(index)} onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          let target: number;
          switch (event.key) {
            case 'ArrowRight': target = (index + 1) % tabs.length;break;
            case 'ArrowLeft': target = (index + tabs.length - 1) % tabs.length;break;
            case 'Home': target = 0;break;
            case 'End': target = tabs.length - 1;break;
            default: return;
          }
          event.preventDefault();event.stopPropagation();select(target);buttons.current[target]?.focus();
        }}>{tab.label}{counts[index] ? <span aria-label={`エラー ${counts[index]} 件`}> ({counts[index]})</span> : null}</button>)}
    </div>
    {tabs.map((tab, index) => <div key={index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`}
      hidden={current !== index}><Items items={tab.items} fields={fields} /></div>)}
  </div>;
}

/** Share layout behavior while leaving each renderer in charge of its controls. */
export function ObjectLayout({ui, fields, knownFields, fallback}: {ui: unknown; fields: readonly LayoutField[]; knownFields: readonly string[]; fallback: React.ReactNode}): React.ReactElement {
  const {enabled} = React.useContext(Environment);
  const resolution = enabled ? resolveEditorLayout(ui, knownFields) : {kind: 'absent'} as const;
  if (resolution.kind === 'absent') return <>{fallback}</>;
  if (resolution.kind === 'invalid') return <><p role="status" data-layout-diagnostic="">レイアウトを適用できません: {resolution.diagnostic}</p>{fallback}</>;
  const map = new Map(fields.map(field => [field.name, field]));
  return <><Items items={resolution.items} fields={map} />{fields.filter(field => !resolution.fields.has(field.name)).map(field =>
    <div key={field.name} data-layout-field={field.name} data-layout-error={!!field.errors}>{field.content}</div>)}</>;
}
