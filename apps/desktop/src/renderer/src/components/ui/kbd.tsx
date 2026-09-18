/** One chord, drawn as a key cap. */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-line px-1.5 font-data text-[11px] text-ink-3">
      {children}
    </kbd>
  );
}
