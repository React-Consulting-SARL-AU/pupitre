import type { DictionaryKey } from "@renderer/i18n/en";
import type { Translate } from "@renderer/i18n/i18n";

const PART_STEP = /^(db|project|path):(.+)$/;

const HOME_PREFIX = /^~?\/?/;

const WHOLE_ENGINE = "*";

/**
 * An agent step said the way the reader would say it.
 *
 * A step the dictionary knows reads as its phrase; one the agent names after a
 * tool (`install-node-22`) reads as its verb and the tool; a backup part reads
 * as the part. Anything else keeps the agent's own id, which is what the
 * Details of the step show in every case.
 */
export function stepLabel(t: Translate, step: string): string {
  const known = `install.step.${step}`;

  if (t.has(known)) {
    return t(known as DictionaryKey);
  }

  const part = partLabel(t, step);

  if (part) {
    return part;
  }

  const dash = step.indexOf("-");
  const verb = `install.stepVerb.${step.slice(0, dash)}`;

  if (dash > 0 && t.has(verb)) {
    return t(verb as DictionaryKey, { thing: step.slice(dash + 1) });
  }

  return step;
}

function partLabel(t: Translate, step: string): string | null {
  if (step === "setup" || step === "home") {
    return t(`backups.part.${step}`);
  }

  const match = PART_STEP.exec(step);

  if (!match) {
    return null;
  }

  const [, kind, rest] = match;

  if (kind === "db") {
    const [engine, name] = rest.split(":");

    return t("backups.part.database", {
      database: !name || name === WHOLE_ENGINE ? engine : name,
    });
  }

  return kind === "project"
    ? t("backups.part.project", { name: rest })
    : t("backups.part.path", { path: rest.replace(HOME_PREFIX, "") });
}
