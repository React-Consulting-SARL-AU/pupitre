import { Check, Lock, Minus } from "lucide-react";

/**
 * A checkbox whose state is a shape before it is a colour.
 *
 * The native input stays in the document and keeps the keyboard and the label
 * working; the square next to it is what the eye reads — a tick when chosen, a
 * padlock when the catalogue calls the module mandatory, a dash when something
 * else stands in the way.
 */
export function CheckBox({
  name,
  checked,
  disabled = false,
  locked = false,
  label,
  onChange,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  label: string;
  onChange?: (next: boolean) => void;
}) {
  const frame = checked
    ? "border-inverse bg-inverse text-inverse-ink"
    : "border-line-strong text-transparent";

  let glyph = <Check size={11} strokeWidth={2.5} />;
  if (locked) {
    glyph = <Lock size={10} strokeWidth={2} />;
  } else if (disabled && !checked) {
    glyph = <Minus className="text-ink-4" size={11} strokeWidth={2} />;
  }

  return (
    <span className="relative inline-flex shrink-0">
      <input
        aria-label={label}
        checked={checked}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        disabled={disabled || locked}
        name={name}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border transition-soft ${frame} ${disabled && !checked ? "opacity-60" : ""}`}
      >
        {glyph}
      </span>
    </span>
  );
}
