import { useMutation } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { authClient } from "@/lib/auth/client"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/auth/invitation/$id")({
  component: InvitationPage,
  head: () => ({ meta: [{ title: documentTitle("/auth/invitation/$id") }] }),
})

function InvitationPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await authClient().organization.acceptInvitation({
        invitationId: id,
      })

      if (error) {
        throw new Error(
          "Cette invitation n'a pas pu être acceptée. Elle a peut-être expiré."
        )
      }
    },
    onSuccess: () => navigate({ to: "/dashboard/servers" }),
  })

  return (
    <AuthCard
      description="Rejoignez cette organisation pour voir ses serveurs."
      title="Invitation"
    >
      <div className="flex flex-col gap-3">
        <Button
          disabled={accept.isPending}
          onClick={() => {
            accept.mutate()
          }}
          variant="primary"
        >
          {accept.isPending ? "Acceptation…" : "Accepter l'invitation"}
        </Button>
        {accept.isError ? (
          <Callout
            fix="Demandez une nouvelle invitation à l'administrateur de l'organisation."
            title={accept.error.message}
            tone="danger"
          />
        ) : null}
      </div>
    </AuthCard>
  )
}
