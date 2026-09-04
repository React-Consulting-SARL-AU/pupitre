import type { ReactNode } from "react";
import type { ButtonIcon } from "./button";

/**
 * Nothing to show, and why.
 *
 * `detail` says what would put something here, so an empty panel never leaves
 * the reader guessing whether it is empty or broken.
 */
export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon?: ButtonIcon;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center px-8 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        {Icon ? (
          <Icon className="text-ink-3" size={18} strokeWidth={1.5} />
        ) : null}
        <p className="text-[12px] text-ink-3">{title}</p>
        {detail ? (
          <p className="font-data text-[11px] text-ink-3">{detail}</p>
        ) : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}
