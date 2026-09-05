import { useMutation } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import { authClient } from "@/lib/auth/client"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/auth/invitation/$id")({
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
        throw new Error(t("auth.invitation.failed"))
      }
    },
    onSuccess: () => navigate({ to: "/dashboard/servers" }),
  })

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
            fix={t("auth.invitation.failedFix")}
            title={accept.error.message}
            tone="danger"
          />
        ) : null}
      </div>
    </AuthCard>
  )
}
