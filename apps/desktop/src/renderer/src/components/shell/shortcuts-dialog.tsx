import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isMac } from "@renderer/lib/platform";
import { type ShortcutLine, shortcutSheet } from "@renderer/lib/shortcut-sheet";
import { useMemo } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Kbd } from "../ui/kbd";
import { Section } from "../ui/section";

/**
 * Every shortcut of the app on one sheet, opened by the menu or by ⌘/.
 *
 * Each control already prints its own chord in its bubble; the sheet is
 * where a reader learns them all at once, written for their keyboard.
 */
export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const groups = useMemo(() => shortcutSheet(isMac), []);

  function keysOf(line: ShortcutLine) {
    const [from, to] = line.keys;

    if (!to) {
      return <Kbd>{from}</Kbd>;
    }

    return (
      <>
        <span className="sr-only">{t("shortcuts.range", { from, to })}</span>
        <span aria-hidden="true" className="flex items-center gap-1">
          <Kbd>{from}</Kbd>
          <span className="text-ink-4">…</span>
          <Kbd>{to}</Kbd>
        </span>
      </>
    );
  }

  return (
    <Dialog
      actions={
        <Button onClick={onClose} size="sm" variant="discreet">
          {t("shortcuts.close")}
        </Button>
      }
      name="shortcuts"
      onClose={onClose}
      open={open}
      title={t("shortcuts.title")}
      width="wide"
    >
      <section
        aria-label={t("shortcuts.title")}
        className="grid max-h-[70vh] gap-6 overflow-y-auto sm:grid-cols-2"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a list that scrolls must be reachable by the keyboard, or nothing below the fold can be read
        tabIndex={0}
      >
        {groups.map((group) => (
          <Section
            key={group.name}
            name={group.name}
            title={t(`shortcuts.group.${group.name}`)}
          >
            <dl className="flex flex-col gap-2">
              {group.shortcuts.map((line) => (
                <div
                  className="flex items-center justify-between gap-4 text-[13px]"
                  key={line.name}
                >
                  <dt className="text-ink-2">
                    {t(`shortcuts.${group.name}.${line.name}` as DictionaryKey)}
                  </dt>
                  <dd className="shrink-0">{keysOf(line)}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ))}
      </section>
    </Dialog>
  );
}
