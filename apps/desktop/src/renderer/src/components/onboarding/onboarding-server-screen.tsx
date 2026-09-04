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
  const config = useServers((state) => state.config);
  const load = useServers((state) => state.load);

  useEffect(() => {
    load();
  }, [load]);

  const active = config?.active ?? null;
  const server = config?.servers.find((candidate) => candidate.id === active);

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        actions={
          <Button
            disabled={!active}
            icon={ArrowRight}
            onClick={() => active && onContinue(active)}
            variant="inverse"
          >
            {server ? `Inspecter ${server.name}` : "Inspecter le serveur"}
          </Button>
        }
        description="Une adresse, un compte, et une clé que l'app génère pour cet ordinateur. Colle la clé sur le serveur avant de continuer."
        eyebrow="Serveur"
        title="La machine à installer"
      />

      <ServersPanel />
    </section>
  );
}
