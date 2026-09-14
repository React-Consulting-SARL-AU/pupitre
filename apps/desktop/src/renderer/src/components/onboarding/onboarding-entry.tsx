import { useTranslations } from "@renderer/i18n/use-translations";
import type { Server } from "@shared/servers";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { probeOf } from "../../stores/inspection";
import { savedOnboarding, useOnboarding } from "../../stores/onboarding";
import { Button } from "../ui/button";
import { StatusDot } from "../ui/status-dot";

/**
 * The way into the onboarding, at the foot of the server's own row.
 *
 * It shows itself only when nothing says this machine already runs the agent:
 * a session the app has opened, or a probe that read a version off it. An
 * onboarding left half-way is offered back rather than started over. The row
 * above already names the machine, so the line says only what it lacks.
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

  // A sequence that reached its end is not one to come back to: `resume` refuses
  // a finished shelf, so offering it would put a button here that answers nothing.
  const unfinished = saved?.serverId === server.id && saved.step !== "done";

  if (step !== "closed" || (managed && !unfinished)) {
    return null;
  }

  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-3 border-line border-t pt-4"
      data-onboarding-entry={unfinished ? "unfinished" : "bare"}
    >
      <StatusDot shape="empty" size={11} />
      <p className="min-w-0 flex-1 text-ink-2">
        {unfinished
          ? t("onboarding.entry.unfinished")
          : t("onboarding.entry.noAgent")}
      </p>
      <Button
        icon={Download}
        onClick={() => (unfinished ? resume() : begin(server.id))}
        size="sm"
        variant="inverse"
      >
        {unfinished
          ? t("onboarding.entry.resume")
          : t("onboarding.entry.install")}
      </Button>
    </div>
  );
}
