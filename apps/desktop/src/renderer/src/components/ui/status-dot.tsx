export type StatusShape =
  | "filled"
  | "empty"
  | "struck"
  | "breathing"
  | "ringed";

export type StatusTone = "neutral" | "ok" | "warn" | "danger";

const TONE: Record<StatusTone, string> = {
  neutral: "text-ink-3",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

const SOLID: StatusShape[] = ["filled", "breathing", "ringed"];

/**
 * The state of a thing, told by a shape.
 *
 * Full dot online, hollow circle stopped, struck dot failed, breathing dot in
 * progress, ringed dot waiting for you. The tone only confirms what the outline
 * already says, so the screen survives being read in pure greys.
 */
export function StatusDot({
  shape,
  tone = "neutral",
  label,
  size = 10,
}: {
  shape: StatusShape;
  tone?: StatusTone;
  /** Absent means the dot is decorative and its meaning is written next to it. */
  label?: string;
  size?: number;
}) {
  const solid = SOLID.includes(shape);

  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={`shrink-0 ${TONE[tone]}`}
      data-shape={shape}
      data-tone={tone}
      height={size}
      role={label ? "img" : undefined}
      viewBox="0 0 12 12"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {label ? <title>{label}</title> : null}

      {solid ? (
        <circle
          className={shape === "breathing" ? "animate-breathe" : undefined}
          cx="6"
          cy="6"
          fill="currentColor"
          r={shape === "ringed" ? 2.6 : 3.8}
        />
      ) : (
        <circle
          cx="6"
          cy="6"
          fill="none"
          r="3.1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}

      {shape === "ringed" ? (
        <circle
          cx="6"
          cy="6"
          fill="none"
          r="5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ) : null}

      {shape === "struck" ? (
        <line
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
          x1="1.8"
          x2="10.2"
          y1="10.2"
          y2="1.8"
        />
      ) : null}
    </svg>
  );
}
