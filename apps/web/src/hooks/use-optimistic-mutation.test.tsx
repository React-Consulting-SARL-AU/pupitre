import { describe, expect, it } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ToastProvider } from "@/components/ui/toast"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import { render, trigger, waitUntil } from "@/testing/render"

interface Row {
  id: string
}

const LIST = ["rows"]
const OTHER = ["untouched"]

function client(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  queryClient.setQueryData(LIST, [{ id: "a" }, { id: "b" }] satisfies Row[])
  queryClient.setQueryData(OTHER, "left alone")

  return queryClient
}

const drop = patchQuery<Row[], string>(LIST, (rows, dropped) =>
  rows.filter((row) => row.id !== dropped)
)

interface HarnessProps {
  queryClient: QueryClient
  remove: (id: string) => Promise<void>
  onStart?: () => void
  onDone?: () => void
  said?: boolean
}

function Harness({ queryClient, ...rest }: HarnessProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Trigger {...rest} />
      </ToastProvider>
    </QueryClientProvider>
  )
}

function Trigger({
  remove,
  onStart,
  onDone,
  said = false,
}: Omit<HarnessProps, "queryClient">) {
  const mutation = useOptimisticMutation<string, void>({
    mutationFn: remove,
    patch: [drop],
    invalidate: [LIST],
    onStart,
    onDone,
    ...(said
      ? {
          toast: {
            done: (_data, id) => `${id} dropped`,
            failed: (id) => ({ title: `${id} stays`, fix: "Wait a bit." }),
          },
        }
      : {}),
  })

  return (
    <button
      onClick={() => {
        mutation.mutate("a")
      }}
      type="button"
    >
      drop
    </button>
  )
}

function rows(queryClient: QueryClient): Row[] {
  return queryClient.getQueryData<Row[]>(LIST) ?? []
}

function stack(): string {
  return document.querySelector("[data-testid=toasts]")?.textContent ?? ""
}

describe("an optimistic mutation", () => {
  it("removes the row before the server responds", async () => {
    const queryClient = client()
    let release = () => {
      // replaced by the promise the mutation awaits
    }
    const remove = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })

    const view = await render(
      <Harness queryClient={queryClient} remove={remove} />
    )

    await view.click(view.container.querySelector("button") as Element)
    await waitUntil(() => rows(queryClient).length === 1)

    expect(rows(queryClient)).toEqual([{ id: "b" }])

    release()
    view.unmount()
  })

  it("restores the list when the call fails", async () => {
    const queryClient = client()
    const remove = () => Promise.reject(new Error("nope"))

    const view = await render(
      <Harness queryClient={queryClient} remove={remove} />
    )

    await view.click(view.container.querySelector("button") as Element)
    await waitUntil(() => rows(queryClient).length === 2)

    expect(rows(queryClient)).toEqual([{ id: "a" }, { id: "b" }])

    view.unmount()
  })

  it("leaves alone the queries the action does not concern", async () => {
    const queryClient = client()
    const view = await render(
      <Harness queryClient={queryClient} remove={() => Promise.resolve()} />
    )

    await view.click(view.container.querySelector("button") as Element)
    await waitUntil(() => rows(queryClient).length === 1)

    expect(queryClient.getQueryData<string>(OTHER)).toBe("left alone")

    view.unmount()
  })

  it("leaves the page only once the server agrees", async () => {
    const queryClient = client()
    const left: string[] = []
    let release = () => {
      // replaced by the promise the mutation awaits
    }
    const remove = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })

    const view = await render(
      <Harness
        onDone={() => {
          left.push("list")
        }}
        queryClient={queryClient}
        remove={remove}
      />
    )

    await view.click(view.container.querySelector("button") as Element)
    await waitUntil(() => rows(queryClient).length === 1)

    expect(left).toEqual([])

    release()
    await waitUntil(() => left.length === 1)

    expect(left).toEqual(["list"])

    view.unmount()
  })

  it("takes the immediate step on click, before the response", async () => {
    const queryClient = client()
    const left: string[] = []
    let release = () => {
      // replaced by the promise the mutation awaits
    }
    const remove = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })

    const view = await render(
      <Harness
        onStart={() => {
          left.push("list")
        }}
        queryClient={queryClient}
        remove={remove}
      />
    )

    await view.click(view.container.querySelector("button") as Element)
    await waitUntil(() => left.length === 1)

    expect(rows(queryClient)).toEqual([{ id: "b" }])

    release()
    view.unmount()
  })

  it("says it is done once the server agrees", async () => {
    const queryClient = client()
    const view = await render(
      <Harness
        queryClient={queryClient}
        remove={() => Promise.resolve()}
        said
      />
    )

    await view.click(view.container.querySelector("button") as Element)
    await waitUntil(() => stack().includes("a dropped"))

    view.unmount()
  })

  it("states the failure, its remedy, and replays the action on request", async () => {
    const queryClient = client()
    const calls: string[] = []
    const remove = (id: string) => {
      calls.push(id)

      return calls.length === 1
        ? Promise.reject(new Error("nope"))
        : Promise.resolve()
    }

    const view = await render(
      <Harness queryClient={queryClient} remove={remove} said />
    )

    await view.click(view.container.querySelector("button") as Element)
    await waitUntil(() => stack().includes("a stays"))

    expect(stack()).toContain("Wait a bit.")
    expect(rows(queryClient)).toEqual([{ id: "a" }, { id: "b" }])

    await view.click(trigger(document.body, "Try again"))
    await waitUntil(() => stack().includes("a dropped"))

    expect(calls).toEqual(["a", "a"])
    expect(rows(queryClient)).toEqual([{ id: "b" }])

    view.unmount()
  })
})
