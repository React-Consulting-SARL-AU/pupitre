import { handleApiRequest } from "@pupitre/api/server"
import serverEntry from "@tanstack/react-start/server-entry"

export const API_PREFIX = "/api/v1"

export default {
  fetch(request: Request) {
    if (new URL(request.url).pathname.startsWith(API_PREFIX)) {
      return handleApiRequest(request)
    }

    return serverEntry.fetch(request)
  },
} satisfies ExportedHandler<CloudflareEnv>
