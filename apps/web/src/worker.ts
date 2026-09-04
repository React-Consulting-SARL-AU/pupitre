import serverEntry from "@tanstack/react-start/server-entry"

export default {
  fetch(request: Request) {
    return serverEntry.fetch(request)
  },
} satisfies ExportedHandler<CloudflareEnv>
