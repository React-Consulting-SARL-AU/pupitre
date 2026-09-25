import { Tabs } from "@base-ui-components/react/tabs";
import type { ReactNode } from "react";
import { Tooltip } from "./tooltip";

// No overflow rule on the row: the active tab's -mb-px over the border would grow a scrollbar.
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

export function TabBar<T extends string>({
  label,
  value,
  onChange,
  orientation = "horizontal",
  children,
}: {
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
