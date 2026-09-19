import { expect, type Locator, type Page, test } from "@playwright/test"
import {
  chooseBillingMode,
  harnessUrl,
  openTrial,
  promotePlatformMember,
  receiveEmail,
  seedAlert,
  seedMember,
  seedReferral,
  seedServer,
  signIn,
  stayLocal,
} from "./harness/session"

const OWNER_EMAIL = "owner@e2e.local"
const OWNER_ORGANIZATION = "owner"
const ADMIN_EMAIL = "support@e2e.local"
const ADMIN_ORGANIZATION = "support"
const GRANT_NOTE = "Partenaire du lancement"
const READER_EMAIL = "reader@e2e.local"
const LAUNCH_EMAIL = "launch@e2e.local"

const RUNNING_SERVER = "vps-admin-online"
const REVOKED_SERVER = "vps-admin-revoked"
const READER_SERVER = "vps-admin-reader"

const FLEET_EMAIL = "fleet@e2e.local"
const FLEET_ORGANIZATION = "fleet"
const FLEET_SERVER = "vps-fleet-online"
const TRIAL_EMAIL = "trial@e2e.local"
const TRIAL_ORGANIZATION = "trial"
const GRANT_END_DAY = "2027-06-30"
const PAST_DAY = "2020-01-01"

const SOCLE_EMAIL = "socle@e2e.local"
const SOCLE_SERVER = "vps-socle-online"
const SOCLE_SECOND_SERVER = "vps-socle-second"
const SOCLE_REVOKED_SERVER = "vps-socle-revoked"

const THREAD_SENDER = "ada@e2e.local"
const THREAD_SUBJECT = "L'agent refuse le serveur"
const THREAD_TEXT = "Mon serveur refuse l'agent."

const LINK_NAME = "Salon des makers"
const LINK_CODE = "makers-e2e"
const LINK_URL = `https://pupitre.studio/?ref=${LINK_CODE}`
const LINK_PARTNER = "Ada Lovelace"
const LINK_PARTNER_EMAIL = "ada@partenaire.test"
const LINK_NOTES = "Stand partagé au salon"
const SPARE_LINK_NAME = "Podcast du soir"
const SPARE_LINK_CODE = "podcast-e2e"

const LAUNCH_ENDS_AT = "2026-12-31T12:00:00.000Z"
const LAUNCH_DATE = "31 décembre 2026"

const SERVERS_URL_RE = /\/dashboard\/servers$/
const START_URL_RE = /\/dashboard\/start$/
const START_LINK_RE = /^Démarrer/
const ADMIN_URL_RE = /\/dashboard\/admin$/
const ADMIN_USERS_URL_RE = /\/dashboard\/admin\/users$/
const ADMIN_USER_URL_RE = /\/dashboard\/admin\/users\/[^/]+$/
const ADMIN_SERVERS_URL_RE = /\/dashboard\/admin\/servers$/
const ADMIN_SERVERS_REVOKED_URL_RE =
  /\/dashboard\/admin\/servers\?status=revoked$/
const ADMIN_SERVER_URL_RE = /\/dashboard\/admin\/servers\/[^/]+$/
const ADMIN_ORGANIZATIONS_URL_RE = /\/dashboard\/admin\/organizations$/
const ADMIN_ORGANIZATION_URL_RE = /\/dashboard\/admin\/organizations\/[^/]+$/
const ADMIN_SUBSCRIPTIONS_URL_RE = /\/dashboard\/admin\/subscriptions$/
const ADMIN_SUBSCRIPTION_URL_RE = /\/dashboard\/admin\/subscriptions\/[^/]+$/
const ADMIN_LINKS_URL_RE = /\/dashboard\/admin\/affiliate-links$/
const ADMIN_LINK_URL_RE = /\/dashboard\/admin\/affiliate-links\/[^/?]+/
const ADMIN_LINK_SETTINGS_URL_RE = /\/affiliate-links\/[^/?]+\?tab=settings$/
const ADMIN_INBOX_URL_RE = /\/dashboard\/admin\/inbox(\?|$)/
const ADMIN_THREAD_URL_RE = /\/dashboard\/admin\/inbox\/[^/?]+/
const START_RETURN_URL_RE = /\/dashboard\/start\?checkout=done$/

const ONLINE_SERVERS_RE = /en ligne/
const TRIALING_SUBSCRIPTIONS_RE = /essai/

const ROLE_REQUIRED =
  "Le rôle owner ou admin de l'organisation Pupitre est requis."

const CYCLE_ADMIN_EMAIL = "cycles@e2e.local"
const CYCLE_TARGET_EMAIL = "cible@e2e.local"
const CYCLE_SECOND_EMAIL = "second@e2e.local"
const CYCLE_ORGANIZATION = "cible"
const CYCLE_RENAMED = "Atelier repris"
const CYCLE_SERVER = "vps-cycle"
const DANGER_TAB_URL_RE = /tab=danger$/

const FORBIDDEN = 403

/** Where the owner looks at what the run saw; the suite writes beside its own artifacts otherwise. */
const SHOTS = process.env.PUPITRE_E2E_SHOTS ?? "../../.playwright/shots"

/**
 * A tab clicked right after a navigation can be lost while the page settles:
 * the step waits for the tab to be the selected one before acting on its panel.
 */
async function openTab(scope: Page | Locator, name: string): Promise<void> {
  const tab = scope.getByRole("tab", { name })

  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
}

/** The platform pages open on the platform organisation alone: the switcher takes the session there. */
async function openPlatformOrganization(page: Page): Promise<void> {
  await page.getByTitle("Organisations").first().click()
  await page.getByRole("menuitem", { name: "Pupitre" }).click()
  await expect(page.getByTitle("Organisations").first()).toContainText(
    "Pupitre"
  )
}

interface OverviewBody {
  data: { users: number; organizations: number }
}

test.describe("plateforme", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(harnessUrl("/reset"))
  })

  test("un compte sans rôle plateforme n'a ni le groupe ni les pages", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, OWNER_EMAIL)

    const menu = page.getByRole("navigation", { name: "Menu principal" })

    await test.step("la barre latérale ne porte pas le groupe Plateforme", async () => {
      await expect(menu.getByText("Plateforme")).toHaveCount(0)
      await expect(
        menu.getByRole("link", { name: "Vue d'ensemble" })
      ).toHaveCount(0)
    })

    await test.step("les adresses de la plateforme ramènent à la console", async () => {
      await openTrial(request, OWNER_EMAIL)

      for (const closed of [
        "/dashboard/admin",
        "/dashboard/admin/users",
        "/dashboard/admin/servers",
        "/dashboard/admin/affiliate-links",
      ]) {
        await page.goto(closed)
        await expect(page, closed).toHaveURL(SERVERS_URL_RE)
      }
    })

    await test.step("l'API refuse la lecture de la plateforme", async () => {
      const refused = await page.request.get("/api/v1/admin/overview")

      expect(refused.status()).toBe(FORBIDDEN)
    })
  })

  test("un administrateur plateforme lit les compteurs, les comptes, les serveurs et les liens", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, ADMIN_EMAIL)
    await promotePlatformMember(request, ADMIN_EMAIL)
    await page.goto("/dashboard/start")

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")
    const toasts = page.getByTestId("toasts")

    await test.step("la plateforme n'apparaît qu'une fois son organisation choisie", async () => {
      await expect(menu.getByText("Plateforme", { exact: true })).toHaveCount(0)

      await page.goto("/dashboard/admin")
      await expect(page).toHaveURL(START_URL_RE)

      await openPlatformOrganization(page)
    })

    await test.step("l'organisation Pupitre n'a ni démarrage ni facturation", async () => {
      await expect(menu.getByRole("link", { name: START_LINK_RE })).toHaveCount(
        0
      )
      await expect(menu.getByRole("link", { name: "Facturation" })).toHaveCount(
        0
      )

      await page.goto("/dashboard/start")
      await expect(page).toHaveURL(ADMIN_URL_RE)

      await page.goto("/dashboard/billing")
      await expect(page).toHaveURL(ADMIN_URL_RE)
    })

    await test.step("le groupe Plateforme porte les dix pages", async () => {
      await expect(menu.getByText("Plateforme", { exact: true })).toBeVisible()

      for (const label of [
        "Vue d'ensemble",
        "Boîte de réception",
        "Utilisateurs",
        "Organisations",
        "Tous les serveurs",
        "Abonnements",
        "Liens d'affiliation",
        "Journal de la plateforme",
        "Versions",
        "Équipe",
      ]) {
        await expect(menu.getByRole("link", { name: label })).toBeVisible()
      }
    })

    await test.step("la vue d'ensemble compte ce que la plateforme porte", async () => {
      await menu.getByRole("link", { name: "Vue d'ensemble" }).click()

      await expect(page).toHaveURL(ADMIN_URL_RE)

      const answered = await page.request.get("/api/v1/admin/overview")

      expect(answered.ok()).toBe(true)

      const { data } = (await answered.json()) as OverviewBody

      expect(data.users).toBeGreaterThanOrEqual(1)

      await expect(
        main.getByText("Utilisateurs", { exact: true })
      ).toBeVisible()
      await expect(
        main.getByText(String(data.users), { exact: true }).first()
      ).toBeVisible()
      await expect(
        main.getByText("Organisations", { exact: true })
      ).toBeVisible()
      await expect(main.getByText("Serveurs", { exact: true })).toBeVisible()
      await expect(main.getByText(ONLINE_SERVERS_RE)).toBeVisible()
      await expect(main.getByText("Abonnements", { exact: true })).toBeVisible()
      await expect(main.getByText(TRIALING_SUBSCRIPTIONS_RE)).toBeVisible()
      await expect(
        main.getByText("Liens d'affiliation", { exact: true })
      ).toBeVisible()
      await expect(main.getByText("Courrier non lu")).toBeVisible()
      await expect(main.getByText("Rien à traiter.").first()).toBeVisible()

      await page.screenshot({
        path: `${SHOTS}/admin-overview.png`,
        fullPage: true,
      })
    })

    await test.step("la liste des comptes se resserre sur une recherche", async () => {
      await menu.getByRole("link", { name: "Utilisateurs" }).click()

      await expect(page).toHaveURL(ADMIN_USERS_URL_RE)
      await expect(main.getByText(ADMIN_EMAIL)).toBeVisible()
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()

      await page.getByLabel("Recherche").fill(OWNER_EMAIL)

      await expect(main.getByText(ADMIN_EMAIL)).toHaveCount(0)
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()
      await expect(main.getByText("1–1 sur 1")).toBeVisible()
    })

    await test.step("le filtre de statut ne garde que les serveurs demandés", async () => {
      await seedServer(request, {
        email: OWNER_EMAIL,
        name: RUNNING_SERVER,
        status: "active",
      })
      await seedServer(request, {
        email: OWNER_EMAIL,
        name: REVOKED_SERVER,
        status: "revoked",
      })

      await menu.getByRole("link", { name: "Tous les serveurs" }).click()

      await expect(page).toHaveURL(ADMIN_SERVERS_URL_RE)
      await expect(
        main.getByText(RUNNING_SERVER, { exact: true })
      ).toBeVisible()
      await expect(
        main.getByText(REVOKED_SERVER, { exact: true })
      ).toBeVisible()

      await page.getByLabel("Statut").click()
      await page.getByRole("option", { name: "Révoqué" }).click()

      await expect(
        main.getByText(REVOKED_SERVER, { exact: true })
      ).toBeVisible()
      await expect(main.getByText(RUNNING_SERVER, { exact: true })).toHaveCount(
        0
      )

      await page.getByLabel("Statut").click()
      await page.getByRole("option", { name: "En ligne" }).click()

      await expect(
        main.getByText(RUNNING_SERVER, { exact: true })
      ).toBeVisible()
      await expect(main.getByText(REVOKED_SERVER, { exact: true })).toHaveCount(
        0
      )
    })

    await test.step("suspendre un serveur demande le motif que les propriétaires liront", async () => {
      await main
        .getByRole("row")
        .filter({ hasText: RUNNING_SERVER })
        .getByRole("button", { name: `Gestes sur ${RUNNING_SERVER}` })
        .click()
      await page.getByRole("menuitem", { name: "Suspendre" }).click()

      const dialog = page.getByRole("dialog")

      await dialog.getByRole("button", { name: "Suspendre" }).click()

      await expect(
        dialog.getByText("Indiquez le motif : les propriétaires le lisent.")
      ).toBeVisible()

      await dialog.getByLabel("Motif").fill("Abus signalé")
      await dialog.getByRole("button", { name: "Suspendre" }).click()

      await expect(
        toasts.getByText(`« ${RUNNING_SERVER} » est suspendu.`)
      ).toBeVisible()
      await expect(main.getByText("Aucun serveur ne correspond.")).toBeVisible()
    })

    await test.step("un lien d'affiliation se crée avec son partenaire", async () => {
      await menu.getByRole("link", { name: "Liens d'affiliation" }).click()

      await expect(page).toHaveURL(ADMIN_LINKS_URL_RE)
      await expect(
        main.getByText("Aucun lien d'affiliation pour l'instant.")
      ).toBeVisible()

      await page.getByRole("button", { name: "Créer un lien" }).click()

      const create = page.getByRole("dialog")

      await create.getByLabel("Nom", { exact: true }).fill(LINK_NAME)
      await create.getByLabel("Code (facultatif)").fill(LINK_CODE)
      await create.getByLabel("Mois offerts").fill("2")
      await create.getByLabel("Sièges").fill("3")
      await create.getByLabel("Nom du partenaire").fill(LINK_PARTNER)
      await create.getByLabel("E-mail du partenaire").fill(LINK_PARTNER_EMAIL)
      await create.getByRole("button", { name: "Créer le lien" }).click()

      await expect(toasts.getByText(`« ${LINK_NAME} » est prêt.`)).toBeVisible()

      const row = main.getByRole("row").filter({ hasText: LINK_NAME })

      await expect(row).toContainText(LINK_URL)
      await expect(row).toContainText(LINK_PARTNER)
      await expect(row).toContainText("Actif")

      await page.screenshot({
        path: `${SHOTS}/admin-affiliate-links.png`,
        fullPage: true,
      })
    })

    await test.step("un second lien sur le même code est refusé sous le champ", async () => {
      await page.getByRole("button", { name: "Créer un lien" }).click()

      const again = page.getByRole("dialog")

      await again.getByLabel("Nom", { exact: true }).fill("Un autre porteur")
      await again.getByLabel("Code (facultatif)").fill(LINK_CODE)
      await again.getByRole("button", { name: "Créer le lien" }).click()

      await expect(
        again.getByText(`Le code « ${LINK_CODE} » est déjà pris.`)
      ).toBeVisible()

      await again.getByRole("button", { name: "Annuler" }).click()

      await expect(
        main.getByRole("row").filter({ hasText: "Un autre porteur" })
      ).toHaveCount(0)
    })

    await test.step("la fiche du lien se modifie depuis ses réglages", async () => {
      await main.getByRole("link", { name: LINK_NAME }).click()

      await expect(page).toHaveURL(ADMIN_LINK_URL_RE)
      await expect(main.getByText(LINK_URL)).toBeVisible()
      await expect(main.getByText(LINK_PARTNER_EMAIL)).toBeVisible()
      await expect(main.getByText("Venues")).toBeVisible()

      await openTab(page, "Réglages")

      await expect(page).toHaveURL(ADMIN_LINK_SETTINGS_URL_RE)

      const apply = main.getByRole("button", { name: "Appliquer" })

      await expect(apply).toBeDisabled()

      await main.getByLabel("Mois offerts").fill("4")
      await main.getByLabel("Notes").fill(LINK_NOTES)
      await apply.click()

      await expect(
        toasts.getByText(`« ${LINK_NAME} » est à jour.`)
      ).toBeVisible()

      await openTab(page, "Aperçu")

      await expect(main.getByText(LINK_NOTES)).toBeVisible()
    })

    await test.step("le lien se désactive depuis sa zone dangereuse", async () => {
      await openTab(page, "Danger")

      await expect(
        main.getByText(
          "Un lien désactivé n'enregistre plus aucune provenance ; les organisations déjà venues gardent la leur."
        )
      ).toBeVisible()

      await main.getByRole("button", { name: "Désactiver" }).click()

      await expect(
        toasts.getByText(`« ${LINK_NAME} » ne parraine plus personne.`)
      ).toBeVisible()
      await expect(main.getByRole("button", { name: "Activer" })).toBeVisible()
    })

    await test.step("un lien qui a déjà amené une organisation ne s'efface pas", async () => {
      await seedReferral(request, { email: OWNER_EMAIL, code: LINK_CODE })
      await main.getByRole("button", { name: "Supprimer le lien" }).click()

      const remove = page.getByRole("dialog")

      await remove
        .getByLabel(`Retapez ${LINK_CODE} pour confirmer`)
        .fill(LINK_CODE)
      await remove.getByRole("button", { name: "Supprimer le lien" }).click()

      await expect(
        remove.getByText(
          "Ce lien a déjà amené une organisation : il ne s'efface plus."
        )
      ).toBeVisible()
      await expect(remove.getByText("Désactivez-le")).toBeVisible()

      await remove.getByRole("button", { name: "Annuler" }).click()
    })

    await test.step("un lien sans provenance s'efface, et la liste le perd", async () => {
      await menu.getByRole("link", { name: "Liens d'affiliation" }).click()
      await page.getByRole("button", { name: "Créer un lien" }).click()

      const create = page.getByRole("dialog")

      await create.getByLabel("Nom", { exact: true }).fill(SPARE_LINK_NAME)
      await create.getByLabel("Code (facultatif)").fill(SPARE_LINK_CODE)
      await create.getByRole("button", { name: "Créer le lien" }).click()

      await expect(
        toasts.getByText(`« ${SPARE_LINK_NAME} » est prêt.`)
      ).toBeVisible()

      await main.getByRole("link", { name: SPARE_LINK_NAME }).click()

      await expect(page).toHaveURL(ADMIN_LINK_URL_RE)

      await openTab(page, "Danger")
      await main.getByRole("button", { name: "Supprimer le lien" }).click()

      const remove = page.getByRole("dialog")

      await remove
        .getByLabel(`Retapez ${SPARE_LINK_CODE} pour confirmer`)
        .fill(SPARE_LINK_CODE)
      await remove.getByRole("button", { name: "Supprimer le lien" }).click()

      await expect(
        toasts.getByText(`« ${SPARE_LINK_NAME} » est supprimé.`)
      ).toBeVisible()
      await expect(page).toHaveURL(ADMIN_LINKS_URL_RE)
      await expect(
        main.getByRole("row").filter({ hasText: SPARE_LINK_NAME })
      ).toHaveCount(0)
    })

    await test.step("un abonnement s'offre à une organisation sans abonnement, puis s'arrête depuis sa page", async () => {
      await menu.getByRole("link", { name: "Organisations" }).click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATIONS_URL_RE)

      // The owner's organisation runs its trial: the grant stays shut there, and says why.
      await main
        .getByRole("link", { name: OWNER_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)
      await openTab(main, "Abonnements")
      await expect(
        page.getByRole("button", { name: "Offrir un abonnement" })
      ).toBeDisabled()
      await expect(
        main.getByText(
          "Un abonnement est en cours : arrêtez-le avant d'en offrir un autre."
        )
      ).toBeVisible()

      await menu.getByRole("link", { name: "Organisations" }).click()
      await main
        .getByRole("link", { name: ADMIN_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)
      await openTab(main, "Abonnements")
      await expect(
        main.getByText("Aucun abonnement, passé ou présent.")
      ).toBeVisible()

      await page.getByRole("button", { name: "Offrir un abonnement" }).click()

      const grant = page.getByRole("dialog")

      await grant.getByLabel("Sièges").fill("2")
      await grant.getByLabel("Note (facultative)").fill(GRANT_NOTE)
      await grant.getByRole("button", { name: "Offrir", exact: true }).click()

      await expect(
        toasts.getByText(`${ADMIN_ORGANIZATION} a son abonnement.`)
      ).toBeVisible()

      // The journal of the page names the grant too: the seats tell the row from the line.
      const row = main.getByRole("listitem").filter({ hasText: "2 sièges" })

      await expect(row).toContainText("Offert")
      await expect(row).toContainText("Actif")
      await expect(
        page.getByRole("button", { name: "Offrir un abonnement" })
      ).toBeDisabled()

      await row.getByRole("link").click()

      await expect(page).toHaveURL(ADMIN_SUBSCRIPTION_URL_RE)
      await expect(main.getByText(GRANT_NOTE)).toBeVisible()
      await expect(
        main.getByText("Actif", { exact: true }).filter({ visible: true })
      ).toBeVisible()

      await page.screenshot({
        path: `${SHOTS}/admin-subscription.png`,
        fullPage: true,
      })

      await openTab(page, "Gestes")
      await page.getByRole("button", { name: "Arrêter maintenant" }).click()

      const stop = page.getByRole("dialog")

      await stop.getByLabel("Motif").fill("Fin du partenariat")
      await stop.getByRole("button", { name: "Arrêter maintenant" }).click()

      await expect(
        toasts.getByText(`L'abonnement de ${ADMIN_ORGANIZATION} est arrêté.`)
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Arrêter maintenant" })
      ).toHaveCount(0)

      await openTab(page, "Aperçu")

      await expect(
        main.getByText("Résilié", { exact: true }).filter({ visible: true })
      ).toBeVisible()
    })
  })

  test("un membre de la plateforme lit les pages sans y toucher", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, READER_EMAIL)
    await promotePlatformMember(request, READER_EMAIL, "member")
    await seedServer(request, {
      email: READER_EMAIL,
      name: READER_SERVER,
      status: "active",
    })
    await receiveEmail(request, {
      from: THREAD_SENDER,
      subject: THREAD_SUBJECT,
      text: THREAD_TEXT,
    })
    await page.goto("/dashboard/start")
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")

    await test.step("le groupe Plateforme porte les pages", async () => {
      await expect(menu.getByText("Plateforme", { exact: true })).toBeVisible()

      for (const label of [
        "Vue d'ensemble",
        "Boîte de réception",
        "Utilisateurs",
        "Tous les serveurs",
        "Liens d'affiliation",
      ]) {
        await expect(menu.getByRole("link", { name: label })).toBeVisible()
      }
    })

    await test.step("la vue d'ensemble compte ce que la plateforme porte", async () => {
      await menu.getByRole("link", { name: "Vue d'ensemble" }).click()

      await expect(page).toHaveURL(ADMIN_URL_RE)
      await expect(
        main.getByText("Utilisateurs", { exact: true })
      ).toBeVisible()
      await expect(main.getByText("Serveurs", { exact: true })).toBeVisible()
      await expect(
        main.getByText("Liens d'affiliation", { exact: true })
      ).toBeVisible()
    })

    await test.step("un compte s'ouvre, ses gestes grisés disent le rôle qu'ils demandent", async () => {
      await menu.getByRole("link", { name: "Utilisateurs" }).click()

      await expect(page).toHaveURL(ADMIN_USERS_URL_RE)
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()

      // A magic-link account carries no name, so its row link reads empty:
      // the address it points at is what opens the account.
      const account = await main
        .getByRole("row")
        .filter({ hasText: OWNER_EMAIL })
        .getByRole("link")
        .first()
        .getAttribute("href")

      await page.goto(account ?? "")

      await expect(page).toHaveURL(ADMIN_USER_URL_RE)
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()

      await openTab(main, "Danger")

      const suspend = page.getByRole("button", {
        name: "Suspendre le compte",
        exact: true,
      })

      await expect(suspend).toBeDisabled()
      await expect(suspend).toHaveAttribute("title", ROLE_REQUIRED)
    })

    await test.step("un serveur en ligne s'affiche sans suspension", async () => {
      await menu.getByRole("link", { name: "Tous les serveurs" }).click()

      await expect(page).toHaveURL(ADMIN_SERVERS_URL_RE)

      const row = main.getByRole("row").filter({ hasText: READER_SERVER })

      await expect(row).toBeVisible()
      await expect(
        row.getByRole("button", { name: `Gestes sur ${READER_SERVER}` })
      ).toHaveCount(0)
    })

    await test.step("les liens d'affiliation se lisent, ni création ni réglages", async () => {
      await menu.getByRole("link", { name: "Liens d'affiliation" }).click()

      await expect(page).toHaveURL(ADMIN_LINKS_URL_RE)

      const row = main.getByRole("row").filter({ hasText: LINK_NAME })

      await expect(row).toContainText(LINK_URL)
      await expect(
        row.getByRole("button", { name: `Gestes sur ${LINK_NAME}` })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Créer un lien" })
      ).toHaveCount(0)

      await row.getByRole("link", { name: LINK_NAME }).click()

      await expect(page).toHaveURL(ADMIN_LINK_URL_RE)
      await expect(page.getByRole("tab", { name: "Aperçu" })).toBeVisible()
      await expect(page.getByRole("tab", { name: "Réglages" })).toHaveCount(0)
      await expect(page.getByRole("tab", { name: "Danger" })).toHaveCount(0)
    })

    await test.step("une conversation se lit sans être fermée ni répondue", async () => {
      await menu.getByRole("link", { name: "Boîte de réception" }).click()

      await expect(page).toHaveURL(ADMIN_INBOX_URL_RE)
      await expect(
        page.getByRole("button", { name: "Écrire un email" })
      ).toHaveCount(0)

      await main.getByRole("link", { name: new RegExp(THREAD_SUBJECT) }).click()

      await expect(page).toHaveURL(ADMIN_THREAD_URL_RE)
      await expect(main.getByText(THREAD_TEXT)).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Fermer la conversation" })
      ).toHaveCount(0)
      await expect(page.getByLabel("Réponse")).toHaveCount(0)
      await expect(page.getByLabel("Attribuée à")).toHaveCount(0)
    })

    await test.step("l'API refuse la création d'un lien", async () => {
      const refused = await page.request.post("/api/v1/admin/affiliate-links", {
        data: { name: "Refusé", free_months: 1, seats: 1 },
      })

      expect(refused.status()).toBe(FORBIDDEN)
    })
  })

  test("le lancement remplace l'essai sur la page de démarrage", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await chooseBillingMode(request, "launch", LAUNCH_ENDS_AT)
    await signIn(page, request, LAUNCH_EMAIL)

    const main = page.getByRole("main")

    await test.step("l'offre dit le lancement, sa fin et la machine, sans rythme à choisir", async () => {
      await expect(
        main.getByRole("heading", { name: "Lancement gratuit" })
      ).toBeVisible()
      await expect(
        main.getByText(`Gratuit jusqu'au ${LAUNCH_DATE}`)
      ).toBeVisible()
      await expect(main.getByText("1 machine")).toBeVisible()
      await expect(main.getByText("Période")).toHaveCount(0)
      await expect(main.getByRole("button", { name: "Annuel" })).toHaveCount(0)

      await page.screenshot({
        path: `${SHOTS}/launch-offer.png`,
        fullPage: true,
      })
    })

    await test.step("commencer accorde l'abonnement et fait le pas suivant", async () => {
      await main.getByRole("button", { name: "Commencer" }).click()

      await expect(page).toHaveURL(START_RETURN_URL_RE)
      await expect(page.getByText("L'essai est ouvert.")).toBeVisible()
      await expect(
        page.getByRole("link", { name: "Démarrer · 2/4" })
      ).toBeVisible()
    })

    await chooseBillingMode(request, "stripe")
  })

  test("les listes vivent dans l'adresse, la recherche ouvre une fiche, et l'effacement demande le nom", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, SOCLE_EMAIL)
    await promotePlatformMember(request, SOCLE_EMAIL)
    await openTrial(request, SOCLE_EMAIL)
    await seedServer(request, {
      email: SOCLE_EMAIL,
      name: SOCLE_SERVER,
      status: "active",
    })
    // Two seats held against the trial's single one: that is what the drift list raises.
    await seedServer(request, {
      email: SOCLE_EMAIL,
      name: SOCLE_SECOND_SERVER,
      status: "active",
    })
    await seedServer(request, {
      email: SOCLE_EMAIL,
      name: SOCLE_REVOKED_SERVER,
      status: "revoked",
    })
    await page.goto("/dashboard/start")
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")

    await test.step("un filtre de liste survit à un rechargement", async () => {
      await menu.getByRole("link", { name: "Tous les serveurs" }).click()

      await expect(page).toHaveURL(ADMIN_SERVERS_URL_RE)

      await page.getByLabel("Statut").click()
      await page.getByRole("option", { name: "Révoqué" }).click()

      await expect(page).toHaveURL(ADMIN_SERVERS_REVOKED_URL_RE)
      await expect(
        main.getByText(SOCLE_REVOKED_SERVER, { exact: true })
      ).toBeVisible()

      await page.reload()

      await expect(page).toHaveURL(ADMIN_SERVERS_REVOKED_URL_RE)
      await expect(
        main.getByText(SOCLE_REVOKED_SERVER, { exact: true })
      ).toBeVisible()
      await expect(main.getByText(SOCLE_SERVER, { exact: true })).toHaveCount(0)
    })

    await test.step("une carte de travail mène à ce qu'elle liste", async () => {
      await menu.getByRole("link", { name: "Vue d'ensemble" }).click()

      await expect(page).toHaveURL(ADMIN_URL_RE)
      await expect(main.getByText("Sièges dépassés")).toBeVisible()

      await main.getByRole("link", { name: "Tout voir" }).first().click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATIONS_URL_RE)
    })

    await test.step("la recherche globale ouvre une fiche", async () => {
      await page.keyboard.press("ControlOrMeta+k")

      const search = page.getByRole("dialog")

      await search.getByLabel("Chercher dans la plateforme").fill(SOCLE_SERVER)
      await search.getByRole("button", { name: SOCLE_SERVER }).click()

      await expect(page).toHaveURL(ADMIN_SERVER_URL_RE)
      await expect(page.getByRole("tab", { name: "Aperçu" })).toBeVisible()
      await expect(page.getByRole("tab", { name: "Danger" })).toBeVisible()
    })

    await test.step("effacer une ligne révoquée reste inerte tant que le nom diffère", async () => {
      await menu.getByRole("link", { name: "Tous les serveurs" }).click()
      await main
        .getByRole("row")
        .filter({ hasText: SOCLE_REVOKED_SERVER })
        .getByRole("link")
        .first()
        .click()

      await expect(page).toHaveURL(ADMIN_SERVER_URL_RE)
      await openTab(page, "Danger")
      await page.getByRole("button", { name: "Effacer la ligne" }).click()

      const purge = page.getByRole("dialog")
      const confirm = purge.getByRole("button", { name: "Effacer la ligne" })
      const keyword = purge.getByLabel(
        `Retapez ${SOCLE_REVOKED_SERVER} pour confirmer`
      )

      await purge.getByLabel("Motif").fill("Plus rien à garder")
      await keyword.fill("autre-chose")

      await expect(confirm).toBeDisabled()

      await keyword.fill(SOCLE_REVOKED_SERVER)

      await expect(confirm).toBeEnabled()
    })
  })

  test("le canal, les alertes, l'échéance d'un octroi, le filtre par organisation et un refus affiché", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, FLEET_EMAIL)
    await promotePlatformMember(request, FLEET_EMAIL)
    await seedServer(request, {
      email: FLEET_EMAIL,
      name: FLEET_SERVER,
      status: "active",
    })
    await seedAlert(request, {
      email: FLEET_EMAIL,
      server: FLEET_SERVER,
      kind: "disk_high",
    })
    await signIn(page, request, TRIAL_EMAIL)
    await openTrial(request, TRIAL_EMAIL)
    await signIn(page, request, FLEET_EMAIL)
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")
    const toasts = page.getByTestId("toasts")

    await test.step("le canal d'une machine s'applique depuis sa fiche", async () => {
      await menu.getByRole("link", { name: "Tous les serveurs" }).click()

      await expect(page).toHaveURL(ADMIN_SERVERS_URL_RE)

      await main
        .getByRole("row")
        .filter({ hasText: FLEET_SERVER })
        .getByRole("link")
        .first()
        .click()

      await expect(page).toHaveURL(ADMIN_SERVER_URL_RE)

      await page.getByLabel("Canal de mise à jour").click()
      await page.getByRole("option", { name: "Bêta" }).click()

      await expect(
        toasts.getByText(`« ${FLEET_SERVER} » suit le canal Bêta.`)
      ).toBeVisible()
    })

    await test.step("les alertes ouvertes se ferment depuis leur onglet", async () => {
      await openTab(page, "Alertes")
      await page.getByRole("button", { name: "Fermer les alertes" }).click()

      const dialog = page.getByRole("alertdialog")

      await dialog.getByRole("button", { name: "Fermer les alertes" }).click()

      await expect(
        toasts.getByText(`Les alertes de « ${FLEET_SERVER} » sont fermées.`)
      ).toBeVisible()
      await expect(main.getByText("Rien à signaler.")).toBeVisible()
    })

    let fleetOrganizationId = ""

    await test.step("l'échéance d'un abonnement offert se prolonge", async () => {
      await menu.getByRole("link", { name: "Organisations" }).click()
      await main
        .getByRole("link", { name: FLEET_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)

      fleetOrganizationId = page.url().split("/").pop() ?? ""

      await openTab(main, "Abonnements")
      await page.getByRole("button", { name: "Offrir un abonnement" }).click()

      const grant = page.getByRole("dialog")

      await grant.getByLabel("Sièges").fill("2")
      await grant.getByRole("button", { name: "Offrir", exact: true }).click()

      await expect(
        toasts.getByText(`${FLEET_ORGANIZATION} a son abonnement.`)
      ).toBeVisible()

      await main
        .getByRole("listitem")
        .filter({ hasText: "2 sièges" })
        .getByRole("link")
        .click()

      await expect(page).toHaveURL(ADMIN_SUBSCRIPTION_URL_RE)

      await openTab(page, "Gestes")
      await page.getByLabel("Date de fin (facultative)").fill(GRANT_END_DAY)
      await page.getByRole("button", { name: "Appliquer" }).click()

      await expect(
        toasts.getByText(
          `L'abonnement de ${FLEET_ORGANIZATION} est redimensionné.`
        )
      ).toBeVisible()
    })

    await test.step("le filtre d'organisation ne garde que ses abonnements, et se retire", async () => {
      await page.goto(
        `/dashboard/admin/subscriptions?organization_id=${fleetOrganizationId}`
      )

      await expect(
        main.getByText(`Organisation : ${FLEET_ORGANIZATION}`)
      ).toBeVisible()
      await expect(main.getByText("1–1 sur 1")).toBeVisible()
      await expect(
        main.getByRole("row").filter({ hasText: TRIAL_ORGANIZATION })
      ).toHaveCount(0)

      await main
        .getByRole("button", { name: `Organisation : ${FLEET_ORGANIZATION}` })
        .click()

      await expect(page).toHaveURL(ADMIN_SUBSCRIPTIONS_URL_RE)
      await expect(
        main.getByRole("row").filter({ hasText: TRIAL_ORGANIZATION })
      ).toHaveCount(1)
    })

    await test.step("un essai repoussé dans le passé est refusé sous le geste", async () => {
      await page.getByLabel("Recherche").fill(TRIAL_ORGANIZATION)

      await expect(main.getByText("1–1 sur 1")).toBeVisible()

      await main
        .getByRole("row")
        .filter({ hasText: TRIAL_ORGANIZATION })
        .getByRole("link")
        .first()
        .click()

      await expect(page).toHaveURL(ADMIN_SUBSCRIPTION_URL_RE)

      await openTab(page, "Gestes")
      await page.getByLabel("Fin de l'essai").fill(PAST_DAY)
      await page.getByRole("button", { name: "Prolonger l'essai" }).click()

      await expect(
        main.getByText("La fin d'essai demandée est déjà passée.")
      ).toBeVisible()
    })
  })

  test("un compte se suspend, se désactive et se programme en suppression, chaque geste se reprenant", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, CYCLE_TARGET_EMAIL)
    await signIn(page, request, CYCLE_ADMIN_EMAIL)
    await promotePlatformMember(request, CYCLE_ADMIN_EMAIL)
    await page.goto("/dashboard/start")
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")
    const toasts = page.getByTestId("toasts")

    await test.step("la liste des comptes se resserre sur un état", async () => {
      await menu.getByRole("link", { name: "Utilisateurs" }).click()

      await expect(page).toHaveURL(ADMIN_USERS_URL_RE)

      await page.getByLabel("État du compte").click()
      await page.getByRole("option", { name: "Suspendu" }).click()

      await expect(
        main.getByText("Aucun utilisateur ne correspond.")
      ).toBeVisible()

      await page.getByLabel("État du compte").click()
      await page.getByRole("option", { name: "Tous les états" }).click()
      await page.getByLabel("Recherche").fill(CYCLE_TARGET_EMAIL)
      await expect(main.getByText(CYCLE_TARGET_EMAIL)).toBeVisible()

      const account = await main
        .getByRole("row")
        .filter({ hasText: CYCLE_TARGET_EMAIL })
        .getByRole("link")
        .first()
        .getAttribute("href")

      await page.goto(account ?? "")
      await expect(page).toHaveURL(ADMIN_USER_URL_RE)
    })

    await test.step("suspendre le compte, puis lever la suspension", async () => {
      await openTab(main, "Danger")
      await expect(page).toHaveURL(DANGER_TAB_URL_RE)

      await page
        .getByRole("button", { name: "Suspendre le compte", exact: true })
        .click()

      const dialog = page.getByRole("dialog")

      await dialog.getByLabel("Motif").fill("Signalement 118")
      await dialog
        .getByRole("button", { name: "Suspendre le compte", exact: true })
        .click()

      await expect(
        toasts.getByText(`Le compte ${CYCLE_TARGET_EMAIL} est suspendu.`)
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Lever la suspension du compte" })
      ).toBeVisible()

      await openTab(main, "Aperçu")
      await expect(main.getByRole("img", { name: "Suspendu" })).toBeVisible()
      await expect(main.getByText("Signalement 118")).toBeVisible()

      await openTab(main, "Danger")
      await page
        .getByRole("button", { name: "Lever la suspension du compte" })
        .first()
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Lever la suspension du compte" })
        .click()

      await expect(
        toasts.getByText(`La suspension de ${CYCLE_TARGET_EMAIL} est levée.`)
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Suspendre le compte", exact: true })
      ).toBeVisible()
    })

    await test.step("désactiver le compte, puis le réactiver", async () => {
      await page
        .getByRole("button", { name: "Désactiver le compte", exact: true })
        .click()

      const dialog = page.getByRole("dialog")

      await dialog.getByLabel("Motif").fill("Compte dormant")
      await dialog
        .getByRole("button", { name: "Désactiver le compte", exact: true })
        .click()

      await expect(
        toasts.getByText(`Le compte ${CYCLE_TARGET_EMAIL} est désactivé.`)
      ).toBeVisible()

      await page
        .getByRole("button", { name: "Réactiver le compte", exact: true })
        .first()
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Réactiver le compte", exact: true })
        .click()

      await expect(
        toasts.getByText(`Le compte ${CYCLE_TARGET_EMAIL} est réactivé.`)
      ).toBeVisible()
    })

    await test.step("programmer la suppression derrière l'adresse retapée, puis l'annuler", async () => {
      await page
        .getByRole("button", { name: "Supprimer le compte", exact: true })
        .click()

      const dialog = page.getByRole("dialog")
      const confirm = dialog.getByRole("button", {
        name: "Supprimer le compte",
        exact: true,
      })

      await dialog.getByLabel("Motif").fill("Demande du client")
      await dialog
        .getByLabel(`Retapez ${CYCLE_TARGET_EMAIL} pour confirmer`)
        .fill("autre-chose")

      await expect(confirm).toBeDisabled()

      await dialog
        .getByLabel(`Retapez ${CYCLE_TARGET_EMAIL} pour confirmer`)
        .fill(CYCLE_TARGET_EMAIL)
      await confirm.click()

      await expect(
        page.getByRole("button", { name: "Purger le compte maintenant" })
      ).toBeVisible()

      await openTab(main, "Aperçu")
      await expect(
        main.getByRole("img", { name: "Suppression programmée" })
      ).toBeVisible()

      await openTab(main, "Danger")
      await page
        .getByRole("button", {
          name: "Annuler la suppression du compte",
          exact: true,
        })
        .first()
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: "Annuler la suppression du compte",
          exact: true,
        })
        .click()

      await expect(
        toasts.getByText(
          `La suppression du compte ${CYCLE_TARGET_EMAIL} est annulée.`
        )
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Supprimer le compte", exact: true })
      ).toBeVisible()
    })
  })

  test("une organisation se suspend, se ferme, se renomme et change de propriétaire", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, CYCLE_SECOND_EMAIL)
    await seedServer(request, {
      email: CYCLE_TARGET_EMAIL,
      name: CYCLE_SERVER,
      status: "active",
    })
    await seedMember(request, {
      organization_email: CYCLE_TARGET_EMAIL,
      email: CYCLE_SECOND_EMAIL,
      role: "member",
    })
    await signIn(page, request, CYCLE_ADMIN_EMAIL)
    await page.goto("/dashboard/start")
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")
    const toasts = page.getByTestId("toasts")

    await test.step("la liste des organisations mène à la fiche", async () => {
      await menu.getByRole("link", { name: "Organisations" }).click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATIONS_URL_RE)

      await page.getByLabel("Recherche").fill(CYCLE_ORGANIZATION)
      await main
        .getByRole("link", { name: CYCLE_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)
    })

    await test.step("suspendre l'organisation suspend ses serveurs, puis la levée les rend", async () => {
      await openTab(main, "Danger")
      await page
        .getByRole("button", { name: "Suspendre l'organisation", exact: true })
        .click()

      const dialog = page.getByRole("dialog")

      await dialog.getByLabel("Motif").fill("Balayage réseau sortant")
      await dialog
        .getByRole("button", { name: "Suspendre l'organisation", exact: true })
        .click()

      await expect(
        toasts.getByText(`L'organisation ${CYCLE_ORGANIZATION} est suspendue.`)
      ).toBeVisible()

      await openTab(main, "Serveurs")

      const row = main.getByRole("listitem").filter({ hasText: CYCLE_SERVER })

      await expect(row).toContainText("Suspendu par l'équipe")

      await openTab(main, "Danger")
      await page
        .getByRole("button", {
          name: "Lever la suspension de l'organisation",
          exact: true,
        })
        .first()
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: "Lever la suspension de l'organisation",
          exact: true,
        })
        .click()

      await expect(
        toasts.getByText(`La suspension de ${CYCLE_ORGANIZATION} est levée.`)
      ).toBeVisible()
    })

    await test.step("fermer l'organisation, puis la rouvrir", async () => {
      await page
        .getByRole("button", { name: "Fermer l'organisation", exact: true })
        .click()

      const dialog = page.getByRole("dialog")

      await dialog.getByLabel("Motif").fill("Demande du client")
      await dialog
        .getByRole("button", { name: "Fermer l'organisation", exact: true })
        .click()

      await expect(
        toasts.getByText(`L'organisation ${CYCLE_ORGANIZATION} est fermée.`)
      ).toBeVisible()

      await page
        .getByRole("button", { name: "Rouvrir l'organisation", exact: true })
        .first()
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Rouvrir l'organisation", exact: true })
        .click()

      await expect(
        toasts.getByText(`L'organisation ${CYCLE_ORGANIZATION} est rouverte.`)
      ).toBeVisible()
    })

    await test.step("renommer l'organisation depuis ses réglages", async () => {
      await openTab(main, "Réglages")

      const apply = page.getByRole("button", { name: "Appliquer" })

      await expect(apply).toBeDisabled()

      await page.getByLabel("Nom de l'organisation").fill(CYCLE_RENAMED)
      await apply.click()

      await expect(
        toasts.getByText(`L'organisation s'appelle ${CYCLE_RENAMED}.`)
      ).toBeVisible()
    })

    await test.step("transférer la propriété depuis le menu de ligne d'un membre", async () => {
      await openTab(main, "Membres")
      await main
        .getByRole("listitem")
        .filter({ hasText: CYCLE_SECOND_EMAIL })
        .getByRole("button", {
          name: `Gestes sur le membre ${CYCLE_SECOND_EMAIL}`,
        })
        .click()
      await page
        .getByRole("menuitem", { name: "Transférer la propriété" })
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Transférer la propriété", exact: true })
        .click()

      await expect(
        toasts.getByText(
          `${CYCLE_SECOND_EMAIL} est propriétaire de ${CYCLE_RENAMED}.`
        )
      ).toBeVisible()
    })
  })
})
