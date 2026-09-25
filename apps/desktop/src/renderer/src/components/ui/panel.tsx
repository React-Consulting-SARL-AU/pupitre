import type { ReactNode } from "react";

const FRAME = "elevation-raised rounded-md border border-line bg-surface";

const INSET = {
  none: "",
  sm: "px-4 py-3.5",
  md: "p-5",
  lg: "p-6",
};

export function panelClass(inset: keyof typeof INSET = "md"): string {
  return `${FRAME} ${INSET[inset]}`;
}

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
  as?: "div" | "ul" | "ol" | "li" | "section" | "article";
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
