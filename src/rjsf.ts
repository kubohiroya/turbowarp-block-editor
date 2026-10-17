import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as RjsfCore from '@rjsf/core';
import * as RjsfUtils from '@rjsf/utils';
import * as RjsfAjv from '@rjsf/validator-ajv8';
import type {FormProps, IChangeEvent} from '@rjsf/core';
import type {RJSFSchema, UiSchema} from '@rjsf/utils';
import {cloneJson} from './data.js';
import {decodeSource, encodeSource, sameData} from './codec.js';
import type {SourceFormat} from './codec.js';
import {EDITOR_API_VERSION} from './types.js';
import type {
  BlockSnapshot, EditorDefinition, JsonObject, JsonValue, ValidationIssue
} from './types.js';

// RJSF v5 exposes CommonJS to Node and ESM to browser bundlers.
function moduleExports<T>(namespace: T): T {
  const fallback = (namespace as {default?: unknown}).default;
  return fallback && typeof fallback === 'object' && '__esModule' in fallback
    ? fallback as T : namespace;
}
const Form = moduleExports(RjsfCore).default as unknown as React.ComponentType<FormProps<unknown>>;
const {getDefaultFormState} = moduleExports(RjsfUtils);
const {customizeValidator} = moduleExports(RjsfAjv);

export interface SchemaEditorOptions {
  readonly apiVersion: typeof EDITOR_API_VERSION;
  readonly extensionId: string;
  readonly editorId: string;
  readonly opcodes: readonly string[];
  /** The string argument that persists the JSON-compatible value. */
  readonly argument: string;
  /** Defaults to JSON for compatibility with existing registrations. */
  readonly format?: SourceFormat;
  readonly schema: RJSFSchema;
  readonly uiSchema?: JsonObject;
  /** Optional business validation, always run after schema validation when saving. */
  validateData?(
    data: JsonValue, snapshot: BlockSnapshot
  ): readonly ValidationIssue[] | Promise<readonly ValidationIssue[]>;
}

/** Build an editor with JSON/YAML serialization, schema validation and the standard RJSF body. */
export function createSchemaEditor(options: SchemaEditorOptions): EditorDefinition {
  if (options.apiVersion !== EDITOR_API_VERSION || typeof options.argument !== 'string' || !options.argument) {
    throw new TypeError('A supported API version and JSON argument name are required.');
  }
  const argument = options.argument;
  const format = options.format ?? 'json';
  if (format !== 'json' && format !== 'yaml') throw new TypeError('Unsupported source format.');
  const schema = cloneJson(options.schema as JsonObject) as RJSFSchema;
  const uiSchema = options.uiSchema ? cloneJson(options.uiSchema) as UiSchema<unknown> : {};
  const validateData = options.validateData;
  const validator = customizeValidator<unknown>({
    ajvOptionsOverrides: {allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false}
  });
  const compilation = validator.rawValidation(schema);
  if (compilation.validationError) {
    throw new TypeError(`Invalid or unsupported JSON Schema: ${compilation.validationError.message}`);
  }
  const issuesFor = (data: JsonValue): readonly ValidationIssue[] => {
    const result = validator.validateFormData(data, schema, undefined, undefined, uiSchema);
    return result.errors.map(error => ({
      message: error.stack || error.message || 'Invalid value.',
      ...(error.property === undefined ? {} : {path: error.property})
    }));
  };
  // RJSF uses undefined for cleared controls; persist these as omitted properties (or null at the root).
  const formValue = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
  const dataFor = (draft: JsonObject): JsonValue => {
    if (!Object.hasOwn(draft, 'data') || draft.data === undefined) throw new TypeError('Missing schema editor data.');
    return draft.data;
  };

  return {
    apiVersion: EDITOR_API_VERSION,
    extensionId: options.extensionId, editorId: options.editorId, opcodes: [...options.opcodes],
    editableArguments: [argument],
    read: snapshot => {
      const slot = snapshot.arguments[argument];
      if (!slot || slot.kind !== 'literal' || typeof slot.value !== 'string') {
        throw new TypeError('Schema editors require a literal JSON/YAML string argument.');
      }
      return {data: decodeSource(slot.value, format)};
    },
    validate: (draft, snapshot) => {
      const data = dataFor(draft);
      const issues = issuesFor(data);
      return issues.length || !validateData ? issues : validateData(cloneJson(data), snapshot);
    },
    createPatch: (draft, snapshot) => {
      const data = dataFor(draft);
      const slot = snapshot.arguments[argument];
      if (!slot || slot.kind !== 'literal' || typeof slot.value !== 'string') {
        throw new TypeError('Missing source string.');
      }
      // A save without data changes preserves the exact source, comments and undo history.
      const value = sameData(data, decodeSource(slot.value, format))
        ? slot.value : encodeSource(data, format);
      return [{argument, value}];
    },
    mount: (container, context) => {
      let active = true;
      let scheduled = false;
      let unsubscribe = () => {};
      const initial = getDefaultFormState<unknown>(validator, schema, dataFor(context.getDraft()), schema);
      context.setDraft({data: formValue(initial)});
      context.setValidationIssues(issuesFor(dataFor(context.getDraft())));
      const render = () => {
        if (!active) return;
        const state = context.getState();
        const props = {
          schema, uiSchema, validator,
          formData: dataFor(context.getDraft()),
          tagName: 'div' as const,
          liveValidate: true,
          showErrorList: false as const,
          disabled: state.status !== 'editing',
          onChange: (event: IChangeEvent<unknown>) => {
            if (!active || context.getState().status !== 'editing') return;
            const data = formValue(event.formData);
            context.setDraft({data});
            context.setValidationIssues(issuesFor(data));
          }
        };
        // Suppress RJSF's own submit control; the host's shared footer owns saving.
        ReactDOM.render(React.createElement(Form, props, React.createElement('span', {hidden: true})), container);
      };
      const schedule = () => {
        if (scheduled || !active) return;
        scheduled = true;
        void Promise.resolve().then(() => {
          scheduled = false;
          if (active) render();
        });
      };
      unsubscribe = context.subscribe(schedule);
      try { render(); } catch (error) {
        active = false;
        unsubscribe();
        ReactDOM.unmountComponentAtNode(container);
        throw error;
      }
      return () => {
        active = false;
        unsubscribe();
        ReactDOM.unmountComponentAtNode(container);
      };
    }
  };
}
