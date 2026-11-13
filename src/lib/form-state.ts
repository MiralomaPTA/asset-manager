/** What a server action hands back to its form when it doesn't redirect. */
export interface FormState {
  error?: string;
  field?: string;
  lineErrors?: Record<string, string>;
  overbook?: string[];
  /** Bumped on every failed submit, so a form can tell a new error from the last one. */
  attempt?: number;
}

export const NO_STATE: FormState = {};
