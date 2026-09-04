/**
 * The app's mark: the prompt glyph in a square with `md` corners, inverted.
 *
 * Black on white in the light theme, white on black in the dark one — the tokens
 * swap on their own, so the mark follows the window without a second asset.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Pupitre</title>
      <rect
        fill="var(--inverse)"
        height="24"
        rx="6"
        ry="6"
        width="24"
        x="0"
        y="0"
      />
      <g
        stroke="var(--inverse-ink)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M 7 8.5 L 10.5 12 L 7 15.5" />
        <path d="M 13 15.5 L 17 15.5" />
      </g>
    </svg>
  );
}
