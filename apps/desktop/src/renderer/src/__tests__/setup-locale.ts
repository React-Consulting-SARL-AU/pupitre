export {};

// Le rendu statique de React sert l'état initial du store : la langue doit être
// choisie avant que le module ne soit chargé, donc par `navigator`, pas par `setState`.
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { ...globalThis.navigator, language: "fr-FR" },
});

await import("@renderer/stores/locale");
