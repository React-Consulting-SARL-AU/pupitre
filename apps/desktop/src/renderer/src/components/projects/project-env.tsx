import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { dirnameOf } from "@renderer/lib/files";
import type { EnvState } from "@renderer/stores/project";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useState } from "react";

export const ENV_PREVIEW_KEYS = 4;

// Only key names cross the channel, never values, so none can show here by accident.
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
      <WaitingLine className="font-data text-small">
        {t("project.env.reading")}
      </WaitingLine>
    );
  }

  if (state.status === "failed") {
    return <ErrorNotice bare error={state.error} onRetry={onRead} />;
  }

  const { env } = state;

  if (!env.template && env.keys.length === 0) {
    return (
      <div className="flex flex-col gap-1" data-env="none">
        <p className="text-control text-ink-2">{t("project.env.none")}</p>
        <p className="text-ink-3 text-small leading-relaxed">
          {t("project.env.noneHow", { folder: dirnameOf(env.path) })}
        </p>
      </div>
    );
  }

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
      <p className="break-all font-data text-ink-3 text-small">{env.path}</p>

      {env.keys.length === 0 ? (
        <p className="text-control text-ink-3">{t("project.env.noKeys")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="font-data text-caption text-ink-3">
            {t.plural("project.env.keyCount", env.keys.length)}
          </p>

          <ul className="flex flex-wrap gap-1.5">
            {shown.map((key) => (
              <li
                className="rounded-full border border-line px-2 py-0.5 font-data text-caption text-ink-2"
                key={key}
              >
                {key}
              </li>
            ))}
            {hidden > 0 ? (
              <li className="rounded-full border border-line border-dashed px-2 py-0.5 font-data text-caption text-ink-3">
                {t("project.env.more", { count: hidden })}
              </li>
            ) : null}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {env.written ? (
          <span className="font-data text-caption text-ink-3">
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

        {env.template ? (
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
        ) : null}
      </div>
    </div>
  );
}
