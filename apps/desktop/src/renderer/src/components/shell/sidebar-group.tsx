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
      <div className="flex items-center justify-between px-3 pt-5 pb-1.5">
        <Label>{title}</Label>
        {action}
      </div>
      <div className="flex flex-col gap-px px-2">{children}</div>
    </section>
  );
}
