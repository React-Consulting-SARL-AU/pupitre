import { Radio } from "@base-ui-components/react/radio";
import { RadioGroup } from "@base-ui-components/react/radio-group";
import type { ReactNode } from "react";
import type { ButtonIcon } from "./button";
import { Label } from "./label";

/**
 * The ways of doing a thing, shown side by side rather than hidden in a
 * menu, because choosing between them is the decision the screen is asking
 * for. One of them always stands; the arrow keys walk from one to the next.
 */
export function ModeCards<T extends string>({
  label,
  value,
  onChange,
  children,
}: {
  /** What is being chosen, for whoever hears it rather than reads it. */
  label: string;
  value: T;
  onChange: (next: T) => void;
  children: ReactNode;
}) {
  return (
    <RadioGroup
      aria-label={label}
      className="grid gap-4 sm:grid-cols-3"
      onValueChange={(next) => onChange(next as T)}
      value={value}
    >
      {children}
    </RadioGroup>
  );
}

/**
 * One way of doing a thing, picked like a radio and read like a card.
 *
 * The note is where a screen says which one it would take.
 */
export function ModeCard({
  value,
  icon: Icon,
  title,
  detail,
  note,
}: {
  value: string;
  icon: ButtonIcon;
  title: string;
  detail: string;
  /** A word above the detail: recommended, required, what it costs. */
  note?: string;
}) {
  return (
    <Radio.Root
      aria-label={title}
      className="clickable flex cursor-pointer flex-col items-start gap-2 rounded-md border border-line bg-base p-4 text-left text-ink-2 transition-soft hover:border-line-strong data-[checked]:border-ink data-[checked]:bg-raised data-[checked]:text-ink"
      value={value}
    >
      <span className="flex items-center gap-2 font-medium text-ink">
        <Icon size={14} strokeWidth={1.5} />
        {title}
      </span>
      {note ? <Label>{note}</Label> : null}
      <span className="text-[12px] text-ink-3 leading-relaxed">{detail}</span>
    </Radio.Root>
  );
}
