/** The value never takes this shape, so only the single reveal ever carries it over IPC. */
export interface SecretMark {
  filled: boolean;
  generated: boolean;
  revealed: boolean;
}

export type SecretMarks = Record<string, Record<string, SecretMark>>;

export function itemKey(key: string, index: number): string {
  return `${key}.${index}`;
}
