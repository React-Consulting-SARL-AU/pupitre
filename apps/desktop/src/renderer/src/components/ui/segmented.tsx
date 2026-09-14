/**
 * One choice among a few words, the chosen one drawn in inverse.
 *
 * A sort, a filter, a view: what a segmented control asks is answered on the
 * spot and read at a glance, which a select would hide behind a click.
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
    <fieldset
      aria-label={label}
      className="flex items-center gap-0.5 rounded-full border border-line p-0.5"
    >
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={`clickable rounded-full px-2.5 py-0.5 text-[11px] transition-fast ${
            value === option.value
              ? "bg-inverse text-inverse-ink"
              : "text-ink-3 hover:text-ink"
          }`}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
