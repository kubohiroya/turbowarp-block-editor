import {captureReference, captureSnapshot, cloneJson, isLiteral, sameSnapshot} from './data.js';
import {BlockEditorConflictError} from './types.js';
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
  #unmount: (() => void) | undefined;
  #mounting = false;
  readonly #definition: EditorDefinition;
  readonly #snapshot: BlockSnapshot;
  readonly #host: BlockEditorHost;

  /** Use EditorRegistry.open() to construct sessions from a captured host snapshot. */
  constructor(definition: EditorDefinition, snapshot: BlockSnapshot, host: BlockEditorHost) {
    this.#definition = definition;
    this.#snapshot = captureSnapshot(snapshot, captureReference(snapshot));
    this.#host = host;
    this.#draft = this.#copyDraft(definition.read(this.#snapshot));
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
    if (this.#status !== 'editing' || this.#unmount || this.#mounting) {
      throw new Error('The session cannot mount another view.');
    }
    const mount = this.#definition.mount;
    if (!mount) throw new Error('No editor view is registered.');
    let active = true;
    const subscriptions = new Set<() => void>();
    const assertMounted = () => {
      if (!active) throw new Error('The editor view is unmounted.');
    };
    const release = () => {
      active = false;
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.clear();
    };
    const context: EditorViewContext = Object.freeze({
      getDraft: () => this.getDraft(),
      setDraft: (draft: JsonObject) => { assertMounted(); this.setDraft(draft); },
      setValidationIssues: (issues: readonly ValidationIssue[]) => {
        assertMounted();
        this.setValidationIssues(issues);
      },
      getState: () => this.getState(),
      subscribe: (listener: () => void) => {
        assertMounted();
        const unsubscribe = this.subscribe(() => { if (active) listener(); });
        const remove = () => { subscriptions.delete(remove); unsubscribe(); };
        subscriptions.add(remove);
        return remove;
      }
    });
    this.#mounting = true;
    let cleanup: () => void;
    try {
      cleanup = mount(container, context);
      if (typeof cleanup !== 'function') throw new TypeError('mount() must return a cleanup function.');
    } catch (error) {
      release();
      throw error;
    } finally {
      this.#mounting = false;
    }
    if (this.#status !== 'editing' && this.#status !== 'saving') {
      release();
      cleanup();
      return () => {};
    }
    const unmount = () => {
      if (!active) return;
      release();
      this.#unmount = undefined;
      cleanup();
    };
    this.#unmount = unmount;
    return unmount;
  }

  async save(): Promise<SaveResult> {
    if (this.#status === 'saving') return {status: 'busy'};
    if (this.#status !== 'editing') return {status: 'closed'};
    this.#status = 'saving';
    this.#issues = [];
    this.#error = undefined;
    this.#notify();
    try {
      const issues = await this.#definition.validate(cloneJson(this.#draft), this.#snapshot);
      if (!Array.isArray(issues)) throw new TypeError('validate() must return an issue array.');
      if (issues.length > 0) {
        this.#issues = this.#copyIssues(issues);
        return {status: 'invalid', issues: this.#issues};
      }
      const changes = this.#prepareChanges(
        this.#definition.createPatch(cloneJson(this.#draft), this.#snapshot)
      );
      const current = this.#host.readBlock(this.#snapshot);
      if (!current || !sameSnapshot(this.#snapshot, captureSnapshot(current, this.#snapshot))) {
        throw new BlockEditorConflictError();
      }
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
      if (slot.value !== change.value) changes.push(Object.freeze({...change}));
    }
    return Object.freeze(changes);
  }

  #copyIssues(issues: readonly ValidationIssue[]): readonly ValidationIssue[] {
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
    return cloneJson(draft);
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
    try { this.#unmount?.(); } catch (error) { this.#reportObserverError(error); }
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
