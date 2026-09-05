import { afterEach, describe, expect, it } from "bun:test"
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { ConsoleFooter } from "@/components/ui/console-footer"
import { LocaleProvider } from "@/hooks/use-locale"
import { queryKeys } from "@/lib/api/queries"
import { createQueryClient } from "@/lib/query/client"
import { type ApiRecorder, recordApiCalls } from "@/testing/api-recorder"
import { render, trigger, waitUntil } from "@/testing/render"

const SIGNED_IN = {
  user: {
    id: "u1",
    email: "ada@test.local",
    name: "Ada",
    image: null,
    locale: "fr" as const,
  },
  organizations: [],
  active_organization: null,
  role: null,
  entitlement: "valid",
}

const mounted: (() => void)[] = []
const recorders: ApiRecorder[] = []

function footer(client: QueryClient): ReactElement {
  return (
    <LocaleProvider initial="fr">
      <QueryClientProvider client={client}>
        <ConsoleFooter />
      </QueryClientProvider>
    </LocaleProvider>
  )
}

const SAVE_TIMEOUT_MS = 2000

function prepare() {
  const recorder = recordApiCalls()

  recorders.push(recorder)

  return { recorder, client: createQueryClient() }
}

async function switchToEnglish(client: QueryClient) {
  const { container, unmount, click } = await render(footer(client))

  mounted.push(unmount)

  await click(trigger(container, "FR"))

  const english = [...document.querySelectorAll("[role=menuitemradio]")].find(
    (item) => item.textContent === "English"
  )

  if (!english) {
    throw new Error("the English entry is missing from the footer")
  }

  await click(english)
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }

  for (const recorder of recorders.splice(0)) {
    recorder.restore()
  }

  document.documentElement.lang = ""
})

describe("ConsoleFooter", () => {
  it("met la langue du compte à jour quand le lecteur est connecté", async () => {
    const { recorder, client } = prepare()

    client.setQueryData(queryKeys.me, SIGNED_IN)

    await switchToEnglish(client)
    await waitUntil(() => recorder.calls.length > 0, SAVE_TIMEOUT_MS)

    expect(recorder.calls).toEqual(["PATCH /api/v1/me"])
    expect(document.documentElement.lang).toBe("en")
  })

  it("n'appelle aucune route quand personne n'est connecté", async () => {
    const { recorder, client } = prepare()

    await switchToEnglish(client)

    expect(recorder.calls).toEqual([])
    expect(document.documentElement.lang).toBe("en")
  })
})
