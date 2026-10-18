import {captureReference, captureSnapshot, cloneJson, isLiteral, sameSnapshot} from './data.js';
import {BlockEditorConflictError} from './types.js';
import {EditorView} from './view.js';
import {isPreparedEditor, capturePreparedSave} from './prepared-save.js';
import {isFixedInputEditor, captureFixedPreparedSave} from './fixed-input-editor.js';
import {captureFixedSnapshot, sameFixedSnapshot} from './fixed-input-snapshot.js';
import {supportsFixedInputEditing} from './fixed-input-types.js';
import {snapshotJson} from './schema-json.js';
import type {FixedBlockSnapshot, FixedHostCommitRequest, FixedInputEditorHost} from './fixed-input-types.js';
import type {
  BlockEditorHost, BlockReference, BlockSnapshot, EditorDefinition, EditorViewContext, JsonObject,
  LiteralArgumentChange, SaveResult, SessionState, SessionStatus, ValidationIssue
} from './types.js';

export class EditorSession implements EditorViewContext {
  #draft: JsonObject;
  #status: SessionStatus = 'editing';
  #issues: readonly ValidationIssue[] = [];
  #error: unknown;
  #listeners = new Set<() => void>();
  readonly #view = new EditorView();
  readonly #definition: EditorDefinition;
  readonly #snapshot: BlockSnapshot;
  readonly #host: BlockEditorHost;
  readonly #fixedPort: FixedInputEditorHost | undefined;
  readonly #isRegistered: (() => boolean) | undefined;
  readonly #subscribeRegistrationChanges: ((listener: () => void) => () => void) | undefined;

  /** Use EditorRegistry.open() to construct sessions from a captured host snapshot. */
  constructor(definition: EditorDefinition, snapshot: BlockSnapshot, host: BlockEditorHost, isRegistered?: () => boolean, subscribeRegistrationChanges?: (listener: () => void) => () => void) {
    this.#isRegistered = isRegistered;
    this.#subscribeRegistrationChanges = subscribeRegistrationChanges;
    this.#definition = definition;
    this.#snapshot = isFixedInputEditor(definition)
      ? captureFixedSnapshot(snapshot as FixedBlockSnapshot, captureReference(snapshot), definition)
      : captureSnapshot(snapshot, captureReference(snapshot));
    this.#host = host;
    this.#fixedPort = isFixedInputEditor(definition) && supportsFixedInputEditing(host) ? host.fixedInputs : undefined;
    if (isFixedInputEditor(definition) && !supportsFixedInputEditing(host)) throw new TypeError('Fixed input editors require a compatible host.');
    this.#draft = this.#copyDraft(isFixedInputEditor(definition)
      ? definition.readFixed(this.#snapshot as FixedBlockSnapshot) : definition.read(this.#snapshot));
  }

  /** Stable instance identity remains available after the session closes. */
  get reference(): BlockReference {
    return captureReference(this.#snapshot);
  }

  getDraft(): JsonObject {
    this.#assertOpen();
    return cloneJson(this.#draft);
  }

  setDraft(draft: JsonObject): void {
    if (this.#status !== 'editing') throw new Error('The session is not editable.');
    this.#draft = this.#copyDraft(draft);
    this.#issues = [];
    this.#error = undefined;
    this.#notify();
  }

  setValidationIssues(issues: readonly ValidationIssue[]): void {
    if (this.#status !== 'editing') throw new Error('The session is not editable.');
    this.#issues = this.#copyIssues(issues);
    this.#notify();
  }

  getState(): SessionState {
    return Object.freeze({
      status: this.#status, canSave: this.#status === 'editing' && this.#issues.length === 0,
      issues: this.#issues, error: this.#error
    });
  }

  subscribe(listener: () => void): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  mount(container: HTMLElement): () => void {
    return this.#view.mount(container, this.#definition.mount, this);
  }

  async save(): Promise<SaveResult> {
    if (this.#status === 'saving') return {status: 'busy'};
    if (this.#status !== 'editing') return {status: 'closed'};
    this.#status = 'saving';
    this.#issues = [];
    this.#error = undefined;
    this.#notify();
    try {
      if (this.#isRegistered && !this.#isRegistered()) throw new BlockEditorConflictError('The source editor registration expired.');
      if (isFixedInputEditor(this.#definition)) return await this.#saveFixed();
      const prepared = isPreparedEditor(this.#definition)
        ? capturePreparedSave(this.#definition, cloneJson(this.#draft), this.#snapshot) : undefined;
      const issues = prepared ? (prepared.kind === 'invalid' ? prepared.issues : [])
        : await this.#definition.validate(cloneJson(this.#draft), this.#snapshot);
      if (!Array.isArray(issues)) throw new TypeError('validate() must return an issue array.');
      if (issues.length > 0) {
        this.#issues = this.#copyIssues(issues);
        return {status: 'invalid', issues: this.#issues};
      }
      const changes = this.#prepareChanges(
        prepared?.kind === 'ready' ? prepared.changes
          : this.#definition.createPatch(cloneJson(this.#draft), this.#snapshot)
      );
      if (this.#isRegistered && !this.#isRegistered()) throw new BlockEditorConflictError('The source editor registration expired.');
      const current = this.#host.readBlock(this.#snapshot);
      if (!current || !sameSnapshot(this.#snapshot, captureSnapshot(current, this.#snapshot))) {
        throw new BlockEditorConflictError();
      }
      if (this.#isRegistered && !this.#isRegistered()) throw new BlockEditorConflictError('The source editor registration expired.');
      if (changes.length > 0) {
        await this.#host.commit(Object.freeze({expected: this.#snapshot, changes}));
      }
      this.#finish('saved');
      return {status: 'saved', changed: changes.length > 0};
    } catch (error) {
      this.#error = error;
      return error instanceof BlockEditorConflictError
        ? {status: 'conflict', error} : {status: 'failed', error};
    } finally {
      if (this.#status === 'saving') {
        this.#status = 'editing';
        this.#notify();
      }
    }
  }

  async #saveFixed(): Promise<SaveResult> {
    const definition = this.#definition;
    if (!isFixedInputEditor(definition)) throw new TypeError('Fixed input capability is unavailable.');
    if (!supportsFixedInputEditing(this.#host) || this.#host.fixedInputs !== this.#fixedPort) throw new BlockEditorConflictError('The fixed input capability changed.');
    const snapshot = this.#snapshot as FixedBlockSnapshot;
    const prepared = captureFixedPreparedSave(definition, this.#copyDraft(this.#draft), snapshot);
    if (prepared.kind === 'invalid') {
      this.#issues = this.#copyIssues(prepared.issues);
      return {status: 'invalid', issues: this.#issues};
    }
    const changes = this.#prepareChanges(prepared.changes);
    const port = this.#host.fixedInputs!;
    if (this.#isRegistered && !this.#isRegistered()) throw new BlockEditorConflictError('The fixed editor registration expired.');
    const current = port.readBlock(snapshot, definition);
    if (!current) throw new BlockEditorConflictError();
    try {
      if (!sameFixedSnapshot(snapshot, captureFixedSnapshot(current, snapshot, definition))) throw new BlockEditorConflictError();
    } catch {throw new BlockEditorConflictError();}
    if (!supportsFixedInputEditing(this.#host) || this.#host.fixedInputs !== port ||
        (this.#isRegistered && !this.#isRegistered())) throw new BlockEditorConflictError('The fixed editor registration expired.');
    if (changes.length > 0) {
      const controller = new AbortController();
      const context = prepared.context as unknown as FixedHostCommitRequest['context'];
      const unsubscribe = this.#subscribeRegistrationChanges?.(() => {
        if (this.#isRegistered && !this.#isRegistered()) controller.abort(new BlockEditorConflictError('The fixed editor registration expired.'));
      });
      try {
        if (this.#isRegistered && !this.#isRegistered()) throw new BlockEditorConflictError('The fixed editor registration expired.');
        await port.commit(Object.freeze({expected: snapshot, changes, context, signal: controller.signal}));
        if (controller.signal.aborted) throw new BlockEditorConflictError('The fixed editor registration expired.');
      } catch (error) {
        if (controller.signal.aborted) throw new BlockEditorConflictError('The fixed editor registration expired.');
        throw error;
      } finally {unsubscribe?.();}
    }
    this.#finish('saved');
    return {status: 'saved', changed: changes.length > 0};
  }

  /** Closing is refused while saving; the host must keep the modal open. */
  cancel(): boolean {
    if (this.#status !== 'editing') return false;
    this.#finish('cancelled');
    return true;
  }

  dispose(): boolean {
    if (this.#status === 'saving') return false;
    if (this.#status === 'editing') this.#finish('disposed');
    return true;
  }

  #prepareChanges(patch: readonly LiteralArgumentChange[]): readonly LiteralArgumentChange[] {
    if (!Array.isArray(patch)) throw new TypeError('createPatch() must return an array.');
    const seen = new Set<string>();
    const changes: LiteralArgumentChange[] = [];
    for (const change of patch) {
      if (!change || !this.#definition.editableArguments.includes(change.argument) ||
          seen.has(change.argument) || !isLiteral(change.value)) {
        throw new TypeError('Patch contains an invalid, duplicate or disallowed argument.');
      }
      seen.add(change.argument);
      const slot = Object.hasOwn(this.#snapshot.arguments, change.argument)
        ? this.#snapshot.arguments[change.argument] : undefined;
      if (!slot || slot.kind !== 'literal') {
        throw new TypeError('Only existing literal arguments can be changed.');
      }
      if (isFixedInputEditor(this.#definition)) {
        const metadata = (this.#snapshot as FixedBlockSnapshot).fixedContext.inputs[change.argument];
        if (!metadata || metadata.role !== 'editable' || (metadata.source !== 'field' && metadata.source !== 'shadow')) throw new TypeError('Fixed patches require editable literal fields.');
        if (!Object.is(slot.value, change.value)) {
          if (this.#definition.dependencies.some(group => group.selector === change.argument || group.dependents.includes(change.argument))) throw new TypeError('Fixed dependency validation is unavailable.');
          changes.push(Object.freeze({argument: change.argument, value: change.value}));
        }
      } else if (slot.value !== change.value) changes.push(Object.freeze({...change}));
    }
    return Object.freeze(changes);
  }

  #copyIssues(issues: readonly ValidationIssue[]): readonly ValidationIssue[] {
    if (isFixedInputEditor(this.#definition)) issues = snapshotJson(issues) as unknown as readonly ValidationIssue[];
    if (!Array.isArray(issues)) throw new TypeError('Expected a validation issue array.');
    return Object.freeze(issues.map(issue => {
      if (!issue || typeof issue.message !== 'string' ||
          (issue.path !== undefined && typeof issue.path !== 'string')) {
        throw new TypeError('Invalid validation issue.');
      }
      return Object.freeze({...issue});
    }));
  }

  #copyDraft(draft: JsonObject): JsonObject {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
      throw new TypeError('The editor draft must be a JSON object.');
    }
    if (!isFixedInputEditor(this.#definition)) return cloneJson(draft);
    try {return snapshotJson(draft) as JsonObject;}
    catch (error) {
      try {void Promise.prototype.then.call(draft as unknown as Promise<unknown>, () => undefined, () => undefined);}
      catch { /* Synchronous fixed drafts never inspect arbitrary thenables. */ }
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#status !== 'editing' && this.#status !== 'saving') {
      throw new Error('The session is closed.');
    }
  }

  #finish(status: 'saved' | 'cancelled' | 'disposed'): void {
    this.#status = status;
    this.#draft = {};
    this.#notify();
    try { this.#view.unmount(); } catch (error) { this.#reportObserverError(error); }
    this.#listeners.clear();
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch (error) { this.#reportObserverError(error); }
    }
  }

  #reportObserverError(error: unknown): void {
    // A view failure must not turn a completed host commit into a failed save.
    console.error('Block editor view callback failed:', error);
  }
}
