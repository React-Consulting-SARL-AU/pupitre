import type { ReactNode } from "react";
import { Label } from "./label";

/**
 * Facts read in columns: a caption, the value under it, a detail under that.
 *
 * An address, an organization, a fingerprint, a command: wherever a screen
 * lays out what it knows, it is this grid, so the reader's eye finds the
 * caption at the same height and the value in the same ink from one page to
 * the next.
 */
export function FactList({
  children,
  columns = 2,
  className = "",
}: {
  children: ReactNode;
  columns?: 2 | 3;
  className?: string;
}) {
  const grid = columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <dl className={`grid gap-x-6 gap-y-4 ${grid} ${className}`}>{children}</dl>
  );
}

export function Fact({
  label,
  children,
  detail,
  prose = false,
  className = "",
  ...rest
}: {
  label: string;
  children: ReactNode;
  /** What qualifies the value, in a fainter ink under it. */
  detail?: ReactNode;
  /** A name or a sentence reads in the interface face; everything else is data. */
  prose?: boolean;
  className?: string;
} & Record<`data-${string}`, string | number | undefined>) {
  const value = prose ? "text-ink-2" : "font-data text-[12px] text-ink-2";

  return (
    <div className={`min-w-0 ${className}`} {...rest}>
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd className={`mt-1 break-words ${value}`}>{children}</dd>
      {detail ? (
        <dd className="mt-0.5 break-words font-data text-[12px] text-ink-3">
          {detail}
        </dd>
      ) : null}
    </div>
  );
}
