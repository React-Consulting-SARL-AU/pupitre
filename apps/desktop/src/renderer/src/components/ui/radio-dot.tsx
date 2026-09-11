/**
 * One answer among several, drawn rather than left to the platform.
 *
 * The native input stays in the document and keeps the keyboard, the label and
 * the arrow keys working; the circle next to it is what the eye reads, in the
 * two inks the design system allows. A browser's own radio paints itself in
 * the system accent, which is the one colour this product never uses.
 */
export function RadioDot({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  onChange?: () => void;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        aria-label={label}
        checked={checked}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        name={name}
        onChange={() => onChange?.()}
        type="radio"
        value={value}
      />
      <span
        aria-hidden="true"
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border transition-soft ${
          checked ? "border-inverse" : "border-line-strong"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full transition-soft ${
            checked ? "bg-inverse" : "bg-transparent"
          }`}
        />
      </span>
    </span>
  );
}
