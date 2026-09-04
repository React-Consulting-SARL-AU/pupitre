import type { ReactNode } from "react";
import { Label } from "./label";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <h1 className="font-semibold text-ink text-xl tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-ink-3 leading-relaxed">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
