import { Radio } from "@base-ui-components/react/radio";
import { RadioGroup } from "@base-ui-components/react/radio-group";
import type { ReactNode } from "react";
import type { ButtonIcon } from "./button";
import { Label } from "./label";

export function ModeCards<T extends string>({
  label,
  value,
  onChange,
  children,
}: {
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
      <span className="text-ink-3 text-small leading-relaxed">{detail}</span>
    </Radio.Root>
  );
}
