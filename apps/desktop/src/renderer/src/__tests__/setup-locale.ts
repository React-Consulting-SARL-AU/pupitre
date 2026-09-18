export {};

// React's static render serves the store's initial state: the language must
// be chosen before the module is loaded, so via `navigator`, not `setState`.
// The document's own navigator keeps everything else it says about itself.
Object.defineProperty(globalThis.navigator, "language", {
  configurable: true,
  value: "fr-FR",
});

await import("@renderer/stores/locale");
