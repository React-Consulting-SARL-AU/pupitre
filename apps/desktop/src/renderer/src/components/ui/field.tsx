import type { FieldHint } from "@pupitre/shared/catalog";
import type { ReactNode } from "react";
import { Hint } from "./hint";
import { Label } from "./label";

const SHARED =
  "w-full rounded-md border bg-sunken px-3.5 py-2 text-control text-ink outline-none transition-soft placeholder:text-ink-4 disabled:text-ink-4";

// The two borders are the same property: only one of them may be on the control, or the stylesheet's order decides.
const soundClass = "border-line-strong focus:border-ink";

const wrongClass = "border-danger focus:border-danger";

export const fieldControlClass = `${SHARED} ${soundClass} font-data`;

export const proseControlClass = `${SHARED} ${soundClass}`;

export type FieldText = "data" | "prose";

export function controlClass(kind: FieldText, wrong: boolean): string {
  const border = wrong ? wrongClass : soundClass;

  return kind === "prose"
    ? `${SHARED} ${border}`
    : `${SHARED} ${border} font-data`;
}

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
  problem?: string;
  required?: boolean;
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

export function RequiredLegend({ children }: { children: string }) {
  return (
    <p aria-hidden="true" className="text-ink-3 text-small">
      <span className="mr-1.5">*</span>
      {children}
    </p>
  );
}

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
