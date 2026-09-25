import { useTranslations } from "@renderer/i18n/use-translations";
import { ShieldAlert } from "lucide-react";
import type { HostKeyState } from "../../stores/servers";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";
import { HostKeyFingerprint } from "./host-key-fingerprint";

/** No "continue anyway": the app cannot tell a reinstallation from an impostor. */
export function HostKeyAlert({
  state,
  serverName,
  busy,
  onReinstalled,
  onCancel,
}: {
  state: Extract<HostKeyState, { status: "changed" }>;
  serverName: string;
  busy: boolean;
  onReinstalled: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <Panel className="fade-in">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className="mt-0.5 shrink-0 text-danger"
          size={16}
          strokeWidth={1.5}
        />

        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-ink">
            {t("servers.hostKey.title", { name: serverName })}
          </h3>
          <p className="mt-1.5 text-ink-2 leading-relaxed">
            {t(state.phrase.id as never, state.phrase.values)}
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <HostKeyFingerprint
              label={t("servers.hostKey.expected")}
              value={state.expected}
            />
            <HostKeyFingerprint
              label={t("servers.hostKey.observed")}
              value={state.observed ?? t("servers.hostKey.observedMissing")}
            />
          </div>

          <p className="mt-5 font-medium text-ink leading-relaxed">
            {t(`${state.phrase.id}.fix` as never, state.phrase.values)}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button loading={busy} onClick={onReinstalled} variant="danger">
              {t("servers.hostKey.reinstalled")}
            </Button>
            <Button onClick={onCancel} variant="discreet">
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
