import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start"

const NONCE_META_SELECTOR = 'meta[property="csp-nonce"]'

export const readCspNonce = createIsomorphicFn()
  .client(
    () =>
      document.querySelector<HTMLMetaElement>(NONCE_META_SELECTOR)?.content ??
      undefined
  )
  .server(() => getGlobalStartContext()?.nonce)
