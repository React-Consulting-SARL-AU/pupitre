import { useEffect } from "react"
import { type RequestPhase, useRequestCycle } from "@/hooks/use-request-cycle"
import { attachmentUrl } from "@/lib/api/inbox-queries"

const FAILED_MS = 1500

export interface AttachmentDownload {
  phase: RequestPhase
  download: () => Promise<void>
}

export function useAttachmentDownload(
  attachmentId: string
): AttachmentDownload {
  const cycle = useRequestCycle()

  useEffect(() => {
    if (cycle.phase !== "failed") {
      return
    }

    const timer = setTimeout(cycle.reset, FAILED_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [cycle.phase, cycle.reset])

  return {
    phase: cycle.phase,
    download: () =>
      cycle.run(async () => {
        const { url } = await attachmentUrl(attachmentId, "attachment")

        window.open(url, "_blank", "noopener")
      }),
  }
}
