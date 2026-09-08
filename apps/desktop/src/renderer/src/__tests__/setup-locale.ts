export {};

// React's static render serves the store's initial state: the language must
// be chosen before the module is loaded, so via `navigator`, not `setState`.
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { ...globalThis.navigator, language: "fr-FR" },
});

await import("@renderer/stores/locale");
