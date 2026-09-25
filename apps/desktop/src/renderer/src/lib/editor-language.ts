import type { LanguageSupport } from "@codemirror/language";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

export function languageFor(name: string): Promise<LanguageSupport | null> {
  const found = LanguageDescription.matchFilename(languages, name);

  return found ? found.load() : Promise.resolve(null);
}
