import { encode } from "uqr"
import { cn } from "@/lib/utils/cn"

const BORDER_MODULES = 2

// One path for the whole matrix: a few hundred rects would be a few hundred
// nodes for a picture that never changes.
function modulesPath(matrix: boolean[][]): string {
  const segments: string[] = []

  for (const [y, row] of matrix.entries()) {
    for (const [x, dark] of row.entries()) {
      if (dark) {
        segments.push(`M${x} ${y}h1v1h-1z`)
      }
    }
  }

  return segments.join("")
}

export interface QrCodeProps {
  value: string
  label: string
  className?: string
}

export function QrCode({ value, label, className }: QrCodeProps) {
  const { size, data } = encode(value, { ecc: "M", border: BORDER_MODULES })

  return (
    <svg
      aria-label={label}
      className={cn("size-[184px] rounded-sm text-ink", className)}
      role="img"
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="fill-base" height={size} width={size} x="0" y="0" />
      <path d={modulesPath(data)} fill="currentColor" />
    </svg>
  )
}
