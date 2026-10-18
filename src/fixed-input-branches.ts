import {snapshotJson} from './schema-json.js';
import type {FixedBlockSnapshot, FixedInputBranchCase, FixedInputBranchRule, FixedInputBranchState,
  FixedInputDeclaration, FixedInputDependency} from './fixed-input-types.js';
import type {ArgumentSlot, LiteralArgumentChange, ValidationIssue} from './types.js';

const fail = (): never => {throw new TypeError('Invalid fixed branch declaration.');};
const names = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== 'string' || !item) ||
      new Set(value).size !== value.length) return fail();
  return Object.freeze(value as string[]);
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const normalize = (value: string, rule: FixedInputBranchRule): string => {
  const text = rule.normalize?.trim ? value.trim() : value;
  return rule.normalize?.lowercase ? text.toLowerCase() : text;
};
/** Capture finite JSON policy once; callbacks and getters are never part of host authority. */
export function captureFixedBranchRules(value: unknown, dependencies: readonly FixedInputDependency[],
  readOnlyArguments: readonly string[]): readonly FixedInputBranchRule[] {
  if (value === undefined) return Object.freeze([]);
  const captured = snapshotJson(value);
  if (!Array.isArray(captured)) return fail();
  const selectors = new Set<string>();
  const occupied = new Set<string>();
  const result: FixedInputBranchRule[] = [];
  for (const item of captured) {
    const rule = object(item);
    if (typeof rule.selector !== 'string' || selectors.has(rule.selector)) return fail();
    const group = dependencies.find(dependency => dependency.selector === rule.selector);
    if (!group) return fail();
    for (const argument of [group.selector, ...group.dependents]) {
      if (occupied.has(argument) || dependencies.some(other => other !== group &&
          (other.selector === argument || other.dependents.includes(argument)))) return fail();
      occupied.add(argument);
    }
    selectors.add(rule.selector);
    let normalization: FixedInputBranchRule['normalize'];
    if (rule.normalize !== undefined) {
      const input = object(rule.normalize);
      if (Object.keys(input).some(key => key !== 'trim' && key !== 'lowercase') ||
          Object.values(input).some(value => typeof value !== 'boolean')) return fail();
      normalization = Object.freeze({...input}) as FixedInputBranchRule['normalize'];
    }
    const shell: FixedInputBranchRule = {selector: rule.selector, cases: [], ...(normalization ? {normalize: normalization} : {})};
    if (!Array.isArray(rule.cases) || !rule.cases.length) return fail();
    const values = new Set<string>();
    const cases: FixedInputBranchCase[] = [];
    for (const input of rule.cases) {
      const branch = object(input);
      const caseValues = names(branch.values);
      const normalized = caseValues.map(value => normalize(value, shell));
      if (normalized.some(value => !value || values.has(value))) return fail();
      for (const value of normalized) values.add(value);
      if (new Set(normalized).size !== normalized.length) return fail();
      if (!Array.isArray(branch.activeDependents)) return fail();
      const active = branch.activeDependents.length ? names(branch.activeDependents) : Object.freeze([] as string[]);
      if (active.some(argument => !group.dependents.includes(argument))) return fail();
      const requirements: NonNullable<FixedInputBranchCase['requireOnSelectorChange']>[number][] = [];
      if (branch.requireOnSelectorChange !== undefined) {
        if (!Array.isArray(branch.requireOnSelectorChange)) return fail();
        const required = new Set<string>();
        for (const input of branch.requireOnSelectorChange) {
          const requirement = object(input);
          if (typeof requirement.argument !== 'string' || !readOnlyArguments.includes(requirement.argument) ||
              required.has(requirement.argument) || (requirement.rule !== 'literal' && requirement.rule !== 'nonempty-string')) return fail();
          required.add(requirement.argument);
          requirements.push(Object.freeze({argument: requirement.argument, rule: requirement.rule}));
        }
      }
      cases.push(Object.freeze({values: caseValues, activeDependents: active,
        ...(branch.requireOnSelectorChange === undefined ? {} : {requireOnSelectorChange: Object.freeze(requirements)})}));
    }
    result.push(Object.freeze({...shell, cases: Object.freeze(cases)}));
  }
  return Object.freeze(result);
}

export interface ResolvedFixedBranch extends FixedInputBranchState {
  readonly rule: FixedInputBranchRule;
  readonly selected?: FixedInputBranchCase;
}
/** Resolve only captured literal metadata. Reporters and unavailable fields are never evaluated. */
export function resolveFixedBranches(declaration: FixedInputDeclaration, snapshot: FixedBlockSnapshot,
  arguments_: Readonly<Record<string, ArgumentSlot>> = snapshot.arguments): readonly ResolvedFixedBranch[] {
  return Object.freeze((declaration.branchRules ?? []).map(rule => {
    const metadata = snapshot.fixedContext.inputs[rule.selector];
    const slot = arguments_[rule.selector];
    let status: FixedInputBranchState['status'];
    if (!metadata || metadata.source === 'missing') status = 'missing';
    else if (metadata.source === 'reporter' || slot?.kind === 'reporter') status = 'reporter';
    else if ((metadata.source !== 'field' && metadata.source !== 'shadow') || metadata.role !== 'editable') status = 'unsupported';
    else if (slot?.kind !== 'literal' || typeof slot.value !== 'string') status = 'unknown';
    else {
      const value = normalize(slot.value, rule);
      const selected = rule.cases.find(branch => branch.values.some(item => normalize(item, rule) === value));
      if (selected) return Object.freeze({selector: rule.selector, rule, selected,
        status: slot.value === selected.values[0] ? 'known' as const : 'alias' as const, value: selected.values[0]!});
      status = 'unknown';
    }
    return Object.freeze({selector: rule.selector, rule, status});
  }));
}
const writableLiteral = (snapshot: FixedBlockSnapshot, arguments_: Readonly<Record<string, ArgumentSlot>>, name: string): boolean => {
  const metadata = snapshot.fixedContext.inputs[name];
  return arguments_[name]?.kind === 'literal' && metadata?.role === 'editable' &&
    (metadata.source === 'field' || metadata.source === 'shadow');
};
const diagnostic = (declaration: FixedInputDeclaration, code: string, argument: string): ValidationIssue => Object.freeze({
  message: `Fixed branch validation failed: ${code}; contract=${JSON.stringify(declaration.contractId)}.`,
  path: `/${argument.replace(/~/g, '~0').replace(/\//g, '~1')}`
});
/** Shared session/host gate. Schema and owner validation remain the prepared factory's responsibility. */
export function validateFixedBranchChanges(declaration: FixedInputDeclaration, snapshot: FixedBlockSnapshot,
  changes: readonly LiteralArgumentChange[]): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const finalArguments = {...snapshot.arguments};
  const changed = new Set<string>();
  const seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.argument) || !['string', 'number', 'boolean'].includes(typeof change.value) || !declaration.editableArguments.includes(change.argument) ||
        !writableLiteral(snapshot, snapshot.arguments, change.argument)) {
      issues.push(diagnostic(declaration, 'disallowed-change', change.argument));continue;
    }
    seen.add(change.argument);
    const original = snapshot.arguments[change.argument];
    if (original?.kind === 'literal' && Object.is(original.value, change.value)) continue;
    changed.add(change.argument);
    Object.defineProperty(finalArguments, change.argument, {value: {kind: 'literal', value: change.value}, enumerable: true, configurable: true});
  }
  const resolved = resolveFixedBranches(declaration, snapshot, finalArguments);
  for (const group of declaration.dependencies) {
    if (![group.selector, ...group.dependents].some(name => changed.has(name))) continue;
    const branch = resolved.find(item => item.selector === group.selector);
    if (!branch?.selected) {
      issues.push(diagnostic(declaration, branch ? 'selector-unavailable' : 'fixed-dependency-validation-unavailable', group.selector));continue;
    }
    for (const argument of group.dependents) {
      if (changed.has(argument) && !branch.selected.activeDependents.includes(argument)) {
        issues.push(diagnostic(declaration, 'inactive-change', argument));
      }
    }
    if (!changed.has(group.selector)) continue;
    for (const argument of branch.selected.activeDependents) {
      if (!writableLiteral(snapshot, finalArguments, argument)) issues.push(diagnostic(declaration, 'dependency-unverifiable', argument));
    }
    for (const requirement of branch.selected.requireOnSelectorChange ?? []) {
      const metadata = snapshot.fixedContext.inputs[requirement.argument];
      const slot = finalArguments[requirement.argument];
      if (!metadata || metadata.role !== 'readonly' || (metadata.source !== 'field' && metadata.source !== 'shadow') || slot?.kind !== 'literal') {
        issues.push(diagnostic(declaration, 'dependency-unverifiable', requirement.argument));
      } else if (requirement.rule === 'nonempty-string' && (typeof slot.value !== 'string' || !slot.value.trim())) {
        issues.push(diagnostic(declaration, 'dependency-invalid', requirement.argument));
      }
    }
  }
  return Object.freeze(issues);
}
