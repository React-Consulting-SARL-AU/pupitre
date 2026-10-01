import { useState } from "react"
import { WEB_ANALYTICS_SCRIPT_URL } from "@/lib/config/web-analytics"
import { readCspNonce } from "@/lib/csp-nonce"
import { readWebAnalyticsBeacon } from "@/lib/web-analytics-beacon"

export function WebAnalyticsBeacon() {
  const [config] = useState(readWebAnalyticsBeacon)
  const [nonce] = useState(readCspNonce)

  if (!config) {
    return null
  }

  return (
    <script
      data-cf-beacon={config}
      defer
      nonce={nonce}
      src={WEB_ANALYTICS_SCRIPT_URL}
    />
  )
}
