export const EDITOR_API_VERSION = 1 as const;

export type LiteralValue = string | number | boolean;
export type JsonValue = null | LiteralValue | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface BlockReference {
  readonly targetId: string;
  readonly blockId: string;
}

export type ArgumentSlot =
  | {readonly kind: 'literal'; readonly value: LiteralValue}
  | {readonly kind: 'reporter'};

export interface BlockSnapshot extends BlockReference {
  readonly opcode: string;
  /** An opaque host token that changes when identity, editability or relevant data changes. */
  readonly revision: string;
  readonly arguments: Readonly<Record<string, ArgumentSlot>>;
}

export interface LiteralArgumentChange {
  readonly argument: string;
  readonly value: LiteralValue;
}

export interface CommitRequest {
  readonly expected: BlockSnapshot;
  readonly changes: readonly LiteralArgumentChange[];
}

export interface BlockEditorHost {
  /** Return null for missing, inactive or non-editable blocks. Never evaluate reporters. */
  readBlock(reference: BlockReference): BlockSnapshot | null;
  /**
   * Compare expected again at the actual write boundary, validate all changes, then
   * commit atomically with one undo step. On rejection, restore data and history.
   * Resolving means the full commit succeeded. A rejected promise must mean no change.
   */
  commit(request: CommitRequest): void | Promise<void>;
}

export interface ValidationIssue {
  readonly message: string;
  readonly path?: string;
}

export type SessionStatus = 'editing' | 'saving' | 'saved' | 'cancelled' | 'disposed';

export interface SessionState {
  readonly status: SessionStatus;
  readonly canSave: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly error: unknown;
}

export interface EditorViewContext {
  getDraft(): JsonObject;
  /** Updates are rejected after this view unmounts, even when its session stays open. */
  setDraft(draft: JsonObject): void;
  /** Report live UI validation; save() always independently validates again. */
  setValidationIssues(issues: readonly ValidationIssue[]): void;
  getState(): SessionState;
  /** The session releases view subscriptions on unmount, including failed mounts. */
  subscribe(listener: () => void): () => void;
}

export interface EditorDescriptor {
  readonly apiVersion: typeof EDITOR_API_VERSION;
  readonly extensionId: string;
  readonly editorId: string;
  readonly opcodes: readonly string[];
  readonly editableArguments: readonly string[];
}

export interface EditorDefinition extends EditorDescriptor {
  read(snapshot: BlockSnapshot): JsonObject;
  validate(
    draft: JsonObject,
    snapshot: BlockSnapshot
  ): readonly ValidationIssue[] | Promise<readonly ValidationIssue[]>;
  createPatch(draft: JsonObject, snapshot: BlockSnapshot): readonly LiteralArgumentChange[];
  /** Only mount the body. The host owns the modal, title, footer and focus handling. */
  mount?(container: HTMLElement, context: EditorViewContext): () => void;
}

export type SaveResult =
  | {readonly status: 'saved'; readonly changed: boolean}
  | {readonly status: 'invalid'; readonly issues: readonly ValidationIssue[]}
  | {readonly status: 'conflict'; readonly error: BlockEditorConflictError}
  | {readonly status: 'failed'; readonly error: unknown}
  | {readonly status: 'busy' | 'closed'};

export class BlockEditorConflictError extends Error {
  constructor(message = 'The block changed or is no longer editable.') {
    super(message);
    this.name = 'BlockEditorConflictError';
  }
}
