import { afterEach, describe, expect, it } from "bun:test"
import { useState } from "react"
import {
  AsyncDataTable,
  type AsyncDataTableProps,
  type DataColumn,
} from "@/components/ui/async-data-table"
import {
  fill,
  render,
  trigger,
  waitUntil,
  withDashboard,
} from "@/testing/render"

interface Row {
  id: string
  name: string
  seats: number
}

const ROWS: Row[] = [
  { id: "r1", name: "Atelier", seats: 3 },
  { id: "r2", name: "Bureau", seats: 8 },
]

const COLUMNS: DataColumn<Row>[] = [
  { key: "name", header: "Name", cell: (row) => row.name },
  {
    key: "seats",
    header: "Seats",
    align: "end",
    sortable: true,
    cell: (row) => row.seats,
  },
]

const mounted: (() => void)[] = []

function table(overrides: Partial<AsyncDataTableProps<Row>> = {}) {
  const props: AsyncDataTableProps<Row> = {
    title: "Organisations",
    columns: COLUMNS,
    data: ROWS,
    total: ROWS.length,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: () => undefined,
    rowKey: (row) => row.id,
    offset: 0,
    limit: 50,
    onOffsetChange: () => undefined,
    emptyTitle: "Nothing here",
    ...overrides,
  }

  return withDashboard(<AsyncDataTable {...props} />)
}

async function mount(element: ReturnType<typeof table>) {
  const rendered = await render(element)

  mounted.push(rendered.unmount)

  return rendered
}

describe("AsyncDataTable", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("waits, refuses with a retry, and says when nothing matches", async () => {
    const waiting = await mount(table({ isPending: true }))

    expect(waiting.container.querySelector("[aria-busy=true]")).not.toBeNull()
    expect(waiting.container.querySelector("table")).toBeNull()

    let retried = 0
    const refused = await mount(
      table({
        isError: true,
        refetch: () => {
          retried += 1
        },
      })
    )

    await refused.click(trigger(refused.container, "Try again"))

    expect(retried).toBe(1)

    const empty = await mount(table({ data: [], total: 0 }))

    expect(empty.container.textContent).toContain("Nothing here")
  })

  it("lists the rows and counts them", async () => {
    const { container } = await mount(table())

    expect(container.querySelectorAll("tbody tr")).toHaveLength(2)
    expect(container.textContent).toContain("Atelier")
    expect(container.textContent).toContain("1–2 of 2")
  })

  it("makes the first cell a link to the row", async () => {
    const { container } = await mount(
      table({
        rowLink: (row) => ({
          to: "/dashboard/admin/organizations/$id",
          params: { id: row.id },
        }),
      })
    )
    const link = container.querySelector("tbody a")

    expect(link?.getAttribute("href")).toBe("/dashboard/admin/organizations/r1")
  })

  it("leaves a plain cell under the row's link and lifts the cell that carries its own control", async () => {
    const { container } = await mount(
      table({
        columns: [
          ...COLUMNS,
          {
            key: "partner",
            header: "Partner",
            interactive: true,
            cell: () => <button type="button">Copy</button>,
          },
        ],
        rowLink: (row) => ({
          to: "/dashboard/admin/organizations/$id",
          params: { id: row.id },
        }),
        rowActions: () => [],
      })
    )
    const cells = [...container.querySelectorAll("tbody tr:first-child td")]
    const lifted = cells.map((cell) => cell.className.includes("relative"))

    expect(lifted).toEqual([false, false, true, true])
  })

  it("turns a sortable header round and says so to the screen reader", async () => {
    const changes: [string, string][] = []
    const { container, click } = await mount(
      table({
        sort: {
          key: "seats",
          direction: "desc",
          onChange: (key, direction) => {
            changes.push([key, direction])
          },
        },
      })
    )
    const header = [...container.querySelectorAll("th")].find(
      (cell) => cell.textContent?.includes("Seats") === true
    )

    expect(header?.getAttribute("aria-sort")).toBe("descending")

    await click(trigger(container, "Seats"))

    expect(changes).toEqual([["seats", "asc"]])
  })

  it("lets the search settle before it leaves", async () => {
    const left: string[] = []

    function Searching() {
      const [value, setValue] = useState("")

      return (
        <AsyncDataTable
          columns={COLUMNS}
          data={ROWS}
          emptyTitle="Nothing here"
          isError={false}
          isFetching={false}
          isPending={false}
          limit={50}
          offset={0}
          onOffsetChange={() => undefined}
          refetch={() => undefined}
          rowKey={(row) => row.id}
          search={{
            id: "table-search",
            value,
            placeholder: "Name",
            onChange: (next) => {
              left.push(next)
              setValue(next)
            },
          }}
          title="Organisations"
          total={ROWS.length}
        />
      )
    }

    const { container } = await mount(withDashboard(<Searching />))
    const field = container.querySelector("#table-search")

    if (!field) {
      throw new Error("no search field")
    }

    await fill(field, "a")
    await fill(field, "at")
    await fill(field, "ate")

    expect(left).toEqual([])

    await waitUntil(() => left.length > 0)

    expect(left).toEqual(["ate"])
  })

  it("ticks a row, ticks the page, and hands the selection to the bulk actions", async () => {
    let handed: string[] = []
    const { container, click } = await mount(
      table({
        selectable: {
          bulkActions: (ids) => {
            handed = ids

            return <button type="button">Suspend {ids.length}</button>
          },
        },
      })
    )
    const boxes = [...container.querySelectorAll("tbody [role=checkbox]")]

    await click(boxes[0])

    expect(handed).toEqual(["r1"])
    expect(container.textContent).toContain("1 line selected")

    const page = container.querySelector("thead [role=checkbox]")

    if (!page) {
      throw new Error("no page checkbox")
    }

    await click(page)

    expect(handed).toEqual(["r1", "r2"])
  })
})
