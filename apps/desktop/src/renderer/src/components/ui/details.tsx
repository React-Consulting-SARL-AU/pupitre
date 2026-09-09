import { useTranslations } from "@renderer/i18n/use-translations";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The how, folded away under a word that looks like what it is.
 *
 * What a screen says out loud is what happens for the reader; a path, a
 * checksum, an identifier decide nothing for them and would read as a manual.
 * They stay reachable — one click, one key — and closed by default. The
 * chevron says the word opens something, and turns once it has.
 */
export function Details({
  label,
  name,
  open,
  children,
  className = "",
}: {
  /** The word on the fold; « Details » when nothing more specific is said. */
  label?: string;
  /** What is folded, for whoever has to find the fold. */
  name?: string;
  /** Opens the fold from the start, when what it holds must be read. */
  open?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations();

  return (
    <details
      className={`group text-[12px] text-ink-3 leading-relaxed ${className}`}
      data-details={name}
      open={open || undefined}
    >
      <summary className="clickable -mx-1.5 inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-ink-2 transition-soft hover:bg-raised hover:text-ink">
        <ChevronRight
          aria-hidden="true"
          className="shrink-0 transition-soft group-open:rotate-90"
          size={13}
          strokeWidth={1.5}
        />
        <span>{label ?? t("common.details")}</span>
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}
