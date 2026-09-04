import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowLeft, Download } from "lucide-react";
import type { ReactNode } from "react";
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
  notice,
  only,
  submitLabel,
  onMachineName,
  onBack,
  onInstall,
}: {
  serverName?: string;
  machineName: string;
  /** Said above the questions when something explains why they are asked. */
  notice?: ReactNode;
  /** The modules to ask about, when the screen is opened for one of them. */
  only?: readonly string[];
  submitLabel?: string;
  onMachineName?: (name: string) => void;
  onBack?: () => void;
  onInstall?: () => void;
}) {
  const t = useTranslations();

  const groups = useCatalog((state) => state.groups);
  const values = useCatalog((state) => state.values);
  const secrets = useCatalog((state) => state.secrets);
  const setValue = useCatalog((state) => state.setValue);
  const setSecret = useCatalog((state) => state.setSecret);
  const generate = useCatalog((state) => state.generate);
  const reveal = useCatalog((state) => state.reveal);

  function asked() {
    return only
      ? groups().filter((group) => only.includes(group.module.id))
      : groups();
  }

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
    <section className="flex flex-col gap-section">
      <PageHeader
        actions={
          <>
            {onBack ? (
              <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
                {t("config.back")}
              </Button>
            ) : null}
            <Button icon={Download} onClick={onInstall} variant="inverse">
              {submitLabel ?? t("config.install")}
            </Button>
          </>
        }
        description={t("config.description")}
        eyebrow={t("config.eyebrow")}
        title={serverName ?? t("config.thisServer")}
      />

      {notice}

      <Callout tone="info">{t("config.secretsNotice")}</Callout>

      <ConfigForm
        groups={asked()}
        handlersFor={handlersFor}
        machineName={machineName}
        onMachineName={onMachineName}
        secrets={secrets}
        values={values}
      />
    </section>
  );
}
