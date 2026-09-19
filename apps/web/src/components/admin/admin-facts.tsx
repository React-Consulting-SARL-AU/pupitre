import type { ReactNode } from "react"

export interface AdminFact {
  label: string
  value: ReactNode
}

export interface AdminFactsProps {
  facts: AdminFact[]
}

/** The head of a platform page: what the row is, read as a grid of named values. */
export function AdminFacts({ facts }: AdminFactsProps) {
  return (
    <dl className="grid gap-gutter px-4 py-3 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            {fact.label}
          </dt>
          <dd className="text-[13px] text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
