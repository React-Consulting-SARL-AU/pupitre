import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Kept from Bun: the main tests need real network and clocks, and happy-dom refuses `blob:` and Bun's `Response`.
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

// Registered once for the whole run, before React and Base UI decide at load time whether they run in a browser.
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
