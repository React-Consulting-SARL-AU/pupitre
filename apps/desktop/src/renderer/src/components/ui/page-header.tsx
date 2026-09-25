import { type ReactNode, useEffect, useRef } from "react";
import { Label } from "./label";

export interface PageHeaderProps {
  leading?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Each new step focuses the title: the replaced panel took the focused button with it. */
  step?: string;
}

export function PageHeader({
  leading,
  eyebrow,
  title,
  meta,
  description,
  actions,
  step,
}: PageHeaderProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [step]);

  return (
    <header
      className="flex flex-wrap items-start justify-between gap-gutter"
      data-step-heading={step}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {leading ? <div className="shrink-0 pt-0.5">{leading}</div> : null}

        <div className="min-w-0">
          {eyebrow ? <Label>{eyebrow}</Label> : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="font-bold font-display text-2xl text-ink leading-tight tracking-tight outline-none"
              ref={heading}
              tabIndex={step ? -1 : undefined}
            >
              {title}
            </h1>
            {meta}
          </div>
          {description ? (
            <div className="mt-1.5 text-ink-3 leading-relaxed">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
