export {};

// Static renders read the store's initial state, so the language is set before the module loads.
Object.defineProperty(globalThis.navigator, "language", {
  configurable: true,
  value: "fr-FR",
});

await import("@renderer/stores/locale");
