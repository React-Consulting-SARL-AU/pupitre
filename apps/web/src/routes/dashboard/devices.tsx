import { createFileRoute } from "@tanstack/react-router"
import { DeviceList } from "@/components/dashboard/device-list"
import { PageHeader } from "@/components/ui/page-header"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/devices")({
  component: DevicesPage,
})

function DevicesPage() {
  const { title, parents } = pageTitle("/dashboard/devices")

  return (
    <>
      <PageHeader
        description="Les appareils qui portent une de vos clés. C'est l'app Pupitre qui les enregistre ; ici, vous pouvez les révoquer."
        parents={parents}
        title={title}
      />
      <DeviceList />
    </>
  )
}
