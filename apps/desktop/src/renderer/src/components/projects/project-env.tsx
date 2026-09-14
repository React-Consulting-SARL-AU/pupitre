import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { EnvState } from "@renderer/stores/project";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useState } from "react";

/** How many keys the panel shows before it asks to be opened. */
export const ENV_PREVIEW_KEYS = 4;

/**
 * The environment file of a project, by the names of its keys and nothing else.
 *
 * The agent writes `.env.local` from the project's template and answers with
 * the keys it holds: a value never crosses the channel, so a screen cannot
 * show one by accident. A file of forty keys would bury the panel, so it opens
 * on a count and the first few names, and the whole list is one click away.
 * Writing it again is a gesture that overwrites what a reader may have edited
 * by hand on the server, which is why it is asked twice.
 */
export function ProjectEnv({
  state,
  onRead,
  onRegenerate,
}: {
  state: EnvState;
  onRead: () => void;
  onRegenerate: () => Promise<void>;
}) {
  const t = useTranslations();

  const [expanded, setExpanded] = useState(false);

  if (state.status === "idle" || state.status === "reading") {
    return (
      <WaitingLine className="font-data text-[12px]">
        {t("project.env.reading")}
      </WaitingLine>
    );
  }

  if (state.status === "failed") {
    return <ErrorNotice error={state.error} onRetry={onRead} />;
  }

  const { env } = state;
  const foldable = env.keys.length > ENV_PREVIEW_KEYS;
  const shown =
    foldable && !expanded ? env.keys.slice(0, ENV_PREVIEW_KEYS) : env.keys;
  const hidden = env.keys.length - shown.length;

  return (
    <div
      className="flex flex-col gap-2.5"
      data-env-expanded={foldable ? expanded : undefined}
      data-env-keys={env.keys.length}
    >
      <p className="truncate font-data text-[12px] text-ink-3" title={env.path}>
        {env.path}
      </p>

      {env.keys.length === 0 ? (
        <p className="text-[13px] text-ink-3">{t("project.env.noKeys")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="font-data text-[11px] text-ink-3">
            {t.plural("project.env.keyCount", env.keys.length)}
          </p>

          <ul className="flex flex-wrap gap-1.5">
            {shown.map((key) => (
              <li
                className="rounded-full border border-line px-2 py-0.5 font-data text-[11px] text-ink-2"
                key={key}
              >
                {key}
              </li>
            ))}
            {hidden > 0 ? (
              <li className="rounded-full border border-line border-dashed px-2 py-0.5 font-data text-[11px] text-ink-3">
                {t("project.env.more", { count: hidden })}
              </li>
            ) : null}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {env.written ? (
          <span className="font-data text-[11px] text-ink-3">
            {t("project.env.writtenNow")}
          </span>
        ) : null}

        {foldable ? (
          <Button
            className="ml-auto"
            icon={expanded ? ChevronUp : ChevronDown}
            onClick={() => setExpanded((open) => !open)}
            size="sm"
            variant="discreet"
          >
            {expanded ? t("project.env.showLess") : t("project.env.showAll")}
          </Button>
        ) : null}

        <ConfirmButton
          className={foldable ? "" : "ml-auto"}
          confirmLabel={t("project.env.regenerate")}
          icon={RefreshCw}
          onConfirm={onRegenerate}
          question={t("project.env.regenerateQuestion")}
          size="sm"
          variant="default"
        >
          {t("project.env.regenerate")}
        </ConfirmButton>
      </div>
    </div>
  );
}
