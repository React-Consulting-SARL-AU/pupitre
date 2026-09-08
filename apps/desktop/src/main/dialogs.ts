import { currentLanguage } from "./agent";

/**
 * The two labels the system displays itself.
 *
 * A file dialog is painted by macOS or Windows, never by the renderer: it
 * cannot read the app's dictionary, so the main process keeps these two
 * phrases, and nothing else.
 */
const DIALOGS = {
  en: { import: "Import", pickKey: "Choose a private key" },
  fr: { import: "Importer", pickKey: "Choisir une clé privée" },
} as const;

export function dialogText(key: keyof (typeof DIALOGS)["fr"]): string {
  return DIALOGS[currentLanguage() === "en" ? "en" : "fr"][key];
}
