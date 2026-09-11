import type { LanguageSupport } from "@codemirror/language";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

/**
 * The grammar a file is read with, brought in only when a file asks for it.
 *
 * `language-data` names every language and loads each on demand, so the app
 * ships one small table and fetches a parser the first time a file of that
 * kind opens. A file nobody has a grammar for is edited as plain text.
 */
export function languageFor(name: string): Promise<LanguageSupport | null> {
  const found = LanguageDescription.matchFilename(languages, name);

  return found ? found.load() : Promise.resolve(null);
}
