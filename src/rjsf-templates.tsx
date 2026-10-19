import * as React from 'react';
import type {ArrayFieldTemplateItemType, FieldTemplateProps, IconButtonProps, ObjectFieldTemplateProps,
  WrapIfAdditionalTemplateProps} from '@rjsf/utils';

const ItemNumber = React.createContext(1);
const PropertyKey = React.createContext<string | undefined>(undefined);

/** Keep the property key out of the value's visible label. */
export function valueFieldTemplate(DefaultTemplate: React.ComponentType<FieldTemplateProps>, flag: string) {
  return function ValueField(props: FieldTemplateProps): React.ReactElement {
    if (!(flag in props.schema)) return <DefaultTemplate {...props} />;
    return <PropertyKey.Provider value={props.label}>
      <DefaultTemplate {...props} label="値" />
    </PropertyKey.Provider>;
  };
}

/** Keep RJSF's object layout while numbering each editable additional property. */
export function numberedObjectTemplate(DefaultTemplate: React.ComponentType<ObjectFieldTemplateProps>, flag: string) {
  return function ObjectItems(props: ObjectFieldTemplateProps): React.ReactElement {
    let number = 0;
    const properties = props.properties.map(property => {
      const schema = props.schema.properties?.[property.name];
      if (!schema || typeof schema !== 'object' || !(flag in schema) || property.hidden) return property;
      return {...property, content: <ItemNumber.Provider key={property.name} value={++number}>
        {property.content}
      </ItemNumber.Provider>};
    });
    return <DefaultTemplate {...props} properties={properties} />;
  };
}

export function additionalItemTemplate(flag: string) {
  return function AdditionalItem(props: WrapIfAdditionalTemplateProps): React.ReactElement {
    const number = React.useContext(ItemNumber);
    const propertyKey = React.useContext(PropertyKey);
    const {id, classNames, style, children, schema, label, disabled, readonly, onKeyChange, onDropPropertyClick} = props;
    if (!(flag in schema)) return <div className={classNames} style={style}>{children}</div>;
    const key = propertyKey ?? label;
    return <div className={classNames} style={style} data-block-editor-item="">
      <div data-block-editor-item-heading="">
        <span>・項目{number}</span>
        <ItemMenu disabled={disabled || readonly} onClick={onDropPropertyClick(key)} />
      </div>
      <div data-block-editor-pair-row="">
        <label htmlFor={`${id}-key`}>キー</label>
        <input id={`${id}-key`} type="text" defaultValue={key} disabled={disabled} readOnly={readonly}
          onBlur={event => onKeyChange(event.target.value)} />
      </div>
      <div data-block-editor-pair-row="">{children}</div>
    </div>;
  };
}

/** Deletion is available only after explicitly opening the item's menu. */
export function ItemMenu({disabled, onClick}: Pick<IconButtonProps, 'disabled' | 'onClick'>): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const container = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const item = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [open]);
  React.useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <div data-block-editor-item-menu="" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (open) item.current?.focus();
      else if (!disabled) setOpen(true);
    }
  }}>
    <button aria-label="項目のメニュー" aria-haspopup="menu" aria-expanded={open && !disabled}
      disabled={disabled} ref={trigger} type="button" onClick={() => setOpen(!open)}>…</button>
    {open && !disabled ? <div role="menu" aria-label="項目の操作">
      <button ref={item} role="menuitem" type="button" onClick={event => {
        setOpen(false);
        trigger.current?.focus();
        onClick?.(event);
      }}>🗑️この項目を削除</button>
    </div> : null}
  </div>;
}

export function AddItemButton({disabled, onClick, className}: IconButtonProps): React.ReactElement {
  return <button className={className} data-block-editor-add-item="" disabled={disabled}
    type="button" onClick={onClick}>➕項目を追加</button>;
}

export function ArrayItem(props: ArrayFieldTemplateItemType): React.ReactElement {
  const {children, className, disabled, readonly, index, hasMoveUp, hasMoveDown, hasCopy,
    hasRemove, onReorderClick, onCopyIndexClick, onDropIndexClick} = props;
  const locked = disabled || readonly;
  return <div className={className} data-block-editor-item="">
    <div data-block-editor-item-heading="">
      <span>・項目{index + 1}</span>
      <div data-block-editor-item-actions="">
        {hasMoveUp || hasMoveDown ? <>
          <button aria-label="項目を上へ移動" disabled={locked || !hasMoveUp} type="button"
            onClick={onReorderClick(index, index - 1)}>↑</button>
          <button aria-label="項目を下へ移動" disabled={locked || !hasMoveDown} type="button"
            onClick={onReorderClick(index, index + 1)}>↓</button>
        </> : null}
        {hasCopy ? <button disabled={locked} type="button" onClick={onCopyIndexClick(index)}>項目を複製</button> : null}
        {hasRemove ? <ItemMenu disabled={locked} onClick={onDropIndexClick(index)} /> : null}
      </div>
    </div>
    {children}
  </div>;
}
