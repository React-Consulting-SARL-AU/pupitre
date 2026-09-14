import type { ReactNode } from "react";

const FRAME = "elevation-raised rounded-md border border-line bg-surface";

const INSET = {
  none: "",
  sm: "px-3.5 py-3",
  md: "px-4 py-4",
  lg: "p-5",
};

/** The same frame on an element the component cannot be: a form, a button. */
export function panelClass(inset: keyof typeof INSET = "md"): string {
  return `${FRAME} ${INSET[inset]}`;
}

/**
 * The one card of the system: a surface posed on the page by a soft shadow.
 *
 * Every framed block reads the same way — a list of rows, a form, a set of
 * facts — so the reader tells a section's content from its caption and never
 * from the shape of its frame. `list` frames rows that draw their own
 * separators and take no inset; `lg` is the inset of a form, whose fields
 * need more air than a line of facts.
 */
export function Panel({
  children,
  inset = "md",
  list = false,
  as: Tag = "div",
  className = "",
  ...rest
}: {
  children: ReactNode;
  inset?: keyof typeof INSET;
  list?: boolean;
  as?: "div" | "ul" | "ol" | "section" | "article";
  className?: string;
} & Record<`data-${string}`, string | number | undefined> & {
    "aria-label"?: string;
    "aria-busy"?: boolean;
    role?: string;
    id?: string;
  }) {
  const shape = list ? "divide-y divide-line overflow-hidden" : INSET[inset];

  return (
    <Tag className={`${FRAME} ${shape} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
