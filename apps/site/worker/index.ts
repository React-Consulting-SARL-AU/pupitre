interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const NOT_FOUND_PAGE_RE = /^((?:\/[a-z]{2})?)\/404(?:\.html|\/)?$/

async function notFoundPage(
  request: Request,
  env: Env,
  prefix: string
): Promise<Response> {
  const page = await env.ASSETS.fetch(
    new Request(new URL(`${prefix}/404`, request.url), request)
  )

  return new Response(page.body, { status: 404, headers: page.headers })
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url)

    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4)

      return Response.redirect(url.toString(), 301)
    }

    const notFound = NOT_FOUND_PAGE_RE.exec(url.pathname)

    if (notFound) {
      return notFoundPage(request, env, notFound[1])
    }

    return env.ASSETS.fetch(request)
  },
}
