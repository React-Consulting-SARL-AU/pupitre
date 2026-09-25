import { Collapsible } from "@base-ui-components/react/collapsible";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function Details({
  label,
  name,
  open,
  onOpenChange,
  summary,
  children,
  className = "",
}: {
  label?: string;
  name?: string;
  /** Initial state, or the controlled state once `onOpenChange` is given. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
