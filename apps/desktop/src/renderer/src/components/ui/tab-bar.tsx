import { Tabs } from "@base-ui-components/react/tabs";
import type { ReactNode } from "react";
import { Tooltip } from "./tooltip";

const LIST = {
  horizontal: "flex gap-0.5 border-line border-b",
  vertical: "flex w-52 shrink-0 flex-col gap-0.5",
};

const TAB =
  "clickable flex shrink-0 items-center gap-2 whitespace-nowrap text-control text-ink-3 transition-soft hover:text-ink data-[active]:font-medium data-[active]:text-ink";

const SHAPE = {
  horizontal:
    "-mb-px border-b-2 border-transparent px-3 py-2.5 data-[active]:border-ink",
  vertical:
    "rounded-sm px-3 py-2 text-left hover:bg-raised data-[active]:bg-raised",
};

/**
 * One row of tabs, whatever the language — or one column, when the page is
 * a list of panes rather than a page with faces.
 *
 * The bar holds the choice and the arrow keys; each `Tab` names one face of
 * the page. No overflow rule on the row: the pixel the active tab pulls over
 * the border would grow a scrollbar out of it, and a bar on two lines reads
 * as two bars.
 */
export function TabBar<T extends string>({
  label,
  value,
  onChange,
  orientation = "horizontal",
  children,
}: {
  /** What the row switches between, for whoever hears it rather than reads it. */
  label: string;
  value: T;
  onChange: (next: T) => void;
  orientation?: keyof typeof LIST;
  children: ReactNode;
}) {
  return (
    <Tabs.Root
      className="contents"
      onValueChange={(next) => onChange(next as T)}
      orientation={orientation}
      value={value}
    >
      <Tabs.List aria-label={label} className={LIST[orientation]}>
        {children}
      </Tabs.List>
    </Tabs.Root>
  );
}

export function Tab({
  value,
  orientation = "horizontal",
  hint,
  children,
}: {
  value: string;
  orientation?: keyof typeof SHAPE;
  /** What the bubble says over the tab: the shortcut that reaches it. */
  hint?: string;
  children: ReactNode;
}) {
  const tab = (
    <Tabs.Tab className={`${TAB} ${SHAPE[orientation]}`} value={value}>
      {children}
    </Tabs.Tab>
  );

  return hint ? <Tooltip label={hint}>{tab}</Tooltip> : tab;
}
