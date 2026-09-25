import { Link, type LinkProps } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, type LucideIcon, RotateCw } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import {
  type RowAction,
  RowActionsMenu,
} from "@/components/ui/row-actions-menu"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import type { SortDirection } from "@/lib/domain/list-search"
import { cn } from "@/lib/utils/cn"

export type ColumnAlign = "start" | "end"

export type ColumnBreakpoint = "sm" | "md" | "lg"

export interface DataColumn<Row> {
  key: string
  header: string
  cell: (row: Row) => ReactNode
  width?: string
  align?: ColumnAlign
  sortable?: boolean
  hideBelow?: ColumnBreakpoint
  // The cell holds its own control, which must stay above the row's covering link.
  interactive?: boolean
}

export interface DataTableSearch {
  id: string
  value: string
  placeholder: string
  label?: string
  onChange: (value: string) => void
}

export interface DataTableSort {
  key: string
  direction: SortDirection
  onChange: (key: string, direction: SortDirection) => void
}

export interface DataTableSelection {
  bulkActions: (ids: string[]) => ReactNode
}

export interface AsyncDataTableProps<Row> {
  title: string
  columns: DataColumn<Row>[]
  data: Row[]
  total: number
  isPending: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
  rowKey: (row: Row) => string
  rowLink?: (row: Row) => LinkProps
  // Accessible name of the row link: the first cell shows more than the name.
  rowLabel?: (row: Row) => string
  rowActions?: (row: Row) => RowAction[]
  search?: DataTableSearch
  filters?: ReactNode
  sort?: DataTableSort
  offset: number
  limit: number
  onOffsetChange: (offset: number) => void
  emptyTitle: string
  emptyIcon?: LucideIcon
  selectable?: DataTableSelection
  errorTitle?: string
  errorFix?: string
}

const SEARCH_DEBOUNCE_MS = 300

const HIDDEN_BELOW: Record<ColumnBreakpoint, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
}

const ARIA_SORT: Record<SortDirection, "ascending" | "descending"> = {
  asc: "ascending",
  desc: "descending",
}

function nextDirection(direction: SortDirection): SortDirection {
  return direction === "asc" ? "desc" : "asc"
}

function TableSearch({
  id,
  value,
  placeholder,
  label,
  onChange,
}: DataTableSearch) {
  const t = useTranslations()
  const [typed, setTyped] = useState(value)

  useEffect(() => {
    setTyped(value)
  }, [value])

  useEffect(() => {
    if (typed === value) {
      return
    }

    const timer = setTimeout(() => {
      onChange(typed)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [typed, value, onChange])

  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-2 sm:max-w-[360px]">
      <Label htmlFor={id}>{label ?? t("table.search")}</Label>
      <Input
        autoComplete="off"
        id={id}
        onChange={(event) => {
          setTyped(event.target.value)
        }}
        placeholder={placeholder}
        type="search"
        value={typed}
      />
    </div>
  )
}

export function AsyncDataTable<Row>({
  title,
  columns,
  data,
  total,
  isPending,
  isError,
  isFetching,
  refetch,
  rowKey,
  rowLink,
  rowLabel,
  rowActions,
  search,
  filters,
  sort,
  offset,
  limit,
  onOffsetChange,
  emptyTitle,
  emptyIcon,
  selectable,
  errorTitle,
  errorFix,
}: AsyncDataTableProps<Row>) {
  const t = useTranslations()
  const [selected, setSelected] = useState<string[]>([])
  const pageKeys = useMemo(() => data.map(rowKey), [data, rowKey])

  useEffect(() => {
    setSelected((current) => {
      const kept = current.filter((id) => pageKeys.includes(id))

      return kept.length === current.length ? current : kept
    })
  }, [pageKeys])

  if (isPending) {
    return <SkeletonRows label={t("table.reading")} />
  }

  if (isError) {
    return (
      <Callout
        action={
          <Button
            icon={RotateCw}
            loading={isFetching}
            onClick={refetch}
            size="sm"
          >
            {t("common.retry")}
          </Button>
        }
        fix={errorFix ?? t("common.retryLater")}
        title={errorTitle ?? t("table.failed")}
        tone="danger"
      />
    )
  }

  const allOnPage = pageKeys.length > 0 && selected.length === pageKeys.length
  const someOnPage = selected.length > 0 && !allOnPage

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((entry) => entry !== id)
    )
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? pageKeys : [])
  }

  const bar =
    selectable && selected.length > 0 ? (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-ink-2">
          {t.plural("table.selected", selected.length)}
        </span>
        {selectable.bulkActions(selected)}
        <Button
          onClick={() => {
            setSelected([])
          }}
          size="sm"
          variant="ghost"
        >
          {t("table.clearSelection")}
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap items-end gap-gutter">
        {search ? <TableSearch {...search} /> : null}
        {filters}
      </div>
    )

  return (
    <div className="flex flex-col gap-gutter">
      {search || filters || selectable ? bar : null}

      {total === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {t("table.range", {
                from: offset + 1,
                to: offset + data.length,
                total,
              })}
            </span>
          </CardHeader>

          <div className="overflow-x-auto">
            <table
              aria-busy={isFetching || undefined}
              className="w-full border-collapse text-left"
            >
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-line border-b">
                  {selectable ? (
                    <th className="w-10 px-4 py-2" scope="col">
                      <Checkbox
                        checked={allOnPage}
                        indeterminate={someOnPage}
                        label={t("table.selectPage")}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                  ) : null}

                  {columns.map((column) => {
                    const sorted = sort?.key === column.key

                    return (
                      <th
                        aria-sort={
                          sorted ? ARIA_SORT[sort.direction] : undefined
                        }
                        className={cn(
                          "px-4 py-2 font-medium text-label",
                          column.align === "end" && "text-right",
                          column.hideBelow && HIDDEN_BELOW[column.hideBelow],
                          column.width
                        )}
                        key={column.key}
                        scope="col"
                      >
                        {column.sortable && sort ? (
                          <button
                            className={cn(
                              "inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-fast hover:text-ink",
                              "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                            )}
                            onClick={() => {
                              sort.onChange(
                                column.key,
                                sorted ? nextDirection(sort.direction) : "desc"
                              )
                            }}
                            type="button"
                          >
                            {column.header}
                            {sorted && sort.direction === "asc" ? (
                              <ArrowUp className="size-3" strokeWidth={1.5} />
                            ) : null}
                            {sorted && sort.direction === "desc" ? (
                              <ArrowDown className="size-3" strokeWidth={1.5} />
                            ) : null}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    )
                  })}

                  {rowActions ? (
                    <th className="w-12 px-4 py-2" scope="col">
                      <span className="sr-only">{t("table.actions")}</span>
                    </th>
                  ) : null}
                </tr>
              </thead>

              <tbody>
                {data.map((row) => {
                  const id = rowKey(row)
                  const link = rowLink?.(row)
                  const actions = rowActions?.(row) ?? []

                  return (
                    <tr
                      className="relative border-line border-b last:border-b-0 hover:bg-raised"
                      key={id}
                    >
                      {selectable ? (
                        <td className="relative px-4 py-3 align-middle">
                          <Checkbox
                            checked={selected.includes(id)}
                            label={t("table.selectRow")}
                            onCheckedChange={(checked) => {
                              toggleRow(id, checked)
                            }}
                          />
                        </td>
                      ) : null}

                      {columns.map((column, index) => (
                        <td
                          className={cn(
                            "px-4 py-3 align-middle text-[13px] text-ink-2",
                            column.align === "end" && "text-right tabular-nums",
                            column.hideBelow && HIDDEN_BELOW[column.hideBelow],
                            column.interactive && "relative"
                          )}
                          key={column.key}
                        >
                          {index === 0 && link ? (
                            <Link
                              {...link}
                              aria-label={rowLabel?.(row)}
                              className="font-medium text-ink underline-offset-2 after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                            >
                              {column.cell(row)}
                            </Link>
                          ) : (
                            column.cell(row)
                          )}
                        </td>
                      ))}

                      {rowActions ? (
                        <td className="relative px-4 py-3 text-right align-middle">
                          <RowActionsMenu
                            actions={actions}
                            label={
                              rowLabel
                                ? t("table.rowActionsOn", {
                                    name: rowLabel(row),
                                  })
                                : t("table.rowActions")
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Pagination
        nextLabel={t("table.next")}
        offset={offset}
        onOffsetChange={onOffsetChange}
        pageSize={limit}
        previousLabel={t("table.previous")}
        total={total}
      />
    </div>
  )
}
