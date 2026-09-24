import { describe, expect, it } from "bun:test"
import { adminServerColumns } from "@/components/admin/admin-server-columns"
import { adminSubscriptionColumns } from "@/components/admin/admin-subscription-columns"
import { translator } from "@/lib/i18n/i18n"

const fr = translator("fr")

function column(
  columns: { key: string; sortable?: boolean; hideBelow?: string }[],
  key: string
) {
  const found = columns.find((candidate) => candidate.key === key)

  if (!found) {
    throw new Error(`no column ${key}`)
  }

  return found
}

describe("adminServerColumns", () => {
  const columns = adminServerColumns(fr)

  it("sorts on the enrolment date, out of sight on a narrow screen", () => {
    expect(column(columns, "created_at")).toMatchObject({
      header: "Rattaché",
      sortable: true,
      hideBelow: "lg",
    })
  })

  it("keeps the sortable columns the list route accepts", () => {
    expect(columns.filter((one) => one.sortable).map((one) => one.key)).toEqual(
      ["name", "last_heartbeat_at", "created_at"]
    )
  })
})

describe("adminSubscriptionColumns", () => {
  const columns = adminSubscriptionColumns(fr)

  it("sorts on the creation and on the last change, out of sight on a narrow screen", () => {
    expect(column(columns, "created_at")).toMatchObject({
      header: "Créé",
      sortable: true,
      hideBelow: "lg",
    })
    expect(column(columns, "updated_at")).toMatchObject({
      header: "Modifié",
      sortable: true,
      hideBelow: "lg",
    })
  })

  it("keeps the sortable columns the list route accepts", () => {
    expect(columns.filter((one) => one.sortable).map((one) => one.key)).toEqual(
      ["current_period_end", "created_at", "updated_at"]
    )
  })
})
