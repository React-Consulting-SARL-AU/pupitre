import { afterEach, describe, expect, it } from "bun:test"
import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import type { UseQueryResult } from "@tanstack/react-query"
import { AdminReleaseList } from "@/components/admin/admin-release-list"
import type { ReleaseBuild } from "@/lib/domain/admin"
import { ListSearchHarness } from "@/testing/list-search"
import { render, trigger, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

const EXTRA = 3

function builds(count: number): ReleaseBuild[] {
  return Array.from({ length: count }, (_, index) => ({
    version: `1.0.${index}`,
    channel: "stable",
    published_at: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000),
  }))
}

function settled(data: ReleaseBuild[]): UseQueryResult<ReleaseBuild[]> {
  return {
    data,
    isError: false,
    isFetching: false,
    isPending: false,
    refetch: () => undefined,
  } as unknown as UseQueryResult<ReleaseBuild[]>
}

function list(count: number) {
  return withDashboard(
    <ListSearchHarness<{ offset?: number }>>
      {({ search, setSearch }) => (
        <AdminReleaseList
          builds={settled(builds(count))}
          canPromote={false}
          offset={search.offset ?? 0}
          onOffsetChange={(offset) => {
            setSearch({ offset })
          }}
          onPromote={() => undefined}
          promoting={undefined}
          target="the agents"
          title="Agent versions"
        />
      )}
    </ListSearchHarness>
  )
}

describe("AdminReleaseList", () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("turns the page instead of hiding the versions past the first one", async () => {
    const total = ADMIN_PAGE_SIZE + EXTRA
    const { container, unmount, click } = await render(list(total))

    mounted.push(unmount)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(ADMIN_PAGE_SIZE)
    expect(container.textContent).toContain(`1–${ADMIN_PAGE_SIZE} of ${total}`)

    await click(trigger(container, "Next"))

    expect(container.querySelectorAll("tbody tr")).toHaveLength(EXTRA)
    expect(container.textContent).toContain(
      `${ADMIN_PAGE_SIZE + 1}–${total} of ${total}`
    )
    expect(container.textContent).toContain("1.0.0")
  })
})
