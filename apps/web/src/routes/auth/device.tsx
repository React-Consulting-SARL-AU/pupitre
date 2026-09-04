import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { DeviceCodeForm } from "@/components/auth/device-code-form"
import { documentTitle } from "@/lib/domain/page-titles"

interface DeviceSearch {
  user_code: string
}

export const Route = createFileRoute("/auth/device")({
  component: DevicePage,
  head: () => ({ meta: [{ title: documentTitle("/auth/device") }] }),
  validateSearch: (search: Record<string, unknown>): DeviceSearch => ({
    user_code: typeof search.user_code === "string" ? search.user_code : "",
  }),
})

function DevicePage() {
  const { user_code: userCode } = Route.useSearch()

  return (
    <AuthCard
      description="Entrez le code que votre appareil affiche, puis confirmez. C'est ce qui lui ouvre une session."
      title="Confirmer un appareil"
    >
      <DeviceCodeForm initialCode={userCode} />
    </AuthCard>
  )
}
