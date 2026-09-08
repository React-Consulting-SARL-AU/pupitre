import type { ErrorPhrase } from "@shared/agent";
import type { DictionaryKey } from "./en";
import type { Translate } from "./i18n";

/**
 * What a refusal gives to read.
 *
 * A refusal from the main process names a dictionary entry: it's rendered
 * here, in the viewer's own language. A refusal from the agent carries none,
 * and shows word for word — the server is the source of truth for what
 * concerns it, including its own phrasing.
 */
/** Anything that carries a phrase: a refusal from the agent, from the account, or a warning. */
interface Refusal {
  message: string;
  fix?: string;
  phrase?: ErrorPhrase;
}

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
    ? t(`${phrase.id}.fix` as DictionaryKey, phrase.values)
    : error.fix;

  return fix === undefined ? { message } : { message, fix };
}
