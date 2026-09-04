import { Label } from "@renderer/components/ui/label";
import type { ReactNode } from "react";

/** The first plane of the menu: a group caption, in spaced capitals. */
export function SidebarGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between px-3 pt-6 pb-2">
        <Label>{title}</Label>
        {action}
      </div>
      <div className="flex flex-col gap-0.5 px-2">{children}</div>
    </section>
  );
}
