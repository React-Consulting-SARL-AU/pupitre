import { STEP_COLUMN } from "@renderer/lib/layout";
import type { ReactNode } from "react";
import { PageHeader, type PageHeaderProps } from "./page-header";

export function Screen({
  tabs,
  fill = false,
  column = false,
  plain = false,
  footer,
  children,
  ...header
}: PageHeaderProps & {
  tabs?: ReactNode;
  /** The body takes the height left under the header instead of scrolling. */
  fill?: boolean;
  column?: boolean;
  /** The header sits on the page, with no band of its own. */
  plain?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const inner = column ? STEP_COLUMN : "px-8";
  const band = plain
    ? "pt-10 pb-2"
    : `border-line bg-surface pt-5 ${tabs ? "" : "border-b pb-6"}`;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-screen={fill ? "fill" : "scroll"}
    >
      <div className={`shrink-0 ${band}`}>
        <div className={inner}>
          <PageHeader {...header} />
          {tabs ? <div className="mt-4">{tabs}</div> : null}
        </div>
      </div>

      {fill ? (
        <div className="min-h-0 flex-1 bg-base">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-base">
          <div className="flex min-h-full flex-col">
            <div className={`${inner} flex flex-1 flex-col gap-section py-8`}>
              {children}
            </div>
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}
