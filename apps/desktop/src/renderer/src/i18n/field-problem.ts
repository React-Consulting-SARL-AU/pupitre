import type { Manifest } from "@pupitre/shared/catalog";
import type { FieldProblem } from "@pupitre/shared/catalog/validate";
import type { Translate } from "./i18n";

/**
 * Why a value is refused, in one sentence.
 *
 * A problem the agent sent already carries its own phrase, in the language of
 * the session, and it is printed exactly as it came: the server is the one that
 * looked at the machine. A problem the app computed carries only its code, and
 * the same sentences are said here — the two implementations share their rules,
 * so they may as well share their words.
 */
export function problemText(t: Translate, problem: FieldProblem): string {
  if (problem.message) {
    return problem.message;
  }

  const expected = problem.expected ?? "";

  switch (problem.code) {
    case "required":
      return t("config.problem.required");
    case "type":
      return t("config.problem.type", { expected });
    case "min":
      return t("config.problem.min", { expected });
    case "max":
      return t("config.problem.max", { expected });
    case "min_length":
      return t("config.problem.minLength", { expected });
    case "max_length":
      return t("config.problem.maxLength", { expected });
    case "options":
      return t("config.problem.options", { expected });
    case "pattern":
      return t("config.problem.pattern");
    case "connection":
      return t("config.problem.connection");
    default:
      return formatText(t, expected);
  }
}

/**
 * The refusals a form has no field to put under — a value the app fills from
 * a connection, a verdict on the whole module — each said with the name of the
 * field it concerns, so that none is left as a bare count.
 */
export function strayProblems(
  t: Translate,
  problems: readonly FieldProblem[],
  drawn: readonly string[],
  manifest: Manifest | null
): string[] {
  const said = problems
    .filter((problem) => !drawn.includes(problem.field))
    .map((problem) => {
      const label = manifest?.fields.find(
        (field) => field.key === problem.field
      )?.label;
      const text = problemText(t, problem);

      return label ? t("config.problem.named", { label, text }) : text;
    });

  return [...new Set(said)];
}

const FORMATS = [
  "domain",
  "email",
  "hostname",
  "identifier",
  "path",
  "port",
  "size",
  "timezone",
  "url",
] as const;

type Format = (typeof FORMATS)[number];

function formatText(t: Translate, expected: string): string {
  return (FORMATS as readonly string[]).includes(expected)
    ? t(`config.problem.format.${expected as Format}`)
    : t("config.problem.pattern");
}
