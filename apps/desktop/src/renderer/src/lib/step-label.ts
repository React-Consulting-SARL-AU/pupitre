import type { DictionaryKey } from "@renderer/i18n/en";
import type { Translate } from "@renderer/i18n/i18n";

const PART_STEP = /^(db|project|path):(.+)$/;

const HOME_PREFIX = /^~?\/?/;

const WHOLE_ENGINE = "*";

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
