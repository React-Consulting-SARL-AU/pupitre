import { expect, type Locator, type Page, test } from "@playwright/test"
import {
  grantLicense,
  harnessUrl,
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

const RUNNING_SERVER = "vps-admin-online"
const REVOKED_SERVER = "vps-admin-revoked"
const READER_SERVER = "vps-admin-reader"

const FLEET_EMAIL = "fleet@e2e.local"
const FLEET_ORGANIZATION = "fleet"
const FLEET_SERVER = "vps-fleet-online"
const LICENSED_EMAIL = "atelier@e2e.local"
const LICENSED_ORGANIZATION = "atelier"
const GRANT_END_DAY = "2027-06-30"

const SOCLE_EMAIL = "socle@e2e.local"
const SOCLE_SERVER = "vps-socle-online"
const SOCLE_EXTRA_SERVERS = [
  "vps-socle-second",
  "vps-socle-third",
  "vps-socle-fourth",
  "vps-socle-fifth",
]
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
const ADMIN_SUBSCRIPTIONS_DRIFTED_URL_RE =
  /\/dashboard\/admin\/subscriptions\?drifted=true$/
const ADMIN_SUBSCRIPTION_URL_RE = /\/dashboard\/admin\/subscriptions\/[^/]+$/
const ADMIN_LINKS_URL_RE = /\/dashboard\/admin\/affiliate-links$/
const ADMIN_LINK_URL_RE = /\/dashboard\/admin\/affiliate-links\/[^/?]+/
const ADMIN_LINK_SETTINGS_URL_RE = /\/affiliate-links\/[^/?]+\?tab=settings$/
const ADMIN_INBOX_URL_RE = /\/dashboard\/admin\/inbox$/
const ADMIN_THREAD_URL_RE = /\/dashboard\/admin\/inbox\/[^/]+$/

const ONLINE_SERVERS_RE = /en ligne/
const CANCELED_LICENSES_RE = /résilié/

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

const SHOTS = process.env.PUPITRE_E2E_SHOTS ?? "../../.playwright/shots"

// A tab clicked right after a navigation can be lost while the page settles.
async function openTab(scope: Page | Locator, name: string): Promise<void> {
  const tab = scope.getByRole("tab", { name })

  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
}

// Platform pages only open on the platform organisation.
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

test.describe("platform", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(harnessUrl("/reset"))
  })

  test("an account without a platform role gets neither the group nor the pages", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, OWNER_EMAIL)

    const menu = page.getByRole("navigation", { name: "Menu principal" })

    await test.step("the sidebar does not carry the Plateforme group", async () => {
      await expect(menu.getByText("Plateforme")).toHaveCount(0)
      await expect(
        menu.getByRole("link", { name: "Vue d'ensemble" })
      ).toHaveCount(0)
    })

    await test.step("platform addresses lead back to the console", async () => {
      await grantLicense(request, OWNER_EMAIL, 1)

      for (const closed of [
        "/dashboard/admin",
        "/dashboard/admin/users",
        "/dashboard/admin/servers",
        "/dashboard/admin/affiliate-links",
      ]) {
        await page.goto(closed)
        await expect(page, closed).toHaveURL(START_URL_RE)
      }
    })

    await test.step("the API refuses to read the platform", async () => {
      const refused = await page.request.get("/api/v1/admin/overview")

      expect(refused.status()).toBe(FORBIDDEN)
    })
  })

  test("a platform administrator reads the counters, accounts, servers and links", async ({
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

    await test.step("the platform only appears once its organization is chosen", async () => {
      await expect(menu.getByText("Plateforme", { exact: true })).toHaveCount(0)

      await page.goto("/dashboard/admin")
      await expect(page).toHaveURL(START_URL_RE)

      await openPlatformOrganization(page)
    })

    await test.step("the Pupitre organization has neither getting started nor a licence", async () => {
      await expect(menu.getByRole("link", { name: START_LINK_RE })).toHaveCount(
        0
      )
      await expect(
        menu.getByRole("link", { name: "Licence", exact: true })
      ).toHaveCount(0)

      await page.goto("/dashboard/start")
      await expect(page).toHaveURL(ADMIN_URL_RE)

      await page.goto("/dashboard/billing")
      await expect(page).toHaveURL(ADMIN_URL_RE)
    })

    await test.step("the Plateforme group carries the ten pages", async () => {
      await expect(menu.getByText("Plateforme", { exact: true })).toBeVisible()

      for (const label of [
        "Vue d'ensemble",
        "Boîte de réception",
        "Utilisateurs",
        "Organisations",
        "Tous les serveurs",
        "Licences",
        "Liens d'affiliation",
        "Journal de la plateforme",
        "Versions",
        "Équipe",
      ]) {
        await expect(menu.getByRole("link", { name: label })).toBeVisible()
      }
    })

    await test.step("the overview counts what the platform carries", async () => {
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
      await expect(main.getByText("Licences", { exact: true })).toBeVisible()
      await expect(main.getByText(CANCELED_LICENSES_RE)).toBeVisible()
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

    await test.step("the account list narrows on a search", async () => {
      await menu.getByRole("link", { name: "Utilisateurs" }).click()

      await expect(page).toHaveURL(ADMIN_USERS_URL_RE)
      await expect(main.getByText(ADMIN_EMAIL)).toBeVisible()
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()

      await page.getByLabel("Recherche").fill(OWNER_EMAIL)

      await expect(main.getByText(ADMIN_EMAIL)).toHaveCount(0)
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()
      await expect(main.getByText("1–1 sur 1")).toBeVisible()
    })

    await test.step("the status filter keeps only the requested servers", async () => {
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

    await test.step("suspending a server asks for the reason the owners will read", async () => {
      await main
        .getByRole("row")
        .filter({ hasText: RUNNING_SERVER })
        .getByRole("button", { name: `Actions sur ${RUNNING_SERVER}` })
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

    await test.step("an affiliate link is created with its partner", async () => {
      await menu.getByRole("link", { name: "Liens d'affiliation" }).click()

      await expect(page).toHaveURL(ADMIN_LINKS_URL_RE)
      await expect(
        main.getByText("Aucun lien d'affiliation pour l'instant.")
      ).toBeVisible()

      await page.getByRole("button", { name: "Créer un lien" }).click()

      const create = page.getByRole("dialog")

      await create.getByLabel("Nom", { exact: true }).fill(LINK_NAME)
      await create.getByLabel("Code (facultatif)").fill(LINK_CODE)
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

    await test.step("a second link on the same code is refused under the field", async () => {
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

    await test.step("the link's record is edited from its settings", async () => {
      await main.getByRole("link", { name: LINK_NAME }).click()

      await expect(page).toHaveURL(ADMIN_LINK_URL_RE)
      await expect(main.getByText(LINK_URL)).toBeVisible()
      await expect(main.getByText(LINK_PARTNER_EMAIL)).toBeVisible()
      await expect(main.getByText("Serveurs installés")).toBeVisible()
      await expect(main.getByText("Mois offerts")).toHaveCount(0)

      await openTab(page, "Réglages")

      await expect(page).toHaveURL(ADMIN_LINK_SETTINGS_URL_RE)

      const apply = main.getByRole("button", { name: "Appliquer" })

      await expect(apply).toBeDisabled()

      await main.getByLabel("Notes").fill(LINK_NOTES)
      await apply.click()

      await expect(
        toasts.getByText(`« ${LINK_NAME} » est à jour.`)
      ).toBeVisible()

      await openTab(page, "Aperçu")

      await expect(main.getByText(LINK_NOTES)).toBeVisible()
    })

    await test.step("the link is deactivated from its danger zone", async () => {
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

    await test.step("a link that already brought in an organization cannot be deleted", async () => {
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

    await test.step("a link with no provenance is deleted, and the list loses it", async () => {
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

    await test.step("a licence is granted to an organization that has none, then stopped from its page", async () => {
      await menu.getByRole("link", { name: "Organisations" }).click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATIONS_URL_RE)

      // The owner's organisation already holds a licence, so the grant stays shut there.
      await main
        .getByRole("link", { name: OWNER_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)
      await openTab(main, "Licences")
      await expect(
        page.getByRole("button", { name: "Accorder une licence" })
      ).toBeDisabled()
      await expect(
        main.getByText(
          "Une licence est en cours : arrêtez-la avant d'en accorder une autre."
        )
      ).toBeVisible()

      await menu.getByRole("link", { name: "Organisations" }).click()
      await main
        .getByRole("link", { name: ADMIN_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)
      await openTab(main, "Licences")
      await expect(
        main.getByText("Aucune licence, passée ou présente.")
      ).toBeVisible()

      await page.getByRole("button", { name: "Accorder une licence" }).click()

      const grant = page.getByRole("dialog")

      await grant.getByLabel("Sièges").fill("2")
      await grant.getByLabel("Note (facultative)").fill(GRANT_NOTE)
      await grant.getByRole("button", { name: "Accorder", exact: true }).click()

      await expect(
        toasts.getByText(`${ADMIN_ORGANIZATION} a sa licence.`)
      ).toBeVisible()

      // The journal names the grant too: the seats tell the row from the journal line.
      const row = main.getByRole("listitem").filter({ hasText: "2 sièges" })

      await expect(row).toContainText("Accordée")
      await expect(row).toContainText("Actif")
      await expect(
        page.getByRole("button", { name: "Accorder une licence" })
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
        toasts.getByText(`La licence de ${ADMIN_ORGANIZATION} est arrêtée.`)
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

  test("a platform member reads the pages without touching them", async ({
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

    await test.step("the Plateforme group carries the pages", async () => {
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

    await test.step("the overview counts what the platform carries", async () => {
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

    await test.step("an account opens, its greyed-out actions name the role they require", async () => {
      await menu.getByRole("link", { name: "Utilisateurs" }).click()

      await expect(page).toHaveURL(ADMIN_USERS_URL_RE)
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()

      // A magic-link account has no name, so its row link is found by its address.
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

    await test.step("an online server shows without a suspension", async () => {
      await menu.getByRole("link", { name: "Tous les serveurs" }).click()

      await expect(page).toHaveURL(ADMIN_SERVERS_URL_RE)

      const row = main.getByRole("row").filter({ hasText: READER_SERVER })

      await expect(row).toBeVisible()
      await expect(
        row.getByRole("button", { name: `Actions sur ${READER_SERVER}` })
      ).toHaveCount(0)
    })

    await test.step("affiliate links are readable, with neither creation nor settings", async () => {
      await menu.getByRole("link", { name: "Liens d'affiliation" }).click()

      await expect(page).toHaveURL(ADMIN_LINKS_URL_RE)

      const row = main.getByRole("row").filter({ hasText: LINK_NAME })

      await expect(row).toContainText(LINK_URL)
      await expect(
        row.getByRole("button", { name: `Actions sur ${LINK_NAME}` })
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

    await test.step("a conversation is read without being closed or answered", async () => {
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

    await test.step("the API refuses to create a link", async () => {
      const refused = await page.request.post("/api/v1/admin/affiliate-links", {
        data: { name: "Refusé" },
      })

      expect(refused.status()).toBe(FORBIDDEN)
    })
  })

  test("lists live in the address, search opens a record, and deletion asks for the name", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, SOCLE_EMAIL)
    await promotePlatformMember(request, SOCLE_EMAIL)
    await grantLicense(request, SOCLE_EMAIL, 1)
    await seedServer(request, {
      email: SOCLE_EMAIL,
      name: SOCLE_SERVER,
      status: "active",
    })
    // Two seated servers beyond the free three against the licence's single seat: what the drift list raises.
    for (const name of SOCLE_EXTRA_SERVERS) {
      await seedServer(request, { email: SOCLE_EMAIL, name, status: "active" })
    }
    await seedServer(request, {
      email: SOCLE_EMAIL,
      name: SOCLE_REVOKED_SERVER,
      status: "revoked",
    })
    await page.goto("/dashboard/start")
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")

    await test.step("a list filter survives a reload", async () => {
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

    await test.step("a work card leads to what it lists", async () => {
      await menu.getByRole("link", { name: "Vue d'ensemble" }).click()

      await expect(page).toHaveURL(ADMIN_URL_RE)
      await expect(
        main.getByText("Serveurs au-delà de la licence")
      ).toBeVisible()

      await main.getByRole("link", { name: "Tout voir" }).first().click()

      await expect(page).toHaveURL(ADMIN_SUBSCRIPTIONS_DRIFTED_URL_RE)
    })

    await test.step("global search opens a record", async () => {
      await page.keyboard.press("ControlOrMeta+k")

      const search = page.getByRole("dialog")

      await search.getByLabel("Chercher dans la plateforme").fill(SOCLE_SERVER)
      await search.getByRole("button", { name: SOCLE_SERVER }).click()

      await expect(page).toHaveURL(ADMIN_SERVER_URL_RE)
      await expect(page.getByRole("tab", { name: "Aperçu" })).toBeVisible()
      await expect(page.getByRole("tab", { name: "Danger" })).toBeVisible()
    })

    await test.step("deleting a revoked row stays inert while the name differs", async () => {
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

  test("the channel, alerts, a grant's expiry, the organization filter and search", async ({
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
    await signIn(page, request, LICENSED_EMAIL)
    await grantLicense(request, LICENSED_EMAIL, 1)
    await signIn(page, request, FLEET_EMAIL, "servers")
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")
    const toasts = page.getByTestId("toasts")

    await test.step("a machine's channel is applied from its record", async () => {
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

    await test.step("open alerts are closed from their tab", async () => {
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

    await test.step("a granted licence's expiry is extended", async () => {
      await menu.getByRole("link", { name: "Organisations" }).click()
      await main
        .getByRole("link", { name: FLEET_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)

      fleetOrganizationId = page.url().split("/").pop() ?? ""

      await openTab(main, "Licences")
      await page.getByRole("button", { name: "Accorder une licence" }).click()

      const grant = page.getByRole("dialog")

      await grant.getByLabel("Sièges").fill("2")
      await grant.getByRole("button", { name: "Accorder", exact: true }).click()

      await expect(
        toasts.getByText(`${FLEET_ORGANIZATION} a sa licence.`)
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
          `La licence de ${FLEET_ORGANIZATION} est redimensionnée.`
        )
      ).toBeVisible()
    })

    await test.step("the organization filter keeps only its licences, and can be removed", async () => {
      await page.goto(
        `/dashboard/admin/subscriptions?organization_id=${fleetOrganizationId}`
      )

      await expect(
        main.getByText(`Organisation : ${FLEET_ORGANIZATION}`)
      ).toBeVisible()
      await expect(main.getByText("1–1 sur 1")).toBeVisible()
      await expect(
        main.getByRole("row").filter({ hasText: LICENSED_ORGANIZATION })
      ).toHaveCount(0)

      await main
        .getByRole("button", { name: `Organisation : ${FLEET_ORGANIZATION}` })
        .click()

      await expect(page).toHaveURL(ADMIN_SUBSCRIPTIONS_URL_RE)
      await expect(
        main.getByRole("row").filter({ hasText: LICENSED_ORGANIZATION })
      ).toHaveCount(1)
    })

    await test.step("search opens another organization's licence", async () => {
      await page.getByLabel("Recherche").fill(LICENSED_ORGANIZATION)

      await expect(main.getByText("1–1 sur 1")).toBeVisible()

      await main
        .getByRole("row")
        .filter({ hasText: LICENSED_ORGANIZATION })
        .getByRole("link")
        .first()
        .click()

      await expect(page).toHaveURL(ADMIN_SUBSCRIPTION_URL_RE)
    })
  })

  test("an account is suspended, deactivated and scheduled for deletion, each action being reversible", async ({
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

    await test.step("the account list narrows on a state", async () => {
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

    await test.step("suspend the account, then lift the suspension", async () => {
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
      await expect(
        main
          .getByRole("tabpanel", { name: "Aperçu" })
          .getByText("Suspendu", { exact: true })
      ).toBeVisible()
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

    await test.step("deactivate the account, then reactivate it", async () => {
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

    await test.step("schedule the deletion behind the retyped address, then cancel it", async () => {
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
        main
          .getByRole("tabpanel", { name: "Aperçu" })
          .getByText("Suppression programmée", { exact: true })
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

  test("an organization is suspended, closed, renamed and changes owner", async ({
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

    await test.step("the organization list leads to the record", async () => {
      await menu.getByRole("link", { name: "Organisations" }).click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATIONS_URL_RE)

      await page.getByLabel("Recherche").fill(CYCLE_ORGANIZATION)
      await main
        .getByRole("link", { name: CYCLE_ORGANIZATION, exact: true })
        .click()

      await expect(page).toHaveURL(ADMIN_ORGANIZATION_URL_RE)
    })

    await test.step("suspending the organization suspends its servers, then lifting it restores them", async () => {
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

    await test.step("close the organization, then reopen it", async () => {
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

    await test.step("rename the organization from its settings", async () => {
      await openTab(main, "Réglages")

      const apply = page.getByRole("button", { name: "Appliquer" })

      await expect(apply).toBeDisabled()

      await page.getByLabel("Nom de l'organisation").fill(CYCLE_RENAMED)
      await apply.click()

      await expect(
        toasts.getByText(`L'organisation s'appelle ${CYCLE_RENAMED}.`)
      ).toBeVisible()
    })

    await test.step("transfer ownership from a member's row menu", async () => {
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
