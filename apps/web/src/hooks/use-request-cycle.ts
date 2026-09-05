import { useCallback, useState } from "react"
import { useTranslations } from "@/hooks/use-locale"

export type RequestPhase = "idle" | "pending" | "done" | "failed"

export interface RequestCycle {
  phase: RequestPhase
  error: string | null
  run: (work: () => Promise<void>) => Promise<void>
  reset: () => void
}

export function useRequestCycle(): RequestCycle {
  const t = useTranslations()
  const [phase, setPhase] = useState<RequestPhase>("idle")
  const [error, setError] = useState<string | null>(null)

  const messageOf = useCallback(
    (error: unknown): string =>
      error instanceof Error ? error.message : t("common.unexpected"),
    [t]
  )

  const run = useCallback(
    async (work: () => Promise<void>) => {
      setPhase("pending")
      setError(null)

      try {
        await work()
        setPhase("done")
      } catch (caught) {
        setError(messageOf(caught))
        setPhase("failed")
      }
    },
    [messageOf]
  )

  const reset = useCallback(() => {
    setPhase("idle")
    setError(null)
  }, [])

  return { phase, error, run, reset }
}
