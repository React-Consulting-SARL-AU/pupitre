import { Collapsible } from "@base-ui-components/react/collapsible";
import { ChevronRight } from "lucide-react";
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
 *
 * A page that is read for one thing among several — a help page — folds its
 * sections: the captions then read as a table of contents, and the one the
 * reader came for opens under their click. What is folded stays in the
 * document, hidden, so a search or a test finds it where it is.
 */

interface SectionProps {
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
}

type DataProps = Record<`data-${string}`, string | undefined>;

function Caption({ title, aside }: Pick<SectionProps, "title" | "aside">) {
  return (
    <>
      <Label>{title}</Label>
      {aside ? (
        <>
          <span aria-hidden="true" className="text-ink-4">
            ·
          </span>
          {aside}
        </>
      ) : null}
    </>
  );
}

function Actions({ actions }: Pick<SectionProps, "actions">) {
  return actions ? (
    <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
  ) : null;
}

export function Section({
  title,
  aside,
  actions,
  name,
  ref,
  className = "",
  children,
  ...rest
}: SectionProps & DataProps) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-4 ${className}`}
      data-section={name}
      {...rest}
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-3">
        <h2
          className="flex min-w-0 items-center gap-2 outline-none"
          ref={ref}
          tabIndex={ref ? -1 : undefined}
        >
          <Caption aside={aside} title={title} />
        </h2>

        <Actions actions={actions} />
      </div>

      {children}
    </section>
  );
}

/** A section that folds under its caption; `open` says how it starts. */
export function FoldingSection({
  title,
  aside,
  actions,
  name,
  ref,
  className = "",
  open = false,
  children,
  ...rest
}: SectionProps & DataProps & { open?: boolean }) {
  return (
    <Collapsible.Root
      className={`group flex flex-col gap-4 ${className}`}
      data-section={name}
      defaultOpen={open}
      render={<section aria-label={title} />}
      {...rest}
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-3">
        <h2
          className="flex min-w-0 items-center outline-none"
          ref={ref}
          tabIndex={ref ? -1 : undefined}
        >
          <Collapsible.Trigger className="clickable -mx-1.5 inline-flex min-h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 transition-soft hover:bg-raised">
            <ChevronRight
              aria-hidden="true"
              className="shrink-0 text-ink-3 transition-soft group-data-[open]:rotate-90"
              size={13}
              strokeWidth={1.5}
            />
            <Caption aside={aside} title={title} />
          </Collapsible.Trigger>
        </h2>

        <Actions actions={actions} />
      </div>

      <Collapsible.Panel className="flex flex-col gap-4" keepMounted>
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
