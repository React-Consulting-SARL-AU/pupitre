import { useEffect, useState } from "react"
import {
  type DetectedArch,
  detectArch,
  detectOs,
  type Machine,
  type MachineHints,
} from "@/lib/domain/downloads"

interface HighEntropyValues {
  architecture?: string
  bitness?: string
}

interface UserAgentData {
  getHighEntropyValues(hints: string[]): Promise<HighEntropyValues>
}

function userAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

function graphicsCard(): string | undefined {
  if (typeof document === "undefined") {
    return
  }

  const context = document.createElement("canvas").getContext("webgl")
  const debug = context?.getExtension("WEBGL_debug_renderer_info")

  if (!(context && debug)) {
    return
  }

  const renderer: unknown = context.getParameter(debug.UNMASKED_RENDERER_WEBGL)

  return typeof renderer === "string" ? renderer : undefined
}

async function statedArchitecture(): Promise<MachineHints> {
  const data = (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData

  if (!data) {
    return {}
  }

  try {
    return await data.getHighEntropyValues(["architecture", "bitness"])
  } catch {
    return {}
  }
}

/**
 * The machine the page runs on: the system from the user agent, the
 * processor asked from the browser once the page is on screen — the server
 * renders it undecided, and so does a browser that will not say.
 */
export function useMachine(): Machine {
  const [arch, setArch] = useState<DetectedArch | null>(null)

  useEffect(() => {
    let current = true

    statedArchitecture().then((stated) => {
      if (current) {
        setArch(detectArch({ ...stated, renderer: graphicsCard() }))
      }
    })

    return () => {
      current = false
    }
  }, [])

  return { os: detectOs(userAgent()), arch }
}
