import { useTranslations } from "@renderer/i18n/use-translations";
import type { Server } from "@shared/servers";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { probeOf } from "../../stores/inspection";
import { savedOnboarding, useOnboarding } from "../../stores/onboarding";
import { Button } from "../ui/button";
import { StatusDot } from "../ui/status-dot";

/**
 * The way into the onboarding, from the screen where the servers live.
 *
 * It shows itself only when nothing says this machine already runs the agent:
 * a session the app has opened, or a probe that read a version off it. An
 * onboarding left half-way is offered back rather than started over.
 */
export function OnboardingEntry({ server }: { server: Server }) {
  const t = useTranslations();

  const step = useOnboarding((state) => state.step);
  const begin = useOnboarding((state) => state.begin);
  const resume = useOnboarding((state) => state.resume);

  const [managed, setManaged] = useState(true);

  useEffect(() => {
    let dropped = false;

    window.pupitre.agentSession(server.id).then((session) => {
      const probe = probeOf(server.id);

      if (!dropped) {
        setManaged(Boolean(session) || Boolean(probe?.agent_version));
      }
    });

    return () => {
      dropped = true;
    };
  }, [server.id]);

  const saved = savedOnboarding();
  const unfinished = saved?.serverId === server.id;

  if (step !== "closed" || (managed && !unfinished)) {
    return null;
  }

  return (
    <div className="elevation-raised flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <StatusDot shape="empty" size={11} />
      <div className="min-w-0 flex-1">
        <p className="text-ink">
          {unfinished
            ? t("onboarding.entry.unfinished", { name: server.name })
            : t("onboarding.entry.noAgent", { name: server.name })}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-3 leading-relaxed">
          {t("onboarding.entry.detail")}
        </p>
      </div>
      <Button
        icon={Download}
        onClick={() => (unfinished ? resume() : begin(server.id))}
        variant="inverse"
      >
        {unfinished
          ? t("onboarding.entry.resume")
          : t("onboarding.entry.install")}
      </Button>
    </div>
  );
}
