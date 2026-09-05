import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { DeviceCodeForm } from "@/components/auth/device-code-form"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle } from "@/lib/domain/page-titles"

interface DeviceSearch {
  user_code: string
}

export const Route = createFileRoute("/auth/device")({
  component: DevicePage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/auth/device", match.context.locale) }],
  }),
  validateSearch: (search: Record<string, unknown>): DeviceSearch => ({
    user_code: typeof search.user_code === "string" ? search.user_code : "",
  }),
})

function DevicePage() {
  const { user_code: userCode } = Route.useSearch()
  const t = useTranslations()

  return (
    <AuthCard
      description={t("auth.device.description")}
      title={t("auth.device.title")}
    >
      <DeviceCodeForm initialCode={userCode} />
    </AuthCard>
  )
}
