/**
 * What both sides of the bridge may know about a secret: that there is one.
 *
 * The value itself never appears in this shape, and so never crosses IPC except
 * for the single reveal the screen asks for. Everything else — the renderer's
 * store, the logs, the install parameters — sees only these three booleans.
 */
export interface SecretMark {
  filled: boolean;
  generated: boolean;
  revealed: boolean;
}

export type SecretMarks = Record<string, Record<string, SecretMark>>;

/** An element of a `list` field of `secret` items: `providers.0`. */
export function itemKey(key: string, index: number): string {
  return `${key}.${index}`;
}
