import { createApiClient } from "@pupitre/api/client"
import { setApiClient } from "@/lib/api/client"

const RECORDER_ORIGIN = "http://api.test"

export interface ApiRecorder {
  calls: string[]
  restore: () => void
}

/**
 * The console's API client, answering from memory and writing down what it was
 * asked, so a test can say which routes a click reaches — and which it does not.
 */
export function recordApiCalls(): ApiRecorder {
  const calls: string[] = []

  setApiClient(
    createApiClient(RECORDER_ORIGIN, {
      fetch: (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input.toString()
        )

        calls.push(`${init?.method ?? "GET"} ${url.pathname}`)

        return Promise.resolve(Response.json({ data: null }))
      },
    })
  )

  return { calls, restore: () => setApiClient(null) }
}
