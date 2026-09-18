import { NumberField as Base } from "@base-ui-components/react/number-field";
import { Minus, Plus } from "lucide-react";

const STEPPER =
  "clickable flex w-9 shrink-0 cursor-pointer items-center justify-center text-ink-3 transition-soft hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

/**
 * A number with a floor and a ceiling, stepped by two buttons or typed.
 *
 * The platform's own spinner is two pixels tall and takes no keyboard; this
 * one is drawn at the size everything else is drawn at, and the arrow keys
 * step the value as the buttons do. What lands is always inside the bounds,
 * so a preference never holds a value the reader could not have chosen.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  wrong = false,
  disabled = false,
  decrementLabel,
  incrementLabel,
  ...rest
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  wrong?: boolean;
  disabled?: boolean;
  decrementLabel: string;
  incrementLabel: string;
  id?: string;
  name?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}) {
  const { id, name, ...aria } = rest;

  return (
    <Base.Root
      disabled={disabled}
      max={max}
      min={min}
      name={name}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next);
        }
      }}
      step={step}
      value={value}
    >
      <Base.Group
        className={`flex w-full items-stretch overflow-hidden rounded-md border bg-sunken transition-soft ${wrong ? "border-danger" : "border-line-strong focus-within:border-ink"}`}
      >
        <Base.Decrement aria-label={decrementLabel} className={STEPPER}>
          <Minus size={12} strokeWidth={1.5} />
        </Base.Decrement>
        <Base.Input
          className="min-w-0 flex-1 border-line-strong border-x bg-transparent px-3 py-2 text-center font-data text-[13px] text-ink tabular-nums outline-none"
          id={id}
          {...aria}
        />
        <Base.Increment aria-label={incrementLabel} className={STEPPER}>
          <Plus size={12} strokeWidth={1.5} />
        </Base.Increment>
      </Base.Group>
    </Base.Root>
  );
}
