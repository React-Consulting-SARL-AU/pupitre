import type { ReactNode } from "react";
import { Label } from "../ui/label";

/** One fact of a server, as a term and its value. */
export function ServerRowDetail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd className="break-all font-data text-[12px] text-ink-2">{children}</dd>
    </div>
  );
}
