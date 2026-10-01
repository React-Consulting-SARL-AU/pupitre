import { afterEach, describe, expect, it } from "bun:test"
import { AlertBanner } from "@/components/dashboard/alert-banner"
import { ServerAlerts } from "@/components/dashboard/server-alerts"
import { countAlerts } from "@/lib/domain/alerts"
import { render } from "@/testing/render"

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

describe("ServerAlerts", () => {
  it("carries each active alert with its shape and remedy", async () => {
    const { container } = await mount(
      <ServerAlerts
        alerts={[
          {
            kind: "server_unreachable",
            first_seen_at: new Date().toISOString(),
            notified_at: new Date().toISOString(),
          },
          {
            kind: "disk_high",
            first_seen_at: new Date().toISOString(),
            notified_at: null,
          },
        ]}
      />
    )
    const shapes = [
      ...container.querySelectorAll("[data-testid='status-dot']"),
    ].map((dot) => dot.getAttribute("data-shape"))

    expect(container.textContent).toContain("Unreachable for 30 minutes")
    expect(container.textContent).toContain("Disk above 90%")
    expect(container.textContent).toContain("systemctl status pupitred")
    expect(shapes).toEqual(["barred", "barred"])
  })

  it("says all is calm when there is nothing", async () => {
    const { container } = await mount(<ServerAlerts alerts={[]} />)

    expect(container.textContent).toContain("Nothing to report")
  })
})

describe("AlertBanner", () => {
  it("counts the list's alerts", async () => {
    const { container } = await mount(
      <AlertBanner
        count={countAlerts([
          { alerts: [{ kind: "disk_high" }, { kind: "agent_outdated" }] },
          { alerts: [] },
        ])}
      />
    )

    expect(container.textContent).toContain("2 active alerts on 1 server")
  })

  it("disappears when nothing is wrong", async () => {
    const { container } = await mount(
      <AlertBanner count={countAlerts([{ alerts: [] }])} />
    )

    expect(container.querySelector("[data-testid='alert-banner']")).toBeNull()
  })
})
