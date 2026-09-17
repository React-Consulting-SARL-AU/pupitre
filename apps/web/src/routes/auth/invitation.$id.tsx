import { useMutation } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import { authClient } from "@/lib/auth/client"
import { requireSession } from "@/lib/auth/session-gate"
import {
  type InvitationRefusal,
  invitationRefusalOf,
} from "@/lib/domain/invitation"
import { documentTitle } from "@/lib/domain/page-titles"

class InvitationRefusedError extends Error {
  readonly refusal: InvitationRefusal

  constructor(refusal: InvitationRefusal) {
    super(refusal.title)
    this.name = "InvitationRefusedError"
    this.refusal = refusal
  }
}

export const Route = createFileRoute("/auth/invitation/$id")({
  /** The link lands in whatever browser the person uses: the session is read there, and sign-in comes back here. */
  ssr: false,
  beforeLoad: requireSession,
  component: InvitationPage,
  head: ({ match }) => ({
    meta: [
      { title: documentTitle("/auth/invitation/$id", match.context.locale) },
    ],
  }),
})

function InvitationPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await authClient().organization.acceptInvitation({
        invitationId: id,
      })

      if (error) {
        throw new InvitationRefusedError(invitationRefusalOf(error.code))
      }
    },
    onSuccess: () => navigate({ to: "/dashboard/servers" }),
  })
  const refusal =
    accept.error instanceof InvitationRefusedError
      ? accept.error.refusal
      : invitationRefusalOf(null)

  return (
    <AuthCard
      description={t("auth.invitation.description")}
      title={t("auth.invitation.title")}
    >
      <div className="flex flex-col gap-3">
        <Button
          disabled={accept.isPending}
          onClick={() => {
            accept.mutate()
          }}
          variant="primary"
        >
          {accept.isPending
            ? t("auth.invitation.accepting")
            : t("auth.invitation.accept")}
        </Button>
        {accept.isError ? (
          <Callout
            fix={t(refusal.fix)}
            title={t(refusal.title)}
            tone="danger"
          />
        ) : null}
      </div>
    </AuthCard>
  )
}
