export interface SpinnerProps {
  size?: number
  // Omit when a visible label already describes the wait.
  label?: string
}

export function Spinner({ size = 14, label }: SpinnerProps) {
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
  )
}
