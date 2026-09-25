/** One chord, drawn as a key cap. */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center whitespace-nowrap rounded-xs border border-line-strong bg-raised px-1.5 font-ui text-ink-2 text-small leading-none shadow-raised">
      {children}
    </kbd>
  );
}
