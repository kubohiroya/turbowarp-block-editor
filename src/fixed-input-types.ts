import type {
  BlockEditorHost, BlockReference, BlockSnapshot, EditorDefinition, JsonObject, JsonValue, LiteralArgumentChange,
  ValidationIssue
} from './types.js';
import type {SchemaJsonValue, SchemaValidationContext} from './schema-types.js';

export const FIXED_INPUTS_CAPABILITY = 'fixed-inputs-v1' as const;

export interface FixedInputDependency {
  readonly selector: string;
  readonly dependents: readonly string[];
}

export interface FixedInputDeclaration {
  readonly contractId: string;
  readonly contractRevision: string;
  readonly editableArguments: readonly string[];
  readonly readOnlyArguments: readonly string[];
  readonly dependencies: readonly FixedInputDependency[];
}

/** Host-owned field identity only; live VM and Blockly objects never cross this port. */
export interface FixedInputMetadata {
  readonly role: 'editable' | 'readonly';
  readonly source: 'shadow' | 'field' | 'reporter' | 'unsupported' | 'missing';
  readonly identity: string;
  readonly field?: {readonly blockId: string; readonly name: string; readonly type: string};
  readonly reason?: string;
}

export interface FixedBlockSnapshot extends BlockSnapshot {
  readonly fixedContext: {
    readonly contractId: string;
    readonly contractRevision: string;
    readonly generation: string;
    readonly readOnlyArguments: readonly string[];
    readonly dependencies: readonly FixedInputDependency[];
    readonly inputs: Readonly<Record<string, FixedInputMetadata>>;
  };
}

/** The form projection never replaces the raw literals retained in the snapshot. */
export type FixedInputDraftEntry =
  | {readonly value: JsonValue; readonly changed: boolean; readonly buffer?: string; readonly repair?: true}
  | {readonly readOnly: true};

export interface FixedInputDraft extends JsonObject {
  readonly inputs: Readonly<Record<string, FixedInputDraftEntry>>;
}

export type FixedPreparedSave<C = null> =
  | {readonly kind: 'ready'; readonly changes: readonly LiteralArgumentChange[]; readonly context: SchemaValidationContext<C>}
  | {readonly kind: 'invalid'; readonly issues: readonly ValidationIssue[]};

export interface FixedInputEditorDefinition<C = null> extends EditorDefinition, FixedInputDeclaration {
  readonly saveContract: 'prepared-fixed-v1';
  readFixed(snapshot: FixedBlockSnapshot): JsonObject;
  prepareFixedSave(draft: JsonObject, snapshot: FixedBlockSnapshot): FixedPreparedSave<C>;
}

export interface FixedCommitRequest<C = null> {
  readonly expected: FixedBlockSnapshot;
  readonly changes: readonly LiteralArgumentChange[];
  readonly context: SchemaValidationContext<C>;
  readonly signal: AbortSignal;
}

/** Erase owner settings to JSON, never to unknown (whose JsonSettings type is never). */
export interface FixedHostCommitRequest extends Omit<FixedCommitRequest, 'context'> {
  readonly context: {
    readonly consumerId: string;
    readonly nowMs: number;
    readonly settings: SchemaJsonValue;
  };
}

export interface FixedInputEditorHost {
  readonly capability: typeof FIXED_INPUTS_CAPABILITY;
  /** Include editable inputs and read-only dependencies without evaluating reporters. */
  readBlock(reference: BlockReference, declaration: FixedInputDeclaration): FixedBlockSnapshot | null;
  /** Recheck all identities and dependencies at the actual atomic write boundary. */
  commit(request: FixedHostCommitRequest): void | Promise<void>;
}

/** Inspect methods without evaluating accessor-backed capability advertisements. */
export function supportsFixedInputs(host: BlockEditorHost): host is BlockEditorHost & {fixedInputs: FixedInputEditorHost} {
  const data = (object: unknown, key: string): unknown => {
    let item = object;
    for (let depth = 0; item && (typeof item === 'object' || typeof item === 'function') && depth < 64; depth++) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
      item = Object.getPrototypeOf(item);
    }
    return undefined;
  };
  try {
    const port = data(host, 'fixedInputs');
    return data(port, 'capability') === FIXED_INPUTS_CAPABILITY &&
      typeof data(port, 'readBlock') === 'function' && typeof data(port, 'commit') === 'function';
  } catch {return false;}
}

export const supportsFixedInputEditing = supportsFixedInputs;
