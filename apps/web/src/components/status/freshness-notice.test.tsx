import { afterEach, describe, expect, it } from "bun:test"
import { STATUS_STALE_AFTER_MS } from "@pupitre/shared/status"
import { FreshnessNotice } from "@/components/status/freshness-notice"
import { render } from "@/testing/render"

const NOW = new Date("2026-09-04T12:00:00.000Z")

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

async function mount(element: Parameters<typeof render>[0]) {
  const rendered = await render(element)

  mounted.push(rendered.unmount)

  return rendered
}

describe("FreshnessNotice", () => {
  it("stays silent when the observation is fresh", async () => {
    const { container } = await mount(
      <FreshnessNotice
        freshness="fresh"
        lastObservationAt={new Date(NOW.getTime() - 60_000).toISOString()}
        now={NOW}
      />
    )

    expect(
      container.querySelector("[data-testid='freshness-notice']")
    ).toBeNull()
  })

  it("says the figures are stale and since when", async () => {
    const { container } = await mount(
      <FreshnessNotice
        freshness="stale"
        lastObservationAt={new Date(
          NOW.getTime() - STATUS_STALE_AFTER_MS - 3_600_000
        ).toISOString()}
        now={NOW}
      />
    )
    const notice = container.querySelector("[data-testid='freshness-notice']")

    expect(notice).not.toBeNull()
    expect(notice?.getAttribute("data-freshness")).toBe("stale")
    expect(container.textContent).toContain("Last observation 1 h ago")
    expect(container.textContent).toContain("15 minutes")
    expect(
      container
        .querySelector("[data-testid='status-dot']")
        ?.getAttribute("data-shape")
    ).toBe("hollow")
  })

  it("admits the absence of an observation instead of reassuring", async () => {
    const { container } = await mount(
      <FreshnessNotice freshness="unknown" lastObservationAt={null} now={NOW} />
    )

    expect(container.textContent).toContain("No observation to show")
  })
})
