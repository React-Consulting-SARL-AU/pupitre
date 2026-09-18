import { Radio as BaseRadio } from "@base-ui-components/react/radio";
import { RadioGroup as BaseGroup } from "@base-ui-components/react/radio-group";
import type { ReactNode } from "react";

/**
 * One question with several answers, of which exactly one stands.
 *
 * The group holds the answer and the arrow keys; each `Radio` inside it names
 * one of the answers. A browser's own radio paints itself in the system
 * accent, which is the one colour this product never uses, so the circle is
 * drawn here in the two inks the design system allows.
 */
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
  /** What the question is, for whoever hears it rather than reads it. */
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

/**
 * An answer and its words on one line, the whole line clickable: the title in
 * the reading ink, what it means under it.
 */
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
  /** What stands between the circle and the words: a logo, a glyph. */
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
          <span className="text-[12px] text-ink-3 leading-relaxed">
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}
