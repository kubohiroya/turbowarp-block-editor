import {captureReference, captureSnapshot, sameSnapshot} from './data.js';
import {BlockEditorStructureError, DEFAULT_DESCENDANT_LIMITS} from './descendant-types.js';
import type {
  DescendantLimits, InputPathStep, SubtreeNodeSnapshot, SubtreeSnapshot
} from './descendant-types.js';
import type {BlockReference} from './types.js';

export function descendantLimits(limits: DescendantLimits = {}): Required<DescendantLimits> {
  const result = {...DEFAULT_DESCENDANT_LIMITS, ...limits};
  if (!Number.isSafeInteger(result.maxDepth) || result.maxDepth < 0 || result.maxDepth > DEFAULT_DESCENDANT_LIMITS.maxDepth ||
      !Number.isSafeInteger(result.maxNodes) || result.maxNodes < 1 || result.maxNodes > DEFAULT_DESCENDANT_LIMITS.maxNodes) {
    throw new BlockEditorStructureError('Limits must be integers: depth 0–32, nodes 1–500.', 'limit');
  }
  return Object.freeze(result);
}

export interface CapturedSubtree {
  readonly snapshot: SubtreeSnapshot;
  readonly paths: ReadonlyMap<string, readonly InputPathStep[]>;
}

/** Validate the host's complete graph before any editor callback sees it. */
export function captureSubtree(
  source: SubtreeSnapshot, reference: BlockReference, limits: Required<DescendantLimits>
): CapturedSubtree {
  const invalid = (message: string): never => {
    throw new BlockEditorStructureError(message, 'invalid-structure');
  };
  if (!source || source.targetId !== reference.targetId || source.blockId !== reference.blockId ||
      typeof source.generation !== 'string' || !source.generation || !Array.isArray(source.nodes) ||
      source.nodes.length === 0) invalid('The host returned an invalid subtree snapshot.');
  if (source.nodes.length > limits.maxNodes) {
    throw new BlockEditorStructureError('The subtree exceeds the node limit.', 'limit');
  }
  const entries = new Map<string, SubtreeNodeSnapshot>();
  let edges = 0;
  for (const node of source.nodes) {
    if (!node?.block || !Array.isArray(node.branches)) invalid('Invalid subtree node.');
    const block = (() => {
      try { return captureSnapshot(node.block, {targetId: reference.targetId, blockId: node.block.blockId}); }
      catch { return invalid('Invalid subtree block snapshot or target identity.'); }
    })();
    if (entries.has(block.blockId)) invalid('Duplicate block ID in subtree.');
    const inputs = new Set<string>();
    const branches = node.branches.map(branch => {
      if (!branch || typeof branch.input !== 'string' || !branch.input || inputs.has(branch.input) ||
          !Array.isArray(branch.blockIds)) invalid('Invalid or duplicate statement input.');
      inputs.add(branch.input);
      edges += branch.blockIds.length;
      if (edges >= source.nodes.length) invalid('Subtree connections contain a cycle or duplicate parent.');
      const blockIds = branch.blockIds.map(id => {
        if (typeof id !== 'string' || !id) invalid('Invalid statement block ID.');
        return id;
      });
      return Object.freeze({input: branch.input, blockIds: Object.freeze(blockIds)});
    });
    entries.set(block.blockId, Object.freeze({block, branches: Object.freeze(branches)}));
  }
  const paths = new Map<string, readonly InputPathStep[]>();
  const ordered: SubtreeNodeSnapshot[] = [];
  const stack: {id: string; path: readonly InputPathStep[]}[] = [{id: reference.blockId, path: Object.freeze([])}];
  while (stack.length) {
    const {id, path} = stack.pop()!;
    if (paths.has(id)) throw new BlockEditorStructureError('Cycle or repeated subtree node.', 'cycle');
    if (path.length > limits.maxDepth) {
      throw new BlockEditorStructureError('The subtree exceeds the depth limit.', 'limit');
    }
    const node = entries.get(id);
    if (!node) invalid(`Missing subtree node: ${id}`);
    paths.set(id, path);
    ordered.push(node!);
    for (let branchIndex = node!.branches.length - 1; branchIndex >= 0; branchIndex--) {
      const branch = node!.branches[branchIndex]!;
      for (let index = branch.blockIds.length - 1; index >= 0; index--) {
        stack.push({id: branch.blockIds[index]!, path: Object.freeze([
          ...path, Object.freeze({blockId: id, input: branch.input, index})
        ])});
      }
    }
  }
  if (paths.size !== entries.size) invalid('Subtree includes disconnected or out-of-scope nodes.');
  return {
    snapshot: Object.freeze({
      ...captureReference(reference), generation: source.generation, nodes: Object.freeze(ordered)
    }), paths
  };
}

export function sameSubtree(left: SubtreeSnapshot, right: SubtreeSnapshot): boolean {
  return left.targetId === right.targetId && left.blockId === right.blockId &&
    left.generation === right.generation && left.nodes.length === right.nodes.length &&
    left.nodes.every((node, index) => {
      const other = right.nodes[index]!;
      return sameSnapshot(node.block, other.block) && node.branches.length === other.branches.length &&
        node.branches.every((branch, branchIndex) => {
          const b = other.branches[branchIndex]!;
          return branch.input === b.input && branch.blockIds.length === b.blockIds.length &&
            branch.blockIds.every((id, i) => id === b.blockIds[i]);
        });
    });
}
