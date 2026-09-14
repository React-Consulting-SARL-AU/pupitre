import type { ReactNode, Ref } from "react";
import { Label } from "./label";

/**
 * One section of a page: a caption, the gestures that concern the whole
 * section on the caption's line, and the content under them.
 *
 * Every section of a page reads the same way, whatever it holds — a form, a
 * list, a journal — so the reader finds a section's actions where the last
 * section had them. A gesture that ends a form is not one of them: it stays
 * at the foot of the form, where the last field is read.
 */
export function Section({
  title,
  aside,
  actions,
  name,
  ref,
  className = "",
  children,
  ...rest
}: {
  title: string;
  /** What qualifies the caption on its line: a count, a state. */
  aside?: ReactNode;
  /** The gestures of the section, on the caption's line. */
  actions?: ReactNode;
  /** What this section is about, for whoever has to find it. */
  name?: string;
  /** The caption, when a remedy elsewhere on the page has to land the reader here. */
  ref?: Ref<HTMLHeadingElement>;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-3 ${className}`}
      data-section={name}
      {...rest}
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-3">
        <h2
          className="flex min-w-0 items-center gap-2 outline-none"
          ref={ref}
          tabIndex={ref ? -1 : undefined}
        >
          <Label>{title}</Label>
          {aside ? (
            <>
              <span aria-hidden="true" className="text-ink-4">
                ·
              </span>
              {aside}
            </>
          ) : null}
        </h2>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>

      {children}
    </section>
  );
}
