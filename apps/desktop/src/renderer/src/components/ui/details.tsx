import { Collapsible } from "@base-ui-components/react/collapsible";
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
  onOpenChange,
  summary,
  children,
  className = "",
}: {
  /** The word on the fold; « Details » when nothing more specific is said. */
  label?: string;
  /** What is folded, for whoever has to find the fold. */
  name?: string;
  /** Opens the fold from the start, when what it holds must be read; with `onOpenChange`, holds it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** What stands on the fold's line after the word: a count, a state. */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations();

  const held = onOpenChange ? { onOpenChange, open: open ?? false } : {};

  return (
    <Collapsible.Root
      className={`group/details text-ink-3 text-small leading-relaxed ${className}`}
      data-details={name}
      defaultOpen={onOpenChange ? undefined : open}
      {...held}
    >
      <Collapsible.Trigger className="clickable -mx-1.5 inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-ink-2 transition-soft hover:bg-raised hover:text-ink">
        <ChevronRight
          aria-hidden="true"
          className="shrink-0 transition-soft group-data-[open]/details:rotate-90"
          size={13}
          strokeWidth={1.5}
        />
        <span>{label ?? t("common.details")}</span>
        {summary}
      </Collapsible.Trigger>
      <Collapsible.Panel className="mt-1" keepMounted>
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
