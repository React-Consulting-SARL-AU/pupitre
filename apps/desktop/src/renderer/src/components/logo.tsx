import { MARK } from "@pupitre/design/brand";

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
