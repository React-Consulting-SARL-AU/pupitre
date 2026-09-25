/** One caption per column labels every row's control; the scope keeps each process's table apart. */
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
