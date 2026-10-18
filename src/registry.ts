import {captureReference, captureSnapshot} from './data.js';
import {EditorSession} from './session.js';
import {DescendantSession} from './descendants.js';
import {supportsDescendantEditing} from './descendant-types.js';
import type {DescendantLimits} from './descendant-types.js';
import {captureSubtree, descendantLimits} from './subtree.js';
import {EDITOR_API_VERSION} from './types.js';
import type {BlockEditorHost, BlockReference, EditorDefinition, EditorDescriptor} from './types.js';
import type {PreparedEditorDefinition} from './prepared-types.js';
import {isPreparedEditor} from './prepared-save.js';

export class EditorRegistry {
  #editors = new Map<string, EditorDefinition>();
  #opcodes = new Map<string, EditorDefinition>();
  #changes = new Set<() => void>();

  register(definition: EditorDefinition): () => void {
    if (isPreparedEditor(definition)) throw new TypeError('Prepared editors require registerPrepared().');
    return this.#register(definition);
  }

  registerPrepared(definition: PreparedEditorDefinition): () => void {
    if (!isPreparedEditor(definition) || typeof definition.prepareSave !== 'function') {
      throw new TypeError('Expected a prepared source editor.');
    }
    return this.#register(definition);
  }

  #register(definition: EditorDefinition): () => void {
    if (definition.apiVersion !== EDITOR_API_VERSION) throw new TypeError('Unsupported editor API version.');
    if (!/^[a-z0-9]+$/i.test(definition.extensionId) ||
        !/^[a-z0-9][a-z0-9._-]*$/i.test(definition.editorId)) {
      throw new TypeError('Invalid extension ID or editor ID.');
    }
    if (!Array.isArray(definition.opcodes) || definition.opcodes.length === 0 ||
        new Set(definition.opcodes).size !== definition.opcodes.length ||
        definition.opcodes.some(opcode => typeof opcode !== 'string' ||
          !opcode.startsWith(`${definition.extensionId}_`) || opcode === `${definition.extensionId}_`)) {
      throw new TypeError('Expected distinct full opcodes belonging to the extension.');
    }
    if (!Array.isArray(definition.editableArguments) ||
        new Set(definition.editableArguments).size !== definition.editableArguments.length ||
        definition.editableArguments.some(name => typeof name !== 'string' || !name)) {
      throw new TypeError('Expected distinct editable argument names.');
    }
    if (typeof definition.read !== 'function' || typeof definition.validate !== 'function' ||
        typeof definition.createPatch !== 'function' ||
        (definition.mount !== undefined && typeof definition.mount !== 'function')) {
      throw new TypeError('Invalid editor callbacks.');
    }
    const key = JSON.stringify([definition.extensionId, definition.editorId]);
    if (this.#editors.has(key) || definition.opcodes.some(opcode => this.#opcodes.has(opcode))) {
      throw new Error('The editor ID or an opcode is already registered.');
    }
    const entry = Object.freeze({
      ...definition,
      opcodes: Object.freeze([...definition.opcodes]),
      editableArguments: Object.freeze([...definition.editableArguments])
    });
    this.#editors.set(key, entry);
    for (const opcode of entry.opcodes) this.#opcodes.set(opcode, entry);
    this.#notifyChanges();
    return () => {
      if (this.#editors.get(key) !== entry) return;
      this.#editors.delete(key);
      for (const opcode of entry.opcodes) this.#opcodes.delete(opcode);
      this.#notifyChanges();
    };
  }

  resolve(opcode: string): EditorDescriptor | undefined {
    const entry = this.#opcodes.get(opcode);
    if (!entry) return undefined;
    return Object.freeze({
      apiVersion: entry.apiVersion, extensionId: entry.extensionId, editorId: entry.editorId,
      opcodes: entry.opcodes, editableArguments: entry.editableArguments
    });
  }

  open(reference: BlockReference, host: BlockEditorHost): EditorSession | undefined {
    const capturedReference = captureReference(reference);
    const live = host.readBlock(capturedReference);
    if (!live) return undefined;
    const snapshot = captureSnapshot(live, capturedReference);
    const entry = this.#opcodes.get(snapshot.opcode);
    return entry ? new EditorSession(entry, snapshot, host, isPreparedEditor(entry)
      ? () => this.#opcodes.get(snapshot.opcode) === entry : undefined) : undefined;
  }

  openDescendants(reference: BlockReference, host: BlockEditorHost, limits?: DescendantLimits): DescendantSession | undefined {
    if (!supportsDescendantEditing(host)) return undefined;
    const port = host.descendants;
    const capturedReference = captureReference(reference);
    const resolvedLimits = descendantLimits(limits);
    const live = port.readSubtree(capturedReference);
    if (!live) return undefined;
    const captured = captureSubtree(live, capturedReference, resolvedLimits);
    if (!this.#opcodes.has(captured.snapshot.nodes[0]!.block.opcode)) return undefined;
    return new DescendantSession(captured, port, opcode => this.#opcodes.get(opcode), listener => {
      this.#changes.add(listener);
      return () => { this.#changes.delete(listener); };
    }, resolvedLimits);
  }

  #notifyChanges(): void {
    for (const listener of [...this.#changes]) listener();
  }
}
