/** Captured once by the host at service/editor creation; never controlled by extension metadata. */
export interface EditorFeatureFlags {
  readonly commonLayout?: boolean;
}

export function captureFeatureFlags(options: EditorFeatureFlags = {}): Readonly<Required<EditorFeatureFlags>> {
  if (options.commonLayout !== undefined && typeof options.commonLayout !== 'boolean') {
    throw new TypeError('Invalid common layout feature flag.');
  }
  return Object.freeze({commonLayout: options.commonLayout === true});
}
