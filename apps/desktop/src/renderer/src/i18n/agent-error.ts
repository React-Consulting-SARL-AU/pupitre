import { accountOf, useAccount } from "@renderer/stores/account";
import type { ErrorPhrase } from "@shared/agent";
import type { DictionaryKey } from "./en";
import type { Translate } from "./i18n";

interface Refusal {
  message: string;
  fix?: string;
  phrase?: ErrorPhrase;
}

// Without a phrase the refusal shows word for word: the server owns its phrasing and casing.
export function agentText(
  t: Translate,
  error: Refusal
): { message: string; fix?: string } {
  const phrase = error.phrase;

  if (!phrase) {
    return error.fix === undefined
      ? { message: error.message }
      : { message: error.message, fix: error.fix };
  }

  const message = t(phrase.id as DictionaryKey, phrase.values);
  const fix = t.has(`${phrase.id}.fix`)
    ? remedy(t, `${phrase.id}.fix` as DictionaryKey, phrase.values)
    : error.fix;

  return fix === undefined ? { message } : { message, fix };
}

export function agentLine(t: Translate, error: Refusal): string {
  const said = agentText(t, error);

  return [said.message, said.fix].filter(Boolean).join(" ");
}

/** A remedy's `.dev` twin, when it exists, replaces it in a development build. */
export function remedy(
  t: Translate,
  key: DictionaryKey,
  values?: Record<string, string | number>
): string {
  const developer = `${key}.dev`;
  const development =
    accountOf(useAccount.getState().view)?.build === "development";

  return development && t.has(developer)
    ? t(developer as DictionaryKey, values)
    : t(key, values);
}
