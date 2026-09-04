import { createFileRoute } from "@tanstack/react-router"

async function handleAuthRequest(request: Request): Promise<Response> {
  const { auth } = await import("@pupitre/auth/server")

  return auth.handler(request)
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      HEAD: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
})
