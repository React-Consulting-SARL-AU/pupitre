import type { ReactNode } from "react";
import { Label } from "./label";

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
  detail?: ReactNode;
  prose?: boolean;
  className?: string;
} & Record<`data-${string}`, string | number | undefined>) {
  const value = prose ? "text-ink-2" : "font-data text-small text-ink-2";

  return (
    <div className={`min-w-0 ${className}`} {...rest}>
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd className={`mt-1 break-words ${value}`}>{children}</dd>
      {detail ? (
        <dd className="mt-0.5 break-words font-data text-ink-3 text-small">
          {detail}
        </dd>
      ) : null}
    </div>
  );
}
