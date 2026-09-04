import { useCallback, useState } from "react"

export type RequestPhase = "idle" | "pending" | "done" | "failed"

export interface RequestCycle {
  phase: RequestPhase
  error: string | null
  run: (work: () => Promise<void>) => Promise<void>
  reset: () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Une erreur inattendue s'est produite."
}

export function useRequestCycle(): RequestCycle {
  const [phase, setPhase] = useState<RequestPhase>("idle")
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (work: () => Promise<void>) => {
    setPhase("pending")
    setError(null)

    try {
      await work()
      setPhase("done")
    } catch (caught) {
      setError(messageOf(caught))
      setPhase("failed")
    }
  }, [])

  const reset = useCallback(() => {
    setPhase("idle")
    setError(null)
  }, [])

  return { phase, error, run, reset }
}
