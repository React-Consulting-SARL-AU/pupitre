import { SidebarContent } from "@/components/dashboard/sidebar-content"

export function DashboardSidebar() {
  return (
    <aside className="sticky top-0 hidden max-h-dvh w-[264px] shrink-0 flex-col border-line border-r bg-surface lg:flex">
      <SidebarContent />
    </aside>
  )
}
