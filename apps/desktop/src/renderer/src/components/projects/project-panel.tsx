import { Label } from "@renderer/components/ui/label";
import type { ComponentType, ReactNode } from "react";

/** A titled block of the project's overview. */
export function ProjectPanel({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="elevation-raised rounded-md border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-ink-3">
        <Icon size={13} strokeWidth={1.5} />
        <Label>{label}</Label>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
