import { Tabs } from "@base-ui-components/react/tabs"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

export interface PageTab {
  value: string
  label: string
  /** What the tab holds; rendered only once the tab is the current one. */
  panel: ReactNode
}

export interface PageTabsProps {
  /** What the row of tabs names, for the screen reader. */
  label: string
  tabs: PageTab[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/** The current tab lives in the address, so a reload and a shared link land on it. */
export function PageTabs({
  label,
  tabs,
  value,
  onValueChange,
  className,
}: PageTabsProps) {
  return (
    <Tabs.Root
      className={cn("flex flex-col gap-gutter", className)}
      onValueChange={(next) => {
        onValueChange(String(next))
      }}
      value={value}
    >
      <Tabs.List
        aria-label={label}
        className="-mx-1 flex gap-1 overflow-x-auto px-1"
      >
        {tabs.map((tab) => (
          <Tabs.Tab
            className={cn(
              "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 font-medium text-[13px] transition-fast",
              "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
              "text-ink-2 hover:bg-raised hover:text-ink",
              "data-[selected]:bg-inverse data-[selected]:text-inverse-ink"
            )}
            key={tab.value}
            value={tab.value}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {tabs.map((tab) => (
        <Tabs.Panel className="outline-none" key={tab.value} value={tab.value}>
          {tab.value === value ? tab.panel : null}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  )
}
