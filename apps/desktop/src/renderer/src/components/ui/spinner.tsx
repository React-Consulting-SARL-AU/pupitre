/**
 * The disc that turns while a gesture is still working.
 *
 * It sits where the icon of a button sits, so the control answers in the place
 * it was clicked without changing width. The faint ring behind the arc keeps
 * the glyph the same weight as the icon it replaces, rather than a line that
 * appears and disappears as it turns.
 */
export function Spinner({
  size = 13,
  label,
}: {
  size?: number;
  /** Absent means the wait is already written next to it. */
  label?: string;
}) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className="shrink-0 animate-spinner"
      data-spinner="true"
      height={size}
      role={label ? "img" : undefined}
      viewBox="0 0 12 12"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {label ? <title>{label}</title> : null}

      <circle
        cx="6"
        cy="6"
        fill="none"
        opacity="0.3"
        r="4.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6 1.8a4.2 4.2 0 0 1 4.2 4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
