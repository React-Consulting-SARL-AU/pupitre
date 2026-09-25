import { Check, Copy, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export interface CopyButtonProps {
  value: string
  label: string
  copiedLabel: string
  failedLabel: string
}

const COPIED_MS = 1500

type CopyState = "idle" | "copied" | "failed"

const ICONS: Record<CopyState, typeof Copy> = {
  idle: Copy,
  copied: Check,
  failed: X,
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle")
  const current = { idle: label, copied: copiedLabel, failed: failedLabel }[
    state
  ]

  useEffect(() => {
    if (state === "idle") {
      return
    }

    const timer = setTimeout(() => {
      setState("idle")
    }, COPIED_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [state])

  return (
    <Button
      aria-label={current}
      className="w-7 px-0"
      icon={ICONS[state]}
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => {
            setState("copied")
          },
          () => {
            setState("failed")
          }
        )
      }}
      size="sm"
      title={current}
      variant="ghost"
    />
  )
}
