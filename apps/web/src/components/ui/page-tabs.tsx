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
        className="flex h-10 gap-5 overflow-x-auto overflow-y-hidden border-line border-b"
      >
        {tabs.map((tab) => (
          <Tabs.Tab
            className={cn(
              "relative h-10 shrink-0 whitespace-nowrap border-transparent border-b-2 px-0.5 font-medium text-[13px] transition-fast",
              "focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
              "text-ink-3 hover:text-ink",
              "data-[active]:border-ink data-[active]:text-ink"
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
