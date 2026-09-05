import type { ReactNode } from "react";
import { Label } from "./label";

/** The shared look of every text input, select and textarea of the app. */
export const fieldControlClass =
  "w-full rounded-md border border-line-strong bg-sunken px-3 py-1.5 font-data text-[12px] text-ink outline-none transition-soft placeholder:text-ink-4 focus:border-ink disabled:text-ink-4";

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the caller's child, and wrapping it is what makes the caption clickable
    <label className="flex min-w-0 flex-col gap-1">
      <Label>{label}</Label>
      {children}
      {help ? <span className="text-[11px] text-ink-3">{help}</span> : null}
    </label>
  );
}
