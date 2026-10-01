import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { DeviceCodeForm } from "@/components/auth/device-code-form"
import { useTranslations } from "@/hooks/use-locale"
import { requireSessionAndConsent } from "@/lib/auth/session-gate"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/auth/device")({
  // The session lives in whatever browser the app opened, so it is read client-side.
  ssr: false,
  beforeLoad: requireSessionAndConsent,
  component: DevicePage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/auth/device", match.context.locale) }],
  }),
})

function DevicePage() {
  const t = useTranslations()

  return (
    <AuthCard
      description={t("auth.device.description")}
      title={t("auth.device.title")}
    >
      <DeviceCodeForm />
    </AuthCard>
  )
}
