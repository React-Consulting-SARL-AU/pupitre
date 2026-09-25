import type { FieldHint } from "@pupitre/shared/catalog";
import type { ReactNode } from "react";
import { Hint } from "./hint";
import { Label } from "./label";

const SHARED =
  "w-full rounded-md border bg-sunken px-3.5 py-2 text-control text-ink outline-none transition-soft placeholder:text-ink-4 disabled:text-ink-4";

// The two borders are the same property: only one of them may be on the control, or the stylesheet's order decides.
const soundClass = "border-line-strong focus:border-ink";

/** The bordered look a field takes once it is refused, in both themes. */
const wrongClass = "border-danger focus:border-danger";

/** The shared look of every text input, select and textarea that holds data. */
export const fieldControlClass = `${SHARED} ${soundClass} font-data`;

/** The same field, for the few that hold a sentence rather than a value: a name, an identity. */
export const proseControlClass = `${SHARED} ${soundClass}`;

/** A name and a sentence are prose; everything else a manifest asks for is data. */
export type FieldText = "data" | "prose";

export function controlClass(kind: FieldText, wrong: boolean): string {
  const border = wrong ? wrongClass : soundClass;

  return kind === "prose"
    ? `${SHARED} ${border}`
    : `${SHARED} ${border} font-data`;
}

/**
 * One question, and everything the reader needs to answer it.
 *
 * The caption, the short help and the refusal are read without a gesture,
 * because they decide what to type. The bubble carries the rest. The three are
 * wired to the control by `aria-describedby`, so a reader who never sees the
 * layout hears them in the same order. A required field is marked by an
 * asterisk the form explains once (`RequiredLegend`); the control itself says
 * it through `aria-required`.
 */
export function Field({
  label,
  help,
  hint,
  problem,
  required = false,
  name,
  children,
}: {
  label: string;
  help?: string;
  hint?: FieldHint;
  /** Why the value is refused, in the words of whoever refused it. */
  problem?: string;
  required?: boolean;
  /** Ties the caption, the help and the refusal to the control that carries them. */
  name?: string;
  children: ReactNode;
}) {
  const helpId = help && name ? `${name}-help` : undefined;
  const problemId = problem && name ? `${name}-problem` : undefined;

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-wrong={problem ? "true" : undefined}
    >
      <div className="flex items-center gap-1.5">
        <label className="flex min-w-0 items-center gap-1.5" htmlFor={name}>
          <Label>{label}</Label>
          {required ? (
            <span aria-hidden="true" className="text-caption text-ink-3">
              *
            </span>
          ) : null}
        </label>

        {hint ? <Hint hint={hint} label={label} /> : null}
      </div>

      {children}

      {help ? (
        <span className="text-ink-3 text-small leading-relaxed" id={helpId}>
          {help}
        </span>
      ) : null}

      {problem ? (
        <span className="text-danger text-small leading-relaxed" id={problemId}>
          {problem}
        </span>
      ) : null}
    </div>
  );
}

/** What the asterisk of a required field means, said once under the form that carries one. */
export function RequiredLegend({ children }: { children: string }) {
  return (
    <p aria-hidden="true" className="text-ink-3 text-small">
      <span className="mr-1.5">*</span>
      {children}
    </p>
  );
}

/** The attributes a control needs so a reader who cannot see the field still hears all of it. */
export function fieldAria({
  name,
  required,
  help,
  problem,
}: {
  name: string;
  required?: boolean;
  help?: boolean;
  problem?: boolean;
}) {
  const described = [
    help ? `${name}-help` : "",
    problem ? `${name}-problem` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    "aria-describedby": described === "" ? undefined : described,
    "aria-invalid": problem ? true : undefined,
    "aria-required": required ? true : undefined,
    id: name,
  };
}
