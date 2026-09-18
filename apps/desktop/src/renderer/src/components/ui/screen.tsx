import { STEP_COLUMN } from "@renderer/lib/layout";
import type { ReactNode } from "react";
import { PageHeader, type PageHeaderProps } from "./page-header";

/**
 * The frame every page of the shell is read in.
 *
 * The header is a band of its own, on `surface` like the sidebar, closed by a
 * line: the title, the state and the controls stand there whatever the page
 * says below, and stay in place while the body scrolls under them. A page is
 * told apart by what it says, not by where it starts. When the page has tabs,
 * they sit at the foot of the band and their line closes it.
 *
 * A step of a sequence is read as one column: the band runs from edge to
 * edge, what it holds lines up with the column, and the bar the step ends on
 * runs under the column from edge to edge too. A sequence whose shell already
 * says where the reader is — the onboarding, with its rail — reads its header
 * on the page itself rather than on a band of its own.
 */
export function Screen({
  tabs,
  fill = false,
  column = false,
  plain = false,
  footer,
  children,
  ...header
}: PageHeaderProps & {
  /** The row of tabs under the title, when the page has several faces. */
  tabs?: ReactNode;
  /** The body takes the height left under the header instead of scrolling. */
  fill?: boolean;
  /** The header's content and the body are held to the step column. */
  column?: boolean;
  /** The header sits on the page, with no band of its own under it. */
  plain?: boolean;
  /** The bar the page ends on, held at the bottom of the body. */
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
