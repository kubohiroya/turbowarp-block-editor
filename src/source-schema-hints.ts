import {Ajv} from 'ajv';
import {Ajv2020} from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import {prepare} from './schema-engine.js';
import {snapshotJson} from './schema-json.js';
import type {SourceVariant} from './source-types.js';

/** Resolve refs on a private view using the same URI/anchor registry as canonical validation. */
export function prepareSourceVariant(variant: SourceVariant): SourceVariant {
  const view = snapshotJson(variant) as unknown as SourceVariant;
  const ajv = view.schemaBundle.dialect === 'draft-07' ? new Ajv({strict: false}) : new Ajv2020({strict: false});
  formats.default(ajv);
  prepare(view.schemaBundle, ajv);
  return view;
}
