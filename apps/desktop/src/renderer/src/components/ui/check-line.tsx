import { CheckBox } from "./check-box";

/**
 * A checkbox and its word on one line, the word clickable.
 *
 * The settings are made of these: one choice, said once, landing the moment it
 * is made. The label wraps the control so the whole line is the target.
 */
export function CheckLine({
  name,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is inside CheckBox, and wrapping it is what makes the word clickable
    <label className="clickable flex items-center gap-2.5 text-ink-2">
      <CheckBox
        checked={checked}
        disabled={disabled}
        label={label}
        name={name}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}
