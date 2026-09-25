import type { ReactNode } from "react";
import { CheckBox } from "./check-box";

export function CheckLine({
  name,
  label,
  detail,
  checked,
  disabled = false,
  size = "md",
  onChange,
}: {
  name: string;
  label: string;
  detail?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  onChange: (next: boolean) => void;
}) {
  const text =
    size === "sm" ? "gap-1.5 text-caption text-ink-3" : "gap-3 text-ink-2";

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is inside CheckBox, and wrapping it is what makes the word clickable
    <label className={`clickable flex items-start ${text}`}>
      <span className="flex h-[1.5em] items-center">
        <CheckBox
          checked={checked}
          disabled={disabled}
          label={label}
          name={name}
          onChange={onChange}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{label}</span>
        {detail ? (
          <span className="text-ink-3 text-small leading-relaxed">
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}
