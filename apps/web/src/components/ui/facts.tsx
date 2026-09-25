import type { ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

export interface Fact {
  label: string
  value: ReactNode
}

export interface FactsProps {
  facts: Fact[]
  className?: string
}

/** What a thing is, read as a grid of named values. */
export function Facts({ facts, className }: FactsProps) {
  return (
    <dl className={cn("grid gap-gutter px-4 py-3 sm:grid-cols-3", className)}>
      {facts.map((fact) => (
        <div className="min-w-0" key={fact.label}>
          <dt className="text-label">{fact.label}</dt>
          <dd className="text-[13px] text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
