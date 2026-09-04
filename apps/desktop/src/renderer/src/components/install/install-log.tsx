/**
 * Everything that was said, folded away.
 *
 * The module list above already tells the story; this is for the line someone
 * will want to paste into a ticket, so it keeps the order and nothing else.
 */
export function InstallLog({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) {
    return null;
  }

  return (
    <details className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
      <summary className="clickable cursor-pointer px-4 py-3 text-ink-2 transition-soft hover:text-ink">
        Journal — {lines.length} lignes
      </summary>

      <pre className="max-h-72 overflow-auto border-line border-t bg-sunken px-4 py-3 font-data text-[11px] text-ink-3 leading-relaxed">
        {lines.join("\n")}
      </pre>
    </details>
  );
}
