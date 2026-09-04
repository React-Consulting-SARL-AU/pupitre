import { createFileRoute } from "@tanstack/react-router"

async function handleApiRequest(request: Request): Promise<Response> {
  const { handleApiRequest: handleSharedApiRequest } = await import(
    "@pupitre/api/server"
  )

  return handleSharedApiRequest(request)
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      DELETE: ({ request }) => handleApiRequest(request),
      GET: ({ request }) => handleApiRequest(request),
      PATCH: ({ request }) => handleApiRequest(request),
      POST: ({ request }) => handleApiRequest(request),
      PUT: ({ request }) => handleApiRequest(request),
    },
  },
})
