// RJSF owns validation and messages; this adapter only decorates its rendered errors.
const bindBlockEditorFieldErrors = (container: HTMLElement): (() => void) => {
  const originals = new Map<Element, Map<string, {original: string | null; applied: string}>>();
  const originalValue = (element: Element, name: string) => {
    const values = originals.get(element);
    const previous = values && values.get(name);
    const current = element.getAttribute(name);
    return previous && current === previous.applied ? previous.original : current;
  };
  const setAttribute = (element: Element, name: string, value: string) => {
    if (element.getAttribute(name) === value) return;
    const original = originalValue(element, name);
    if (!originals.has(element)) originals.set(element, new Map());
    originals.get(element)!.set(name, {original, applied: value});
    element.setAttribute(name, value);
  };
  const restore = (element: Element) => {
    for (const [name, {original, applied}] of originals.get(element)!) {
      // Do not overwrite attributes subsequently changed by RJSF or a custom widget.
      if (element.getAttribute(name) !== applied) continue;
      if (original === null) element.removeAttribute(name);
      else element.setAttribute(name, original);
    }
    originals.delete(element);
  };
  const sync = () => {
    const invalid = new Set<Element>();
    const decorate = (element: Element, messages: readonly Element[], group = false) => {
      invalid.add(element);
      setAttribute(element, 'aria-invalid', 'true');
      setAttribute(element, 'data-block-editor-invalid', group ? 'group' : 'true');
      const descriptions = new Set((originalValue(element, 'aria-describedby') || '')
        .split(/\s+/).filter(Boolean));
      for (const message of messages) descriptions.add(message.id);
      setAttribute(element, 'aria-describedby', [...descriptions].join(' '));
      if (group && !originalValue(element, 'role')) setAttribute(element, 'role', 'group');
      if (group && !element.hasAttribute('aria-label') && !originalValue(element, 'aria-labelledby')) {
        const titles = messages.map(message => message.id.replace(/__error$/, '__title'))
          .filter(id => {
            const title = element.ownerDocument.getElementById(id);
            return title && element.contains(title);
          });
        if (titles.length) setAttribute(element, 'aria-labelledby', titles.join(' '));
      }
    };
    for (const field of container.querySelectorAll('.rjsf .field.has-error')) {
      const messages = [...field.querySelectorAll('.error-detail[id]')].filter(message =>
        message.closest('.field') === field && message.textContent?.trim());
      if (!messages.length) continue;
      if (field.classList.contains('field-object') || field.classList.contains('field-array')) {
        // Group constraints must not mark otherwise valid descendant controls as invalid.
        decorate(field, messages, true);
        continue;
      }
      for (const control of field.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
        if (control.closest('.field') !== field) continue;
        const descriptions = (control.getAttribute('aria-describedby') || '').split(/\s+/);
        const ownMessages = messages.filter(message => descriptions.includes(message.id) ||
          message.id === `${control.id}__error`);
        if (ownMessages.length) decorate(control, ownMessages);
      }
    }
    for (const element of originals.keys()) {
      if (!invalid.has(element)) restore(element);
    }
  };
  const observer = new container.ownerDocument.defaultView!.MutationObserver(sync);
  observer.observe(container, {childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'id']});
  sync();
  return () => {
    observer.disconnect();
    for (const element of originals.keys()) restore(element);
  };
};

export default bindBlockEditorFieldErrors;
