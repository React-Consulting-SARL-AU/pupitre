import { Radio as BaseRadio } from "@base-ui-components/react/radio";
import { RadioGroup as BaseGroup } from "@base-ui-components/react/radio-group";
import type { ReactNode } from "react";

export function RadioGroup({
  name,
  label,
  value,
  onChange,
  className = "",
  children,
  ...rest
}: {
  name: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <BaseGroup
      aria-label={label}
      className={className}
      name={name}
      onValueChange={(next) => onChange(String(next))}
      value={value}
      {...rest}
    >
      {children}
    </BaseGroup>
  );
}

// Drawn by hand: the native radio paints itself in the system accent colour, which the design never uses.
export function Radio({ value, label }: { value: string; label: string }) {
  return (
    <BaseRadio.Root
      aria-label={label}
      className="clickable inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong transition-soft data-[checked]:border-inverse"
      value={value}
    >
      <BaseRadio.Indicator className="size-2 rounded-full bg-inverse" />
    </BaseRadio.Root>
  );
}

export function RadioLine({
  value,
  label,
  detail,
  leading,
  ...rest
}: {
  value: string;
  label: string;
  detail?: ReactNode;
  leading?: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the radio is inside, and wrapping it is what makes the whole row clickable
    <label
      className="clickable flex items-center gap-3 rounded-md px-2 py-2 transition-fast hover:bg-raised"
      {...rest}
    >
      <Radio label={label} value={value} />
      {leading}
      <span className="flex min-w-0 flex-col">
        <span className="text-ink">{label}</span>
        {detail ? (
          <span className="text-ink-3 text-small leading-relaxed">
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}
