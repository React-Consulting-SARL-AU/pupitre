import { Toggle } from "@base-ui-components/react/toggle";
import { ToggleGroup } from "@base-ui-components/react/toggle-group";

/**
 * One choice among a few words, the chosen one drawn in inverse.
 *
 * A sort, a filter, a view: what a segmented control asks is answered on the
 * spot and read at a glance, which a select would hide behind a click. One
 * word is always pressed: unpressing the current one changes nothing.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      className="flex items-center gap-0.5 rounded-full border border-line p-0.5"
      onValueChange={(next) => {
        const [picked] = next as T[];

        if (picked !== undefined) {
          onChange(picked);
        }
      }}
      value={[value]}
    >
      {options.map((option) => (
        <Toggle
          className="clickable rounded-full px-2.5 py-0.5 text-caption text-ink-3 transition-fast hover:text-ink data-[pressed]:bg-inverse data-[pressed]:text-inverse-ink"
          key={option.value}
          value={option.value}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
