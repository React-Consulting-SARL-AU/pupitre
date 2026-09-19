import { expect, type Page, test } from "@playwright/test"
import {
  chooseBillingMode,
  harnessUrl,
  openTrial,
  promotePlatformMember,
  receiveEmail,
  seedServer,
  signIn,
  stayLocal,
} from "./harness/session"

const OWNER_EMAIL = "owner@e2e.local"
const ADMIN_EMAIL = "support@e2e.local"
const READER_EMAIL = "reader@e2e.local"
const LAUNCH_EMAIL = "launch@e2e.local"

const RUNNING_SERVER = "vps-admin-online"
const REVOKED_SERVER = "vps-admin-revoked"
const READER_SERVER = "vps-admin-reader"

const THREAD_SENDER = "ada@e2e.local"
const THREAD_SUBJECT = "L'agent refuse le serveur"
const THREAD_TEXT = "Mon serveur refuse l'agent."

const LINK_NAME = "Salon des makers"
const LINK_CODE = "makers-e2e"
const LINK_URL = `https://pupitre.studio/?ref=${LINK_CODE}`

const LAUNCH_ENDS_AT = "2026-12-31T12:00:00.000Z"
const LAUNCH_DATE = "31 décembre 2026"

const SERVERS_URL_RE = /\/dashboard\/servers$/
const START_URL_RE = /\/dashboard\/start$/
const ADMIN_URL_RE = /\/dashboard\/admin$/
const ADMIN_USERS_URL_RE = /\/dashboard\/admin\/users$/
const ADMIN_USER_URL_RE = /\/dashboard\/admin\/users\/[^/]+$/
const ADMIN_SERVERS_URL_RE = /\/dashboard\/admin\/servers$/
const ADMIN_LINKS_URL_RE = /\/dashboard\/admin\/affiliate-links$/
const ADMIN_INBOX_URL_RE = /\/dashboard\/admin\/inbox$/
const ADMIN_THREAD_URL_RE = /\/dashboard\/admin\/inbox\/[^/]+$/
const START_RETURN_URL_RE = /\/dashboard\/start\?checkout=done$/

const FORBIDDEN = 403

/** Where the owner looks at what the run saw; the suite writes beside its own artifacts otherwise. */
const SHOTS = process.env.PUPITRE_E2E_SHOTS ?? "../../.playwright/shots"

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
      await expect(main.getByText("En ligne", { exact: true })).toBeVisible()
      await expect(main.getByText("Abonnements", { exact: true })).toBeVisible()
      await expect(main.getByText("Essai", { exact: true })).toBeVisible()
      await expect(
        main.getByText("Liens d'affiliation", { exact: true })
      ).toBeVisible()

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
      await page.getByRole("button", { name: "Chercher" }).click()

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
        .getByRole("listitem")
        .filter({ hasText: RUNNING_SERVER })
        .getByRole("button", { name: "Suspendre" })
        .click()

      const dialog = page.getByRole("alertdialog")

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

    await test.step("un lien d'affiliation se crée, s'ouvre en adresse, puis se désactive", async () => {
      await menu.getByRole("link", { name: "Liens d'affiliation" }).click()

      await expect(page).toHaveURL(ADMIN_LINKS_URL_RE)
      await expect(
        main.getByText("Aucun lien d'affiliation pour l'instant.")
      ).toBeVisible()

      await page.getByLabel("Nom").fill(LINK_NAME)
      await page.getByLabel("Code (facultatif)").fill(LINK_CODE)
      await page.getByLabel("Mois offerts").fill("2")
      await page.getByLabel("Sièges").fill("3")
      await page.getByRole("button", { name: "Créer le lien" }).click()

      await expect(toasts.getByText(`« ${LINK_NAME} » est prêt.`)).toBeVisible()

      const row = main.getByRole("listitem").filter({ hasText: LINK_NAME })

      await expect(row).toContainText(LINK_URL)
      await expect(row).toContainText("2 mois offerts")
      await expect(row).toContainText("3 sièges")
      await expect(row).toContainText("Actif")

      await page.screenshot({
        path: `${SHOTS}/admin-affiliate-links.png`,
        fullPage: true,
      })

      await row.getByRole("button", { name: "Désactiver" }).click()

      await expect(
        toasts.getByText(`« ${LINK_NAME} » ne parraine plus personne.`)
      ).toBeVisible()
      await expect(row).toContainText("Désactivé")
      await expect(row.getByRole("button", { name: "Activer" })).toBeVisible()
    })

    await test.step("un second lien sur le même code est refusé sous le champ", async () => {
      await page.getByLabel("Nom").fill("Un autre porteur")
      await page.getByLabel("Code (facultatif)").fill(LINK_CODE)
      await page.getByRole("button", { name: "Créer le lien" }).click()

      await expect(
        main.getByText(`Le code « ${LINK_CODE} » est déjà pris.`)
      ).toBeVisible()
      await expect(
        main.getByRole("listitem").filter({ hasText: "Un autre porteur" })
      ).toHaveCount(0)
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

    await test.step("un compte s'ouvre sans offrir de bannissement", async () => {
      await menu.getByRole("link", { name: "Utilisateurs" }).click()

      await expect(page).toHaveURL(ADMIN_USERS_URL_RE)
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()

      // A magic-link account carries no name, so its row link reads empty:
      // the address it points at is what opens the account.
      const account = await main
        .getByRole("listitem")
        .filter({ hasText: OWNER_EMAIL })
        .getByRole("link")
        .first()
        .getAttribute("href")

      await page.goto(account ?? "")

      await expect(page).toHaveURL(ADMIN_USER_URL_RE)
      await expect(main.getByText(OWNER_EMAIL)).toBeVisible()
      await expect(page.getByRole("button", { name: "Bannir" })).toHaveCount(0)
    })

    await test.step("un serveur en ligne s'affiche sans suspension", async () => {
      await menu.getByRole("link", { name: "Tous les serveurs" }).click()

      await expect(page).toHaveURL(ADMIN_SERVERS_URL_RE)

      const row = main.getByRole("listitem").filter({ hasText: READER_SERVER })

      await expect(row).toBeVisible()
      await expect(row.getByRole("button", { name: "Suspendre" })).toHaveCount(
        0
      )
    })

    await test.step("les liens d'affiliation se lisent, ni création ni bascule", async () => {
      await menu.getByRole("link", { name: "Liens d'affiliation" }).click()

      await expect(page).toHaveURL(ADMIN_LINKS_URL_RE)

      const row = main.getByRole("listitem").filter({ hasText: LINK_NAME })

      await expect(row).toContainText(LINK_URL)
      await expect(row.getByRole("button", { name: "Activer" })).toHaveCount(0)
      await expect(row.getByRole("button", { name: "Désactiver" })).toHaveCount(
        0
      )
      await expect(main.getByText("Nouveau lien d'affiliation")).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Créer le lien" })
      ).toHaveCount(0)
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
})
