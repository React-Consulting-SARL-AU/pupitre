/**
 * The app's mark, taken from its icon.
 *
 * A prompt chevron and two status lines: a console, and several things whose
 * state you watch. The stroke follows the requested size so it stays legible at
 * 16 pixels in a bar as well as at 40 on a welcome screen.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 1024 1024"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Pupitre</title>
      <g
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={size < 20 ? 108 : 84}
      >
        <path d="M 292 352 L 452 512 L 292 672" stroke="var(--color-accent)" />
        <path d="M 590 428 L 736 428" stroke="var(--color-ink-2)" />
        <path d="M 590 596 L 700 596" stroke="var(--color-ink-4)" />
      </g>
    </svg>
  );
}
