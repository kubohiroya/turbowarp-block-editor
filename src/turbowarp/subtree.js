import {BlockEditorStructureError, DEFAULT_DESCENDANT_LIMITS} from '../index.js';

// Traverse statement inputs and their internal next chains; never the root's outer next or reporters.
const collectBlockEditorSubtree = ({ScratchBlocks, reference, inspect, generation}) => {
    const nodes = [];
    const records = new Map();
    const pending = {};
    const invalid = message => {
        throw new BlockEditorStructureError(message, 'invalid-structure');
    };
    const visit = (id, depth) => {
        if (records.has(id)) {
            throw new BlockEditorStructureError('A statement block is connected more than once.', 'cycle');
        }
        if (depth > DEFAULT_DESCENDANT_LIMITS.maxDepth || nodes.length >= DEFAULT_DESCENDANT_LIMITS.maxNodes) {
            throw new BlockEditorStructureError('The block hierarchy exceeds the editing limit.', 'limit');
        }
        const record = inspect({targetId: reference.targetId, blockId: id}, true);
        if (!record) throw pending;
        if (record.block.outputConnection) invalid('A reporter cannot be a statement descendant.');
        records.set(id, record);
        const branches = [];
        nodes.push({block: record.snapshot, branches});
        for (const input of record.block.inputList) {
            if (input.type !== ScratchBlocks.NEXT_STATEMENT) continue;
            const branch = {input: input.name, blockIds: []};
            branches.push(branch);
            let child = input.connection && input.connection.targetBlock();
            const vmInput = record.vmBlock.inputs[input.name];
            if ((child ? child.id : null) !== (vmInput && vmInput.block ? vmInput.block : null)) throw pending;
            let previous = input.connection;
            while (child) {
                if (!child.previousConnection || child.previousConnection.targetConnection !== previous) {
                    invalid('Invalid statement connection.');
                }
                branch.blockIds.push(child.id);
                visit(child.id, depth + 1);
                const next = child.getNextBlock();
                if ((next ? next.id : null) !== (records.get(child.id).vmBlock.next || null)) throw pending;
                previous = child.nextConnection;
                child = next;
            }
        }
    };
    try {
        visit(reference.blockId, 0);
    } catch (error) {
        if (error === pending) return null;
        throw error;
    }
    return {snapshot: {...reference, generation: String(generation), nodes}, records};
};

export default collectBlockEditorSubtree;
