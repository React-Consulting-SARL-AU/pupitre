import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start"
import { webAnalyticsBeaconConfig } from "@/lib/config/web-analytics"

export const WEB_ANALYTICS_BEACON_SELECTOR = "script[data-cf-beacon]"

// The browser reads back what the server rendered, so hydration sees the same tag.
export const readWebAnalyticsBeacon = createIsomorphicFn()
  .client(
    () =>
      document.querySelector<HTMLScriptElement>(WEB_ANALYTICS_BEACON_SELECTOR)
        ?.dataset.cfBeacon ?? null
  )
  .server(() => {
    const token = getGlobalStartContext()?.analyticsToken

    return token ? webAnalyticsBeaconConfig(token) : null
  })
