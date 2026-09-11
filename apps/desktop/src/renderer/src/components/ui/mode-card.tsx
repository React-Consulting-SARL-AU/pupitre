import type { ButtonIcon } from "./button";
import { Label } from "./label";

/**
 * One way of doing a thing, picked like a radio and read like a card.
 *
 * The ways are shown side by side rather than hidden in a menu, because
 * choosing between them is the decision the screen is asking for; the note is
 * where a screen says which one it would take.
 */
export function ModeCard({
  icon: Icon,
  title,
  detail,
  note,
  picked,
  onPick,
}: {
  icon: ButtonIcon;
  title: string;
  detail: string;
  /** A word above the detail: recommended, required, what it costs. */
  note?: string;
  picked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      aria-pressed={picked}
      className={`flex flex-col items-start gap-1.5 rounded-sm border p-3 text-left transition-soft ${
        picked
          ? "border-ink bg-raised text-ink"
          : "border-line bg-base text-ink-2 hover:border-line-strong"
      }`}
      onClick={onPick}
      type="button"
    >
      <span className="flex items-center gap-1.5 font-medium text-ink">
        <Icon size={13} strokeWidth={1.5} />
        {title}
      </span>
      {note ? <Label>{note}</Label> : null}
      <span className="text-[12px] text-ink-3 leading-relaxed">{detail}</span>
    </button>
  );
}
