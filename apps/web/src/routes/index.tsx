import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: IndexPage,
})

function IndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="font-bold font-display text-3xl tracking-tight">
        Pupitre
      </h1>
    </main>
  )
}
