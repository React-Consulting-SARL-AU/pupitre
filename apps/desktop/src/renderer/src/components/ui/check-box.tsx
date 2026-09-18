import { Checkbox } from "@base-ui-components/react/checkbox";
import { Check, Lock, Minus } from "lucide-react";

/**
 * A checkbox whose state is a shape before it is a colour.
 *
 * A hidden native input keeps the form and the label working; the square is
 * what the eye reads — a tick when chosen, a padlock when the catalogue calls
 * the module mandatory, a dash when something else stands in the way.
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
  const off = disabled || locked;

  let glyph = <Check size={11} strokeWidth={2.5} />;
  if (locked) {
    glyph = <Lock size={10} strokeWidth={2} />;
  } else if (disabled && !checked) {
    glyph = <Minus className="text-ink-4" size={11} strokeWidth={2} />;
  }

  return (
    <Checkbox.Root
      aria-label={label}
      checked={checked}
      className={`clickable inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-line-strong text-transparent transition-soft data-[checked]:border-inverse data-[checked]:bg-inverse data-[checked]:text-inverse-ink ${off ? "cursor-not-allowed" : "cursor-pointer"} ${disabled && !checked ? "opacity-60" : ""}`}
      disabled={off}
      name={name}
      onCheckedChange={(next) => onChange?.(next)}
    >
      <Checkbox.Indicator
        className="inline-flex"
        keepMounted={disabled && !checked}
      >
        {glyph}
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
