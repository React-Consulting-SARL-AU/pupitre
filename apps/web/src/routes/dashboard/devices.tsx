import { createFileRoute } from "@tanstack/react-router"
import { DeviceList } from "@/components/dashboard/device-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/devices")({
  component: DevicesPage,
})

function DevicesPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/devices")

  return (
    <>
      <PageHeader
        description={t("page.devices.description")}
        parents={parents}
        title={t(title)}
      />
      <DeviceList />
    </>
  )
}
