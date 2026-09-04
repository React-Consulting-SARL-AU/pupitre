import { ArrowLeft, Download } from "lucide-react";
import { useCatalog } from "../../stores/catalog";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import type { FieldHandlers } from "./config-field-control";
import { ConfigForm } from "./config-form";

/**
 * The questions the chosen modules ask, and the answers on their way out.
 *
 * Ordinary values stay in the store, where the install will read them. Secrets
 * never land there: each keystroke goes to the main process, which keeps it
 * until the install writes it on the protocol's secret line.
 */
export function ConfigScreen({
  serverName,
  machineName,
  onMachineName,
  onBack,
  onInstall,
}: {
  serverName?: string;
  machineName: string;
  onMachineName?: (name: string) => void;
  onBack?: () => void;
  onInstall?: () => void;
}) {
  const groups = useCatalog((state) => state.groups);
  const values = useCatalog((state) => state.values);
  const secrets = useCatalog((state) => state.secrets);
  const setValue = useCatalog((state) => state.setValue);
  const setSecret = useCatalog((state) => state.setSecret);
  const generate = useCatalog((state) => state.generate);
  const reveal = useCatalog((state) => state.reveal);

  function handlersFor(moduleId: string): FieldHandlers {
    return {
      onValue: (key, value) => setValue(moduleId, key, value),
      onSecret: (key, value) => {
        setSecret(moduleId, key, value);
      },
      onGenerate: (key) => {
        generate(moduleId, key);
      },
      onReveal: (key) => reveal(moduleId, key),
    };
  }

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        actions={
          <>
            <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
              Revenir au catalogue
            </Button>
            <Button icon={Download} onClick={onInstall} variant="inverse">
              Installer
            </Button>
          </>
        }
        description="Les questions viennent des manifestes des modules choisis."
        eyebrow="Configuration"
        title={serverName ?? "Ce serveur"}
      />

      <Callout tone="info">
        Les mots de passe et les jetons ne sont jamais enregistrés par l'app :
        ils partent sur le flux secret au moment de l'installation, puis sont
        oubliés.
      </Callout>

      <ConfigForm
        groups={groups()}
        handlersFor={handlersFor}
        machineName={machineName}
        onMachineName={onMachineName}
        secrets={secrets}
        values={values}
      />
    </section>
  );
}
