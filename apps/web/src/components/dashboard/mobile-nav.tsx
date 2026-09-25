import { useRouterState } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ConsoleBrand } from "@/components/dashboard/console-brand"
import { SidebarContent } from "@/components/dashboard/sidebar-content"
import { Button } from "@/components/ui/button"
import { DialogPopup, DialogRoot, DialogTrigger } from "@/components/ui/dialog"
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
    <DialogRoot onOpenChange={setOpen} open={open}>
      <div className="flex items-center justify-between gap-3 border-line border-b bg-surface px-4 py-3 lg:hidden">
        <ConsoleBrand />
        <DialogTrigger
          render={
            <Button
              aria-label={t("nav.openMenu")}
              className="w-9 px-0"
              icon={Menu}
              title={t("nav.openMenu")}
              variant="ghost"
            />
          }
        />
      </div>

      <DialogPopup
        placement="start"
        size="nav"
        title={t("nav.mainMenu")}
        titleHidden
      >
        <SidebarContent />
      </DialogPopup>
    </DialogRoot>
  )
}
