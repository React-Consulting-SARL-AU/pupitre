import { mock } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

if (typeof globalThis.window === "undefined") {
  // happy-dom overwrites WritableStream with Node's Writable, which pipeTo rejects.
  const { WritableStream } = globalThis

  GlobalRegistrator.register({ url: "http://localhost:3000" })

  globalThis.WritableStream = WritableStream
}

// The real reader needs the Start context of a request, which no unit test runs in.
mock.module("@/lib/csp-nonce", () => ({ readCspNonce: () => undefined }))
