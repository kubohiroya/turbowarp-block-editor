import type {BlockSnapshot, EditorDefinition, JsonObject, LiteralArgumentChange, ValidationIssue} from './types.js';

export type PreparedSave =
  | {readonly kind: 'ready'; readonly changes: readonly LiteralArgumentChange[]}
  | {readonly kind: 'invalid'; readonly issues: readonly ValidationIssue[]};
export interface PreparedEditorDefinition extends EditorDefinition {
  readonly saveContract: 'prepared-source-v1';
  /** Construct, validate and capture each exact candidate once per save attempt. */
  prepareSave(draft: JsonObject, snapshot: BlockSnapshot): PreparedSave;
}
