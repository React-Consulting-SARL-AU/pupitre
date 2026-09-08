import { Popover } from "@base-ui-components/react/popover";
import type { FieldHint } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ExternalLink, Info } from "lucide-react";

/**
 * The long form of a field's help, behind a bubble.
 *
 * What decides is read without a gesture — a caption, a reason, an error. This
 * carries the rest: where a value is found, which permissions a token needs,
 * what it costs to get it wrong. It opens on a click and on a key, never on a
 * hover alone, and its target is the twenty-eight pixels around the glyph.
 */
export function Hint({ hint, label }: { hint: FieldHint; label: string }) {
  const t = useTranslations();

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t("common.hint.about", { label })}
        className="clickable -m-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-1.5 text-ink-4 transition-fast hover:bg-raised hover:text-ink-2"
        data-hint={label}
      >
        <Info size={13} strokeWidth={1.5} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner align="start" side="top" sideOffset={6}>
          <Popover.Popup className="elevation-raised z-50 max-w-xs rounded-md border border-line bg-surface p-3.5 text-[12px] text-ink-2 leading-relaxed outline-none">
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
