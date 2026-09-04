export interface ApiTestServer {
  fetch: typeof fetch
  stop: () => Promise<void>
}

export function bootApiTestServer(): Promise<ApiTestServer> {
  return Promise.reject(
    new Error(
      "bootApiTestServer is not implemented yet: the PGlite harness arrives with PLT-03"
    )
  )
}
