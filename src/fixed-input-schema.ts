/** A changed numeric input is distinct from an existing raw field or display projection. */
export type FixedNumberInputResult =
  | {readonly kind: 'valid'; readonly token: string; readonly value: number}
  | {readonly kind: 'invalid'; readonly code: 'fixed-number-input-invalid'};

const numberToken = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
const invalidNumber = Object.freeze({kind: 'invalid', code: 'fixed-number-input-invalid'} as const);

/**
 * Parse a NEW numeric draft according to NP-finite-new-input-v1.
 * Never apply this to opening/no-op raw values or use it as an owner validator.
 * Keep the validated token so negative zero, precision and exponent spelling survive.
 */
export function parseFixedNumberInput(input: unknown): FixedNumberInputResult {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return invalidNumber;
    return Object.freeze({kind: 'valid', token: Object.is(input, -0) ? '-0' : String(input), value: input});
  }
  if (typeof input !== 'string') return invalidNumber;
  const token = input.trim();
  if (!numberToken.test(token)) return invalidNumber;
  const value = Number(token);
  return Number.isFinite(value) ? Object.freeze({kind: 'valid', token, value}) : invalidNumber;
}
