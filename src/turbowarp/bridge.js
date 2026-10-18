import createBlockEditorHost from './host.js';
import bindBlockEditorIcon from './icon.js';
import readBlockEditorAppearance from './appearance.js';
import {supportsDescendantEditing} from '../index.js';
import createBlockEditorErrorSession from './error-session.js';

const openBlockEditorSession = ({registry, reference, host, descendants}) => (
    descendants && supportsDescendantEditing(host) ?
        registry.openDescendants(reference, host) : registry.open(reference, host)
);

const createBlockEditorBridge = ({ScratchBlocks, workspace, vm, service, label, canOpen, onOpen, onError,
    descendants = false}) => {
    const host = createBlockEditorHost({ScratchBlocks,
        workspace,
        vm,
        registry: service.registry,
        enableDescendants: descendants,
        onError});
    const decorations = new Map();
    let disposed = false;
    let timer = null;
    let activeSession = null;
    let openingSnapshot = null;
    let stopWaiting = null;
    const endSession = () => {
        const session = activeSession;
        if (!session) return;
        if (typeof session.invalidate === 'function') {
            session.invalidate();
            return;
        }
        // Normal close is refused while saving. Host invalidation also blocks commit,
        // then releases the old view as soon as its pending validation settles.
        if (session.dispose()) return;
        if (!stopWaiting) {
            stopWaiting = session.subscribe(() => {
                if (session.getState().status === 'saving') return;
                stopWaiting();
                stopWaiting = null;
                session.dispose();
            });
        }
    };
    const checkSession = () => {
        // The host owns rollback. Its synchronous transaction must retain the draft on failure.
        if (host.isCommitting()) return;
        if (!activeSession || !openingSnapshot ||
            !['editing', 'saving'].includes(activeSession.getState().status)) return;
        const current = typeof activeSession.getNodes === 'function' ?
            host.descendants.readSubtree(activeSession.reference) : host.readBlock(activeSession.reference);
        if (!current || JSON.stringify(current) !== JSON.stringify(openingSnapshot)) endSession();
    };
    const available = block => {
        if (disposed || !vm.editingTarget || !canOpen() || !service.registry.resolve(block.type)) return false;
        const snapshot = host.readBlock({targetId: vm.editingTarget.id, blockId: block.id});
        return snapshot && Object.values(snapshot.arguments).every(slot => slot.kind === 'literal');
    };
    const open = block => {
        if (activeSession && ['editing', 'saving'].includes(activeSession.getState().status)) return;
        const reference = {targetId: vm.editingTarget.id, blockId: block.id};
        try {
            const session = openBlockEditorSession({registry: service.registry, reference, host, descendants});
            if (!session && descendants) throw new Error('The complete block hierarchy is not editable.');
            if (session) {
                ScratchBlocks.hideChaff();
                activeSession = session;
                openingSnapshot = typeof session.getNodes === 'function' ?
                    host.descendants.readSubtree(session.reference) : host.readBlock(session.reference);
                const labels = {};
                const appearances = Object.create(null);
                if (typeof session.getNodes === 'function') {
                    for (const node of session.getNodes()) {
                        const source = workspace.getBlockById(node.reference.blockId);
                        const appearance = readBlockEditorAppearance(source, ScratchBlocks);
                        appearances[node.reference.blockId] = appearance;
                        labels[node.reference.blockId] = appearance.name || node.opcode;
                    }
                }
                onOpen(session, labels, appearances);
            }
        } catch (error) {
            onError(error);
            activeSession = createBlockEditorErrorSession(reference, error);
            openingSnapshot = null;
            onOpen(activeSession);
        }
    };
    const refresh = () => {
        if (disposed) return;
        const seen = new Set();
        for (const block of workspace.getAllBlocks(false)) {
            const input = block.inputList[0];
            const field = input && input.fieldRow[0];
            if (workspace.options.readOnly || !service.registry.resolve(block.type) || !field ||
                !(field instanceof ScratchBlocks.FieldImage) || !field.fieldGroup_ ||
                block.isInFlyout || block.isShadow() || !block.isEditable()) continue;
            seen.add(block.id);
            const old = decorations.get(block.id);
            if (old && old.field === field) continue;
            if (old) old.cleanup();
            const tooltip = field.imageElement_.tooltip;
            field.setTooltip(label);
            const unbind = bindBlockEditorIcon({
                element: field.fieldGroup_,
                label,
                canOpen: () => available(block),
                onOpen: () => open(block)
            });
            decorations.set(block.id, {field,
                cleanup: () => {
                    unbind();
                    if (field.imageElement_) field.imageElement_.tooltip = tooltip;
                }});
        }
        for (const [id, decoration] of decorations) {
            if (!seen.has(id)) {
                decoration.cleanup();
                decorations.delete(id);
            }
        }
    };
    const schedule = () => {
        checkSession();
        clearTimeout(timer);
        timer = setTimeout(refresh, 0);
    };
    const unregister = service.subscribe(() => {
        // Aggregate sessions observe relevant registry changes themselves.
        if (!activeSession || typeof activeSession.getNodes !== 'function') {
            host.invalidate();
            endSession();
        }
        schedule();
    });
    workspace.addChangeListener(schedule);
    vm.on('workspaceUpdate', schedule);
    vm.on('targetsUpdate', schedule);
    refresh();
    return {
        refresh,
        dispose: () => {
            disposed = true;
            clearTimeout(timer);
            unregister();
            workspace.removeChangeListener(schedule);
            vm.removeListener('workspaceUpdate', schedule);
            vm.removeListener('targetsUpdate', schedule);
            host.dispose();
            endSession();
            for (const decoration of decorations.values()) decoration.cleanup();
            decorations.clear();
        }
    };
};

export default createBlockEditorBridge;
export {openBlockEditorSession};
