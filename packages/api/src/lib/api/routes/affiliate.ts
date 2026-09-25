import { Elysia, t } from "elysia"
import { recordAffiliateClick } from "../../affiliates/clicks"
import { siteOrigin } from "../cors"
import { errorResponse } from "../openapi-models"
import { rateLimit } from "../plugins/rate-limit"
import { AFFILIATE_HIT_RATE_LIMIT } from "../rate-limit"

/** Always 204, whatever the code, so a caller learns nothing about which links exist. */
export const affiliateRoutes = new Elysia({
  name: "affiliate-routes",
  tags: ["Affiliation"],
})
  .onBeforeHandle(({ request, set }) => {
    const origin = siteOrigin(request.headers.get("origin"))

    if (origin) {
      set.headers["access-control-allow-origin"] = origin
      set.headers.vary = "origin"
    }
  })
  .use(rateLimit("affiliate-hit", AFFILIATE_HIT_RATE_LIMIT))
  .post(
    "/affiliate/:code/hit",
    async ({ params, set }) => {
      await recordAffiliateClick(params.code)

      set.status = 204
    },
    {
      params: t.Object({ code: t.String() }),
      detail: {
        summary: "Compter une visite venue d'un lien d'affiliation",
        description:
          "Le lien activé qui porte ce code gagne une visite sur le jour courant, en temps universel. Rien d'autre n'est gardé : ni adresse, ni cookie, ni identifiant. La réponse est 204 même quand le code est inconnu, désactivé ou mal formé.",
      },
      response: {
        204: t.Void(),
        429: errorResponse,
      },
    }
  )
