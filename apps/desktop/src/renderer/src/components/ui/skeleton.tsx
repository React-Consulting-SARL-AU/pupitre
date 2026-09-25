import { useTranslations } from "@renderer/i18n/use-translations";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-breathe rounded-sm bg-raised ${className}`}
    />
  );
}

const WIDTHS = ["w-2/5", "w-1/3", "w-1/2", "w-1/4"];

const FRAME =
  "elevation-raised overflow-hidden rounded-md border border-line bg-surface";

function counted(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

export function SkeletonRows({
  rows = 3,
  framed = true,
}: {
  rows?: number;
  framed?: boolean;
}) {
  const t = useTranslations();

  return (
    <div
      aria-busy="true"
      className={framed ? FRAME : ""}
      data-skeleton="rows"
      role="status"
    >
      <span className="sr-only">{t("common.loading")}</span>

      {counted(rows).map((row) => (
        <div
          className="flex items-center gap-3 border-line border-b px-4 py-3.5 last:border-b-0"
          key={row}
        >
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className={`h-3.5 ${WIDTHS[row % WIDTHS.length]}`} />
          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ cards = 2 }: { cards?: number }) {
  const t = useTranslations();

  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-gutter"
      data-skeleton="cards"
      role="status"
    >
      <span className="sr-only">{t("common.loading")}</span>

      {counted(cards).map((card) => (
        <div className={`${FRAME} flex flex-col gap-3 px-4 py-4`} key={card}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
