import { Popover } from "@base-ui-components/react/popover";
import type { FieldHint } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ExternalLink, Info } from "lucide-react";
import { Tooltip } from "./tooltip";

export function Hint({ hint, label }: { hint: FieldHint; label: string }) {
  const t = useTranslations();

  const about = t("common.hint.about", { label });

  return (
    <Popover.Root>
      <Tooltip label={about}>
        <Popover.Trigger
          aria-label={about}
          className="clickable -m-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-1.5 text-ink-4 transition-fast hover:bg-raised hover:text-ink-2"
          data-hint={label}
        >
          <Info size={13} strokeWidth={1.5} />
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Positioner align="start" side="top" sideOffset={6}>
          <Popover.Popup className="elevation-raised z-50 max-w-xs rounded-md border border-line bg-surface p-3.5 text-ink-2 text-small leading-relaxed outline-none">
            <p className="break-words">{hint.text}</p>

            {hint.url ? (
              <a
                className="clickable mt-2.5 inline-flex items-center gap-1.5 text-ink underline underline-offset-2"
                href={hint.url}
                onClick={(event) => {
                  event.preventDefault();
                  window.pupitre.openUrl(hint.url ?? "");
                }}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={12} strokeWidth={1.5} />
                {t("common.hint.open")}
              </a>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
