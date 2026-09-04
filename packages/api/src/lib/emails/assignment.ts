import { sendEmailFor } from "@pupitre/auth/server"
import type { Server } from "@pupitre/db/cloudflare/client"
import { getApiAuth } from "../api/plugins/auth"
import { getPrisma } from "../api/prisma"

export interface ServerAssignedEmailInput {
  userId: string
  server: Server
}

// PLT-11 replaces this plain text with the React Email template.
export async function sendServerAssignedEmail({
  userId,
  server,
}: ServerAssignedEmailInput): Promise<void> {
  const prisma = getPrisma()
  const [user, organization] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.organization.findUnique({
      where: { id: server.organizationId },
      select: { name: true },
    }),
  ])

  if (!user) {
    return
  }

  const address = server.host
    ? `${server.sshUser}@${server.host}:${server.port}`
    : server.name

  try {
    await sendEmailFor(getApiAuth())({
      to: user.email,
      subject: `Le serveur ${server.name} vous est attribué`,
      text: [
        `Le serveur ${server.name} de l'organisation ${organization?.name ?? "votre organisation"} vous est attribué sur Pupitre.`,
        "",
        `Adresse : ${address}`,
        "",
        "Ouvrez l'app Pupitre : les clés de vos appareils y sont déjà déposées.",
      ].join("\n"),
    })
  } catch (error) {
    console.error(
      `[api] assignment email failed for server=${server.id}`,
      error
    )
  }
}
