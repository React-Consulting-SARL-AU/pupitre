import { expect, type Page, test } from "@playwright/test"
import {
  harnessUrl,
  promotePlatformMember,
  receiveEmail,
  signIn,
  stayLocal,
} from "./harness/session"

const ADMIN_EMAIL = "inbox@e2e.local"

const FIRST_SENDER = "ada@e2e.local"
const FIRST_SUBJECT = "L'agent refuse le serveur"
const FIRST_TEXT = "Mon serveur refuse l'agent."

const SECOND_SENDER = "bo@e2e.local"
const SECOND_SUBJECT = "La sauvegarde ne part plus"
const SECOND_TEXT = "La sauvegarde ne part plus depuis hier."

const REPLY = "On regarde le serveur maintenant."
const DRAFT = "Brouillon en cours de rédaction."

const NEW_MAILBOX = "ventes"
const NEW_MAILBOX_NAME = "Ventes"

const INBOX_URL_RE = /\/dashboard\/admin\/inbox$/
const THREAD_URL_RE = /\/dashboard\/admin\/inbox\/[^/]+$/
const MAILBOXES_URL_RE = /\/dashboard\/admin\/inbox\/mailboxes$/

const SELECTION_RE = /conversations? sélectionnée/

// Platform pages only open on the platform organisation.
async function openPlatformOrganization(page: Page): Promise<void> {
  await page.getByTitle("Organisations").first().click()
  await page.getByRole("menuitem", { name: "Pupitre" }).click()
  await expect(page.getByTitle("Organisations").first()).toContainText(
    "Pupitre"
  )
}

test.describe("the platform inbox", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(harnessUrl("/reset"))
  })

  test("an administrator reads a thread, replies, closes a batch, opens an inbox and keeps a draft", async ({
    page,
    request,
  }) => {
    await stayLocal(page)
    await signIn(page, request, ADMIN_EMAIL)
    await promotePlatformMember(request, ADMIN_EMAIL)
    await receiveEmail(request, {
      from: FIRST_SENDER,
      subject: FIRST_SUBJECT,
      text: FIRST_TEXT,
    })
    await receiveEmail(request, {
      from: SECOND_SENDER,
      subject: SECOND_SUBJECT,
      text: SECOND_TEXT,
    })
    await page.goto("/dashboard/start")
    await openPlatformOrganization(page)

    const menu = page.getByRole("navigation", { name: "Menu principal" })
    const main = page.getByRole("main")

    await test.step("the rail names the Support inbox and counts its unread threads", async () => {
      await menu.getByRole("link", { name: "Boîte de réception" }).click()

      await expect(page).toHaveURL(INBOX_URL_RE)
      await expect(
        main.getByRole("navigation", { name: "Boîtes" })
      ).toContainText("Support")
      await expect(main.getByText(FIRST_SUBJECT).first()).toBeVisible()
      await expect(main.getByText(SECOND_SUBJECT).first()).toBeVisible()
    })

    await test.step("a thread opens from the list and shows its message", async () => {
      await main.getByRole("link", { name: new RegExp(FIRST_SUBJECT) }).click()

      await expect(page).toHaveURL(THREAD_URL_RE)
      await expect(main.getByText(FIRST_TEXT).first()).toBeVisible()
      await expect(
        main.getByRole("heading", { name: "Activité" })
      ).toBeVisible()
    })

    await test.step("a draft survives a page reload", async () => {
      await page.getByRole("textbox", { name: "Réponse" }).fill(DRAFT)

      await expect(page.getByText("Brouillon enregistré")).toBeVisible()

      await page.reload()

      await expect(page.getByRole("textbox", { name: "Réponse" })).toHaveValue(
        DRAFT
      )
    })

    await test.step("an internal note is filed under the thread", async () => {
      await page
        .getByRole("textbox", { name: "Ajouter une note interne" })
        .fill("Client du lancement.")
      await page.getByRole("button", { name: "Ajouter la note" }).click()

      await expect(main.getByText("Client du lancement.").first()).toBeVisible()
    })

    await test.step("the reply goes out from the thread's inbox", async () => {
      await page.getByRole("textbox", { name: "Réponse" }).fill(REPLY)
      await page.getByRole("button", { name: "Envoyer" }).click()

      await expect(main.getByText(REPLY).first()).toBeVisible()
      await expect(page.getByRole("textbox", { name: "Réponse" })).toHaveValue(
        ""
      )
    })

    await test.step("a selection is closed in a single action", async () => {
      await page.goto("/dashboard/admin/inbox")

      await page
        .getByRole("checkbox", {
          name: "Sélectionner toutes les conversations de la page",
        })
        .click()

      await expect(main.getByText(SELECTION_RE)).toBeVisible()

      await page.getByRole("button", { name: "Fermer la sélection" }).click()

      await expect(
        main.getByText("Aucune conversation ne correspond à ces filtres.")
      ).toBeVisible()
    })

    await test.step("an opened inbox appears in the rail", async () => {
      await page.goto("/dashboard/admin/inbox/mailboxes")

      await expect(page).toHaveURL(MAILBOXES_URL_RE)

      await page.getByLabel("Adresse").last().fill(NEW_MAILBOX)
      await page.getByLabel("Nom affiché").last().fill(NEW_MAILBOX_NAME)
      await page.getByRole("button", { name: "Ouvrir la boîte" }).click()

      await expect(
        main.getByText("ventes@pupitre.studio").first()
      ).toBeVisible()

      await page.goto("/dashboard/admin/inbox")

      await expect(
        main.getByRole("navigation", { name: "Boîtes" })
      ).toContainText(NEW_MAILBOX_NAME)
    })
  })
})
