import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import type { AppUpdateState } from "@shared/app-update";
import { RefreshCw, RotateCw } from "lucide-react";

/**
 * Where the next version stands, and the two gestures it takes.
 *
 * A downloaded update used to wait in silence for the next quit: here it asks
 * to be installed. An update that could not be fetched says so, with the way
 * out; a build that does not update itself says that instead of a button that
 * would do nothing.
 */

function checkedLine(state: AppUpdateState, t: Translate): string | null {
  return state.checkedAt
    ? t("settings.about.checked", { since: since(Date.parse(state.checkedAt)) })
    : null;
}

export function SettingsAboutUpdate({
  state,
  onCheck,
  onInstall,
}: {
  state: AppUpdateState;
  onCheck: () => Promise<void>;
  onInstall: () => Promise<void>;
}) {
  const t = useTranslations();

  if (!state.updates) {
    return (
      <p className="text-ink-2 leading-relaxed" data-app-update="off">
        {t("settings.about.noSelfUpdate")}
      </p>
    );
  }

  if (state.status === "checking") {
    return (
      <div data-app-update={state.status}>
        <WaitingLine>{t("settings.about.checking")}</WaitingLine>
      </div>
    );
  }

  if (state.status === "available" || state.status === "downloading") {
    return (
      <div data-app-update={state.status}>
        <WaitingLine>
          {state.percent === undefined
            ? t("settings.about.downloading", { version: state.version ?? "" })
            : t("settings.about.downloadingAt", {
                percent: state.percent,
                version: state.version ?? "",
              })}
        </WaitingLine>
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div data-app-update={state.status}>
        <Callout
          action={
            <Button
              icon={RotateCw}
              onClick={onInstall}
              size="sm"
              variant="inverse"
            >
              {t("settings.about.restart")}
            </Button>
          }
          fix={t("settings.about.readyFix")}
          name="app-update"
          tone="ok"
        >
          {t("settings.about.ready", { version: state.version ?? "" })}
        </Callout>
      </div>
    );
  }

  const checked = checkedLine(state, t);

  return (
    <div className="flex flex-col gap-3" data-app-update={state.status}>
      {state.status === "error" ? (
        <Callout
          fix={t("settings.about.errorFix")}
          name="app-update"
          tone="danger"
        >
          {t("settings.about.error", { reason: state.error ?? "" })}
        </Callout>
      ) : (
        <p className="text-ink-2">{t("settings.about.upToDate")}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button icon={RefreshCw} onClick={onCheck} size="sm">
          {t("settings.about.check")}
        </Button>
        {checked ? (
          <span className="font-data text-[12px] text-ink-3">{checked}</span>
        ) : null}
      </div>
    </div>
  );
}
