import { Switch as Base } from "@base-ui-components/react/switch";
import type { ReactNode } from "react";

/**
 * A preference that is on or off, landing the moment it is flipped.
 *
 * A checkbox says "include this"; a switch says "this is on". The settings
 * are made of the second kind, so they take this control: the word on the
 * left, what the choice changes under it, the switch at the end of the line.
 */
export function Switch({
  name,
  checked,
  disabled = false,
  label,
  onChange,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <Base.Root
      aria-label={label}
      checked={checked}
      className={`clickable relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line-strong bg-sunken p-0.5 transition-soft data-[checked]:border-inverse data-[checked]:bg-inverse ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
      disabled={disabled}
      name={name}
      onCheckedChange={onChange}
    >
      <Base.Thumb className="size-3.5 rounded-full bg-ink-3 transition-soft data-[checked]:translate-x-4 data-[checked]:bg-inverse-ink" />
    </Base.Root>
  );
}

/**
 * A switch and its word on one line, the word clickable and the switch at
 * the end of it, so a column of preferences reads as a column.
 */
export function SwitchLine({
  name,
  label,
  detail,
  checked,
  disabled = false,
  onChange,
}: {
  name: string;
  label: string;
  /** What the choice changes for the reader, when the word alone does not say. */
  detail?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is inside Switch, and wrapping it is what makes the word clickable
    <label
      className="clickable flex items-start justify-between gap-6"
      data-switch={name}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ink">{label}</span>
        {detail ? (
          <span className="text-[12px] text-ink-3 leading-relaxed">
            {detail}
          </span>
        ) : null}
      </span>
      <span className="flex h-[1.5em] items-center">
        <Switch
          checked={checked}
          disabled={disabled}
          label={label}
          name={name}
          onChange={onChange}
        />
      </span>
    </label>
  );
}
