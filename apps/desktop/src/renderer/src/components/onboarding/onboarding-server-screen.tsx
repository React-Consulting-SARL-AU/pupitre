import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useServers } from "../../stores/servers";
import { ServersPanel } from "../servers/servers-panel";
import { Button } from "../ui/button";
import { PageHeader } from "../ui/page-header";

/**
 * The first step: the machine to drive, and the key that opens it.
 *
 * The step does not walk itself: the key the app just made has to be pasted on
 * the server before anything can answer, and only the reader knows when that is
 * done.
 */
export function OnboardingServerScreen({
  onContinue,
}: {
  onContinue: (serverId: string) => void;
}) {
  const t = useTranslations();

  const config = useServers((state) => state.config);
  const load = useServers((state) => state.load);

  useEffect(() => {
    load();
  }, [load]);

  const active = config?.active ?? null;
  const server = config?.servers.find((candidate) => candidate.id === active);

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        actions={
          <Button
            disabled={!active}
            icon={ArrowRight}
            onClick={() => active && onContinue(active)}
            variant="inverse"
          >
            {server
              ? t("onboarding.server.inspectNamed", { name: server.name })
              : t("onboarding.server.inspect")}
          </Button>
        }
        description={t("onboarding.server.description")}
        eyebrow={t("onboarding.server.eyebrow")}
        title={t("onboarding.server.title")}
      />

      <ServersPanel />
    </section>
  );
}
