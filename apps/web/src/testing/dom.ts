import { GlobalRegistrator } from "@happy-dom/global-registrator"

if (typeof globalThis.window === "undefined") {
  // happy-dom écrase WritableStream par le Writable de Node, que pipeTo refuse.
  const { WritableStream } = globalThis

  GlobalRegistrator.register({ url: "http://localhost:3000" })

  globalThis.WritableStream = WritableStream
}
