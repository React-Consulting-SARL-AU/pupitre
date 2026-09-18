import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * A document for every test, registered before React and Base UI load.
 *
 * Both decide at load time whether they run in a browser, and a test file
 * shares its modules with the files run before it: a document registered by
 * one file is a document the others never look at. So it is registered once,
 * first, for all of them. The runtime keeps its own network and timers: the
 * main process's tests talk to a real local server and drive real clocks,
 * and happy-dom's copies refuse a `blob:` address and a Bun `Response`.
 */
const RUNTIME = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "Blob",
  "File",
  "FormData",
  "URL",
  "URLSearchParams",
  "AbortController",
  "AbortSignal",
  "WritableStream",
  "ReadableStream",
  "TransformStream",
  "TextEncoder",
  "TextDecoder",
  "structuredClone",
  "crypto",
  "performance",
  "queueMicrotask",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
] as const;

if (!GlobalRegistrator.isRegistered) {
  const runtime = Object.fromEntries(
    RUNTIME.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ])
  );

  GlobalRegistrator.register({ url: "http://localhost/" });

  for (const [name, descriptor] of Object.entries(runtime)) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
}
