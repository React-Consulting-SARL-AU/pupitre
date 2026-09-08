import { Dialog } from "@base-ui-components/react/dialog"
import { useRouterState } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ConsoleBrand } from "@/components/dashboard/console-brand"
import { SidebarContent } from "@/components/dashboard/sidebar-content"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"

export function MobileNav() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const seen = useRef(pathname)

  useEffect(() => {
    if (seen.current === pathname) {
      return
    }

    seen.current = pathname
    setOpen(false)
  }, [pathname])

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <div className="flex items-center justify-between gap-3 border-line border-b bg-surface px-4 py-3 lg:hidden">
        <ConsoleBrand />
        <Dialog.Trigger
          render={
            <Button
              aria-label={t("nav.openMenu")}
              className="w-9 px-0"
              icon={Menu}
              variant="ghost"
            />
          }
        />
      </div>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px] transition-fast data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 left-0 flex w-[min(288px,calc(100vw-48px))] flex-col bg-surface shadow-overlay outline-none transition-soft data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full">
          <Dialog.Title className="sr-only">{t("nav.mainMenu")}</Dialog.Title>
          <SidebarContent />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
