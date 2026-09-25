import { Collapsible } from "@base-ui-components/react/collapsible";
import { ChevronRight } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Label } from "./label";

interface SectionProps {
  title: string;
  aside?: ReactNode;
  actions?: ReactNode;
  name?: string;
  /** Lets a remedy elsewhere on the page move the focus to this caption. */
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

// Folded content stays mounted, so a search or a test still finds it.
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
