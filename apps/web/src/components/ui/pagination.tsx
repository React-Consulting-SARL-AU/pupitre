import { Button } from "@/components/ui/button"

export interface PaginationProps {
  offset: number
  pageSize: number
  total: number
  onOffsetChange: (offset: number) => void
  previousLabel: string
  nextLabel: string
}

/** Two steps, shown only once the list outgrows a page. */
export function Pagination({
  offset,
  pageSize,
  total,
  onOffsetChange,
  previousLabel,
  nextLabel,
}: PaginationProps) {
  if (total <= pageSize) {
    return null
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        disabled={offset === 0}
        onClick={() => {
          onOffsetChange(Math.max(0, offset - pageSize))
        }}
        size="sm"
      >
        {previousLabel}
      </Button>
      <Button
        disabled={offset + pageSize >= total}
        onClick={() => {
          onOffsetChange(offset + pageSize)
        }}
        size="sm"
      >
        {nextLabel}
      </Button>
    </div>
  )
}
