import type {
  BlockEditorHost, BlockReference, BlockSnapshot, EditorDescriptor, EditorViewContext, LiteralArgumentChange,
  SaveResult, SessionStatus, ValidationIssue
} from './types.js';

export const DESCENDANT_EDITING_CAPABILITY = 'descendant-editing-v1' as const;
export const DEFAULT_DESCENDANT_LIMITS = Object.freeze({maxDepth: 32, maxNodes: 500});

export interface DescendantLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

/** Ordered statement inputs; each list includes its internal next chain, never reporters. */
export interface StatementBranch {
  readonly input: string;
  readonly blockIds: readonly string[];
}

export interface SubtreeNodeSnapshot {
  readonly block: BlockSnapshot;
  readonly branches: readonly StatementBranch[];
}

export interface SubtreeSnapshot extends BlockReference {
  /** Changes across project reloads and editing sessions, even when block IDs are reused. */
  readonly generation: string;
  /** The complete scope, including unregistered structural nodes. No truncation is allowed. */
  readonly nodes: readonly SubtreeNodeSnapshot[];
}

export interface SubtreeArgumentChange extends LiteralArgumentChange {
  readonly blockId: string;
}

export interface SubtreeCommitRequest {
  readonly expected: SubtreeSnapshot;
  readonly changes: readonly SubtreeArgumentChange[];
  /** Check both this signal and expected at the actual write boundary. */
  readonly signal: AbortSignal;
}

export interface DescendantEditorHost {
  readonly capability: typeof DESCENDANT_EDITING_CAPABILITY;
  readSubtree(reference: BlockReference): SubtreeSnapshot | null;
  /** One atomic transaction and one Undo/Redo step; rejection leaves data and history unchanged. */
  commitSubtree(request: SubtreeCommitRequest): void | Promise<void>;
  /** Notify project/target invalidation promptly, including during pending validation/commit. */
  subscribeInvalidation?(reference: BlockReference, listener: (reason?: unknown) => void): () => void;
}

export function supportsDescendantEditing(host: BlockEditorHost): host is BlockEditorHost & {descendants: DescendantEditorHost} {
  const port = host.descendants;
  return port?.capability === DESCENDANT_EDITING_CAPABILITY &&
    typeof port.readSubtree === 'function' && typeof port.commitSubtree === 'function';
}

export interface InputPathStep {
  readonly blockId: string;
  readonly input: string;
  readonly index: number;
}

export interface DescendantNodeDescriptor {
  readonly reference: BlockReference;
  readonly opcode: string;
  readonly inputPath: readonly InputPathStep[];
  readonly editor?: EditorDescriptor;
}

/** Body-only access. Nodes have no independent save, cancel, dispose or host commit. */
export interface DescendantNodeEditor extends EditorViewContext {
  readonly reference: BlockReference;
  mount(container: HTMLElement): () => void;
}

export interface DescendantValidationIssue extends ValidationIssue {
  readonly reference: BlockReference;
  readonly inputPath: readonly InputPathStep[];
}

export type DescendantSessionStatus = SessionStatus | 'invalidated';
export interface DescendantSessionState {
  readonly status: DescendantSessionStatus;
  readonly canSave: boolean;
  readonly issues: readonly DescendantValidationIssue[];
  readonly error: unknown;
}

export type DescendantSaveResult = Exclude<SaveResult, {status: 'invalid'}>
  | {readonly status: 'invalid'; readonly issues: readonly DescendantValidationIssue[]}
  | {readonly status: 'invalidated'};

export class BlockEditorStructureError extends Error {
  constructor(message: string, readonly code: 'invalid-structure' | 'cycle' | 'limit') {
    super(message);
    this.name = 'BlockEditorStructureError';
  }
}

export class DescendantNodeError extends Error {
  constructor(
    readonly reference: BlockReference,
    readonly inputPath: readonly InputPathStep[],
    cause: unknown
  ) {
    super(`Editor callback failed for block ${reference.blockId}.`, {cause});
    this.name = 'DescendantNodeError';
  }
}
