import { createFileRoute } from "@tanstack/react-router"
import { DeviceList } from "@/components/dashboard/device-list"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { PageSkeleton } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { devicesQueryOptions } from "@/lib/api/queries"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/devices"

export const Route = createFileRoute("/dashboard/devices")({
  component: DevicesPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(devicesQueryOptions()),
  pendingComponent: DevicesPending,
})

function DevicesPending() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <PageSkeleton
      description={t("page.devices.description")}
      parents={parents}
      shape="rows"
      title={t(title)}
    />
  )
}

function DevicesPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

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
