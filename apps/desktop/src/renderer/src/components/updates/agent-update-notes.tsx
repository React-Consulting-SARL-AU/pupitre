/**
 * What the published version says of itself.
 *
 * The notes belong to the release the app carries, printed in the order they
 * were written: nothing here summarises them, and a version that shipped
 * without notes shows none rather than a sentence we made up for it.
 */
export function AgentUpdateNotes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1 border-line border-l pl-3">
      {notes.map((note) => (
        <li className="text-ink-2 leading-relaxed" key={note}>
          {note}
        </li>
      ))}
    </ul>
  );
}
