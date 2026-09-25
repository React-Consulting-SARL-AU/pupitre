import { accountOf, useAccount } from "@renderer/stores/account";
import type { ErrorPhrase } from "@shared/agent";
import type { DictionaryKey } from "./en";
import type { Translate } from "./i18n";

/**
 * What a refusal gives to read.
 *
 * A refusal from the main process names a dictionary entry: it's rendered
 * here, in the viewer's own language. A refusal from the agent carries none,
 * and shows word for word — the server is the source of truth for what
 * concerns it, including its own phrasing and its own casing: a project named
 * `shop` stays `shop`.
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
    ? remedy(t, `${phrase.id}.fix` as DictionaryKey, phrase.values)
    : error.fix;

  return fix === undefined ? { message } : { message, fix };
}

/** The refusal and its remedy as the one line a field carries under it. */
export function agentLine(t: Translate, error: Refusal): string {
  const said = agentText(t, error);

  return [said.message, said.fix].filter(Boolean).join(" ");
}

/** A remedy that names the repository or a release has a `.dev` twin, read only by a development build. */
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
