import { MARK } from "@pupitre/design/brand";

/**
 * The app's mark: the prompt glyph in a square with `md` corners, inverted.
 *
 * The geometry comes from `@pupitre/design/brand`, which the app icon, the
 * favicon and the brand kit are drawn from too. Black on white in the light
 * theme, white on black in the dark one — the tokens swap on their own, so the
 * mark follows the window without a second asset.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox={`0 0 ${MARK.grid} ${MARK.grid}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Pupitre</title>
      <rect
        fill="var(--inverse)"
        height={MARK.grid}
        rx={MARK.radius}
        ry={MARK.radius}
        width={MARK.grid}
        x="0"
        y="0"
      />
      <g
        stroke="var(--inverse-ink)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={MARK.stroke}
      >
        <path d={MARK.chevron} />
        <path d={MARK.underscore} />
      </g>
    </svg>
  );
}
