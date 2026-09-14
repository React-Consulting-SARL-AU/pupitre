/**
 * The columns of the ports table, shared by its head and its rows so that
 * what a caption says sits above what it names.
 *
 * The head carries the ids the controls of every row point at: one caption
 * labels a whole column, the way a table does, rather than each row repeating
 * three captions of its own. The scope tells one process's table from
 * another's on the same screen.
 */
export function portsHead(scope: string) {
  return {
    label: `${scope}.head.label`,
    port: `${scope}.head.port`,
    web: `${scope}.head.web`,
  } as const;
}

const SHARED = "grid items-center gap-3";

export function portsColumns(exposure: boolean): string {
  return exposure
    ? `${SHARED} grid-cols-[minmax(6rem,9rem)_5.5rem_minmax(0,1fr)_1.75rem]`
    : `${SHARED} grid-cols-[minmax(0,1fr)_5.5rem_1.75rem]`;
}
