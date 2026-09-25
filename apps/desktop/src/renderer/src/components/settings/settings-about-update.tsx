import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import type { AppUpdateFailure, AppUpdateState } from "@shared/app-update";
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

function failureCopy(
  failure: AppUpdateFailure | undefined,
  version: string,
  t: Translate
): { line: string; fix: string } {
  if (failure === "refused") {
    return {
      fix: t("settings.about.refusedFix"),
      line: t("settings.about.refused", { version }),
    };
  }

  if (failure === "changed") {
    return {
      fix: t("settings.about.changedFix"),
      line: t("settings.about.changed"),
    };
  }

  return {
    fix: t("settings.about.failedFix"),
    line: t("settings.about.failed"),
  };
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

  if (state.status === "verifying") {
    return (
      <div data-app-update={state.status}>
        <WaitingLine>
          {t("settings.about.verifying", { version: state.version ?? "" })}
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
          bare
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
  const failure = failureCopy(state.failure, state.version ?? "", t);

  return (
    <div className="flex flex-col gap-3" data-app-update={state.status}>
      {state.status === "error" ? (
        <Callout bare fix={failure.fix} name="app-update" tone="danger">
          {failure.line}
        </Callout>
      ) : (
        <p className="text-ink-2">{t("settings.about.upToDate")}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button icon={RefreshCw} onClick={onCheck} size="sm">
          {t("settings.about.check")}
        </Button>
        {checked ? (
          <span className="font-data text-ink-3 text-small">{checked}</span>
        ) : null}
      </div>
    </div>
  );
}
