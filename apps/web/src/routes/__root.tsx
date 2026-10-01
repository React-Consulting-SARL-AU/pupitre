import type { Locale } from "@pupitre/shared/i18n"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  useRouterState,
} from "@tanstack/react-router"
import type { ReactNode } from "react"
import { ConsoleFooter } from "@/components/ui/console-footer"
import { WebAnalyticsBeacon } from "@/components/ui/web-analytics-beacon"
import { LocaleProvider } from "@/hooks/use-locale"
import { sidebarCarriesChrome } from "@/lib/domain/chrome"
import { readLocale } from "@/lib/i18n/locale"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"
import "@/styles/globals.css"

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: (): { locale: Locale } => ({ locale: readLocale() }),
  component: RootComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { content: "light dark", name: "color-scheme" },
      { title: "Pupitre" },
    ],
    links: [
      { href: "/favicon.ico", rel: "icon", sizes: "32x32" },
      { href: "/favicon.svg", rel: "icon", type: "image/svg+xml" },
      { href: "/apple-touch-icon.png", rel: "apple-touch-icon" },
      { href: "/site.webmanifest", rel: "manifest" },
    ],
  }),
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  const { locale } = Route.useRouteContext()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <html lang={locale}>
      <head>
        <ScriptOnce>{THEME_BOOT_SCRIPT}</ScriptOnce>
        <HeadContent />
      </head>
      <body className="flex min-h-dvh flex-col bg-base text-ink">
        <LocaleProvider initial={locale}>
          <div className="flex flex-1 flex-col">{children}</div>
          {sidebarCarriesChrome(pathname) ? null : <ConsoleFooter />}
        </LocaleProvider>
        <WebAnalyticsBeacon />
        <Scripts />
      </body>
    </html>
  )
}
