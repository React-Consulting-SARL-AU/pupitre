interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

/** The one thing the static layer cannot say: `www` is not a host, the apex is. */
export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url)

    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4)

      return Response.redirect(url.toString(), 301)
    }

    return env.ASSETS.fetch(request)
  },
}
