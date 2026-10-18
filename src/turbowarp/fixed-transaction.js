import {BlockEditorConflictError, FIXED_INPUTS_CAPABILITY} from '../index.js';
import {captureFixedInputDeclaration, captureFixedSnapshot, sameFixedSnapshot} from '../fixed-input-snapshot.js';
import {initializeFixedFields, inspectFixedArgument, prepareFixedChange, restoreFixedField, captureFixedFieldState} from './fixed-fields.js';
import {snapshotJson} from '../schema-json.js';

const own = (object, name) => {
    const descriptor = object && Object.getOwnPropertyDescriptor(object, name);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError('Expected an own data property.');
    }
    return descriptor.value;
};
const inheritedData = (object, key) => {
    for (let item = object; item; item = Object.getPrototypeOf(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (descriptor) {
            if (!('value' in descriptor)) throw new TypeError('Unsupported undo configuration.');
            return descriptor.value;
        }
    }
    return undefined;
};
const ensureNativeHistory = stack => {
    if (!Array.isArray(stack) || !Object.isExtensible(stack) ||
        Object.getOwnPropertySymbols(stack).length || !Object.getOwnPropertyDescriptor(stack, 'length').writable) {
        throw new TypeError('Unsupported undo history.');
    }
    if (Object.getOwnPropertyNames(stack).length !== stack.length + 1) throw new TypeError('Unsupported undo history.');
    for (let index = 0; index < stack.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(stack, String(index));
        if (!descriptor || !('value' in descriptor) || !descriptor.writable || !descriptor.configurable) {
            throw new TypeError('Unsupported undo history.');
        }
    }
};
const copyHistory = stack => {
    const copy = [];
    for (let index = 0; index < stack.length; index++) copy.push(own(stack, String(index)));
    return copy;
};
const replaceHistory = (stack, values) => {
    stack.length = 0;
    for (const value of values) Array.prototype.push.call(stack, value);
};
const conflict = () => { throw new BlockEditorConflictError(); };
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const isAborted = signal => aborted.call(signal);
const optionalOwn = (object, name) => {
    const descriptor = object && Object.getOwnPropertyDescriptor(object, name);
    if (descriptor && !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError('VM state must contain data properties.');
    }
    return descriptor && descriptor.value;
};
const stateToken = (value, identify, seen = new Set()) => {
    if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
    if (value === undefined) return ['undefined'];
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value !== 'object' || seen.has(value) || seen.size > 64) throw new TypeError('Unsupported VM state.');
    seen.add(value);
    const result = Object.getOwnPropertyNames(value).sort().map(key => [key, stateToken(own(value, key), identify, seen)]);
    seen.delete(value);
    return ['object', identify(value), result];
};
const untouchedState = (block, vmBlock, target, bindings, identify) => {
    const omitted = new Map();
    for (const binding of bindings.values()) {
        if (!omitted.has(binding.vmBlock)) omitted.set(binding.vmBlock, new Set());
        omitted.get(binding.vmBlock).add(binding.fieldName);
    }
    const seen = new Set();
    const records = [];
    const capture = item => {
        if (!item || seen.has(item)) return;
        seen.add(item);
        const fields = item.fields || {};
        records.push([identify(item), ['id', 'opcode', 'parent', 'next', 'inputs', 'mutation', 'shadow', 'topLevel']
            .map(key => [key, stateToken(optionalOwn(item, key), identify)]), identify(fields), Object.keys(fields).sort()
            .map(key => {
                const field = own(fields, key);
                if (!omitted.get(item)?.has(key)) return [key, stateToken(field, identify)];
                return [key, identify(field), Object.getOwnPropertyNames(field).sort()
                    .filter(property => property !== 'value').map(property => [property, stateToken(own(field, property), identify)])];
            })]);
    };
    capture(vmBlock);
    const connections = [];
    for (const input of block.inputList) {
        const connected = input.connection && input.connection.targetBlock();
        connections.push([input.name || '', identify(input), input.connection ? identify(input.connection) : null, connected ? [connected.id, connected.type, identify(connected)] : null]);
        if (connected) capture(target.blocks.getBlock(connected.id));
    }
    const statementConnections = ['nextConnection', 'previousConnection', 'outputConnection'].map(name => {
        const connection = block[name];
        const connected = connection && connection.targetBlock();
        return [name, connection ? identify(connection) : null,
            connection && connection.targetConnection ? identify(connection.targetConnection) : null,
            connected ? [connected.id, connected.type, identify(connected)] : null];
    });
    return JSON.stringify([records, connections, statementConnections]);
};
const sameDeclaration = (left, right) => JSON.stringify(captureFixedInputDeclaration(left)) ===
    JSON.stringify(captureFixedInputDeclaration(right));

// Fixed inputs deliberately use a separate transaction from the legacy TEXT adapter.
export default function createFixedInputPort({ScratchBlocks, workspace, vm, registry, identify, getState,
    begin, markEvent, finish, onError}) {
    initializeFixedFields(ScratchBlocks);
    const inspect = (reference, suppliedDeclaration) => {
        const state = getState();
        const target = vm.editingTarget;
        if (state.disposed || !target || target.id !== reference.targetId || workspace.isFlyout ||
            workspace.options.readOnly || (workspace.isDragging && workspace.isDragging())) return null;
        const block = workspace.getBlockById(reference.blockId);
        if (!block || block.isInFlyout || block.isShadow() || !block.isEditable()) return null;
        const descriptor = registry.resolve(block.type);
        const declaration = registry.resolveFixed(block.type);
        if (!descriptor || !declaration || !sameDeclaration(declaration, suppliedDeclaration)) return null;
        const vmBlock = target.blocks.getBlock(block.id);
        const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
        if (!vmBlock || (nextBlock ? nextBlock.id : null) !== (vmBlock.next || null) || vmBlock.opcode !== block.type ||
            (block.getParent() ? block.getParent().id : null) !== (vmBlock.parent || null)) return null;
        const arguments_ = Object.create(null);
        const inputs = Object.create(null);
        const bindings = new Map();
        const signature = [state.revision, identify(target), identify(block), identify(vmBlock), identify(declaration)];
        for (const [role, names] of [['editable', declaration.editableArguments], ['readonly', declaration.readOnlyArguments]]) {
            for (const argument of names) {
                const item = inspectFixedArgument({ScratchBlocks, block, vmBlock, target, argument, role,
                    identify, extensionId: descriptor.extensionId});
                if (!item) return null;
                arguments_[argument] = item.slot;
                inputs[argument] = item.metadata;
                if (role === 'editable' && item.binding) bindings.set(argument, item.binding);
                signature.push(argument, item.signatureParts);
            }
        }
        const untouched = untouchedState(block, vmBlock, target, bindings, identify);
        signature.push(untouched);
        const snapshot = captureFixedSnapshot({targetId: target.id, blockId: block.id, opcode: block.type,
            revision: JSON.stringify(signature), arguments: arguments_, fixedContext: {
                contractId: declaration.contractId, contractRevision: declaration.contractRevision,
                generation: String(state.generation), readOnlyArguments: declaration.readOnlyArguments,
                dependencies: declaration.dependencies, inputs
            }}, reference, declaration);
        return {snapshot, bindings, declaration, target, block, vmBlock, state, untouched, runtime: vm.runtime};
    };

    const commit = request => {
        const expectedInput = own(request, 'expected');
        const changesInput = own(request, 'changes');
        const signal = own(request, 'signal');
        try {
            const contextInput = own(request, 'context');
            const context = snapshotJson({consumerId: own(contextInput, 'consumerId'),
                nowMs: own(contextInput, 'nowMs'), settings: own(contextInput, 'settings')});
            if (typeof context.consumerId !== 'string' || !context.consumerId ||
                typeof context.nowMs !== 'number' || !Number.isFinite(context.nowMs)) {
                throw new TypeError('Invalid fixed validation context.');
            }
        } catch {
            throw new TypeError('Invalid fixed validation context.');
        }
        if (isAborted(signal)) conflict();
        const expected = captureFixedSnapshot(expectedInput);
        const current = inspect(expected, registry.resolveFixed(expected.opcode));
        if (!current || !sameFixedSnapshot(expected, current.snapshot)) conflict();
        const declaration = current.declaration;
        captureFixedSnapshot(expected, expected, declaration);
        if (!Array.isArray(changesInput)) throw new TypeError('Expected a fixed argument patch array.');
        const prepared = [];
        const seenNames = new Set();
        const seenFields = new Set();
        const grouped = new Set(declaration.dependencies.flatMap(item => [item.selector, ...item.dependents]));
        for (let i = 0; i < changesInput.length; i++) {
            const change = own(changesInput, String(i));
            const name = own(change, 'argument');
            const value = own(change, 'value');
            if (typeof name !== 'string' || seenNames.has(name) ||
                !declaration.editableArguments.includes(name) || !current.bindings.has(name)) {
                throw new TypeError('Only distinct editable standard fields may be changed.');
            }
            seenNames.add(name);
            const binding = current.bindings.get(name);
            if (seenFields.has(binding.field)) throw new TypeError('Duplicate field write.');
            seenFields.add(binding.field);
            if (Object.is(value, binding.value)) continue;
            if (grouped.has(name)) throw new TypeError('Fixed branch changes require branch support.');
            prepared.push({...prepareFixedChange(binding, value), argument: name});
        }
        const guard = () => {
            const state = getState();
            if (isAborted(signal) || state.disposed || state.generation !== current.state.generation ||
                state.externalRevision !== current.state.externalRevision || vm.editingTarget !== current.target ||
                vm.runtime !== current.runtime ||
                registry.resolveFixed(expected.opcode) !== declaration) conflict();
        };
        guard();
        const beforeWrite = inspect(expected, declaration);
        if (!beforeWrite || !sameFixedSnapshot(expected, beforeWrite.snapshot)) conflict();
        guard();
        if (!prepared.length) return;
        const Events = ScratchBlocks.Events;
        if (!Events.isEnabled() || !Events.recordUndo || Events.getGroup() ||
            !Array.isArray(workspace.undoStack_) || !Array.isArray(workspace.redoStack_)) {
            throw new Error('The workspace is busy or its undo API is unsupported.');
        }
        const undoStack = workspace.undoStack_;
        const redoStack = workspace.redoStack_;
        ensureNativeHistory(undoStack);
        ensureNativeHistory(redoStack);
        const configuredMaxUndo = inheritedData(workspace, 'MAX_UNDO');
        const maxUndo = configuredMaxUndo === undefined ? Infinity : configuredMaxUndo;
        if (maxUndo !== Infinity && (!Number.isSafeInteger(maxUndo) || maxUndo < 0)) {
            throw new TypeError('Unsupported undo configuration.');
        }
        const undo = copyHistory(undoStack);
        const redo = copyHistory(redoStack);
        const oldGroup = Events.getGroup();
        const runtime = current.runtime;
        const dirty = runtime.emitProjectChanged;
        const dirtyDescriptor = Object.getOwnPropertyDescriptor(runtime, 'emitProjectChanged');
        const savedVmFields = prepared.map(item => ({binding: item, block: item.vmBlock, name: item.fieldName,
            fields: item.vmBlock.fields, field: item.vmBlock.fields[item.fieldName],
            descriptors: Object.getOwnPropertyDescriptors(item.vmBlock.fields[item.fieldName])}));
        let succeeded = false;
        let failure;
        let activeEvent = null;
        const pendingHistory = [];
        const externalWrites = new Map();
        const byField = new Map(prepared.map(item => [JSON.stringify([item.block.id, item.fieldName]), item]));
        let externalDirty = false;
        const ownedEvents = new WeakSet();
        const originalDelivery = workspace.fireChangeListener;
        const deliveryDescriptor = Object.getOwnPropertyDescriptor(workspace, 'fireChangeListener');
        const stableScope = () => {
            const state = getState();
            return state.generation === current.state.generation && vm.editingTarget === current.target && vm.runtime === runtime;
        };
        let begun = false;
        try {
            runtime.emitProjectChanged = () => {
                if (!activeEvent || !ownedEvents.has(activeEvent) || !stableScope()) externalDirty = true;
            };
            workspace.fireChangeListener = function (event) {
                const previous = activeEvent;
                const external = event && !event.isUiEvent && !ownedEvents.has(event);
                const edited = external && event.type === 'change' && event.element === 'field' &&
                    byField.get(JSON.stringify([event.blockId, event.name]));
                if (edited && !externalWrites.has(edited.field)) {
                    // An external undo must not revive this editor's uncommitted candidate.
                    if (Object.is(event.oldValue, edited.next)) event.oldValue = edited.value;
                    externalWrites.set(edited.field, null);
                }
                activeEvent = event;
                try { return originalDelivery.call(this, event); } finally {
                    if (edited) {
                        const fields = edited.vmBlock.fields;
                        const field = fields && fields[edited.fieldName];
                        externalWrites.set(edited.field, {binding: captureFixedFieldState(edited),
                            fields, field, descriptors: field && Object.getOwnPropertyDescriptors(field)});
                    }
                    activeEvent = previous;
                }
            };
            Events.setGroup(true);
            Events.disable();
            begin();
            begun = true;
            guard();
            for (const item of prepared) {
                guard();
                item.field.setValue(item.next);
                if (!Object.is(item.field.getValue(), item.next)) throw new Error('The field rejected its value.');
                guard();
            }
            for (const item of prepared) {
                guard();
                const event = new Events.Change(item.block, 'field', item.fieldName, item.value, item.next);
                ownedEvents.add(event);
                markEvent(event);
                // Stage only editor-owned undo records; external events retain normal semantics.
                const recordUndo = event.recordUndo;
                event.recordUndo = false;
                try { workspace.fireChangeListener(event); } finally { event.recordUndo = recordUndo; }
                if (recordUndo) pendingHistory.push(event);
                guard();
            }
            const after = inspect(expected, declaration);
            if (!after || after.untouched !== current.untouched) conflict();
            const wantedArguments = {...expected.arguments};
            for (const item of prepared) wantedArguments[item.argument] = {kind: 'literal', value: item.next};
            if (!sameFixedSnapshot({...expected, revision: after.snapshot.revision, arguments: wantedArguments},
                after.snapshot)) conflict();
            guard();
            if (workspace.undoStack_ !== undoStack || workspace.redoStack_ !== redoStack ||
                undoStack.length !== undo.length || redoStack.length !== redo.length ||
                undo.some((entry, index) => undoStack[index] !== entry) ||
                redo.some((entry, index) => redoStack[index] !== entry)) conflict();
            ensureNativeHistory(undoStack);
            ensureNativeHistory(redoStack);
            // This section contains no vendor callbacks; both native arrays are writable dense data.
            try {
                for (const event of pendingHistory) Array.prototype.push.call(undoStack, event);
                if (undoStack.length > maxUndo) {
                    Array.prototype.copyWithin.call(undoStack, 0, undoStack.length - maxUndo);
                    undoStack.length = maxUndo;
                }
                redoStack.length = 0;
            } catch (error) {
                replaceHistory(undoStack, undo);
                replaceHistory(redoStack, redo);
                throw error;
            }
            succeeded = true;
        } catch (error) {
            failure = error;
            for (const item of begun ? prepared : []) {
                try { restoreFixedField(externalWrites.get(item.field)?.binding || item); } catch (restoreError) {
                    // Continue restoring every independent field before reporting a failure.
                    try { onError(restoreError); } catch { /* Observer failures do not interrupt rollback. */ }
                }
            }
            for (const saved of begun ? savedVmFields : []) {
                const outside = externalWrites.get(saved.binding.field);
                const fields = saved.block.fields;
                if (!fields) continue;
                const field = outside ? outside.field : saved.field;
                const descriptors = outside ? outside.descriptors : saved.descriptors;
                if (!field) { delete fields[saved.name]; continue; }
                fields[saved.name] = field;
                for (const key of Object.keys(field)) if (!Object.hasOwn(descriptors, key)) delete field[key];
                Object.defineProperties(field, descriptors);
            }
            if (begun && typeof current.target.blocks.resetCache === 'function') current.target.blocks.resetCache();
            // Pending editor events never entered either history. External histories are authoritative.

        } finally {
            try { if (begun) finish(succeeded); } finally {
                try { if (!Events.isEnabled()) Events.enable(); } finally {
                    try { Events.setGroup(oldGroup); } finally {
                        if (deliveryDescriptor) Object.defineProperty(workspace, 'fireChangeListener', deliveryDescriptor);
                        else delete workspace.fireChangeListener;
                        if (dirtyDescriptor) Object.defineProperty(runtime, 'emitProjectChanged', dirtyDescriptor);
                        else delete runtime.emitProjectChanged;
                    }
                }
            }
        }
        if (succeeded || externalDirty) {
            try { dirty.call(runtime); } catch (error) {
                try { onError(error); } catch { /* Dirty observers do not change the transaction result. */ }
            }
        }
        if (!succeeded) throw failure;
    };
    return Object.freeze({capability: FIXED_INPUTS_CAPABILITY,
        readBlock: (reference, declaration) => inspect(reference, declaration)?.snapshot || null, commit});
}
