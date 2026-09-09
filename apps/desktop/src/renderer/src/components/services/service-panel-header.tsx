import { Button } from "@renderer/components/ui/button";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { SERVICE_LOOK } from "@renderer/lib/project-state";
import type { ServiceDetail } from "@shared/services";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Details } from "../ui/details";

/** What the agent says of this module right now, above everything it can do. */
export function ServicePanelHeader({
  detail,
  summary,
  onBack,
  onReload,
}: {
  detail: ServiceDetail;
  /** The manifest's own sentence, when this server declares the module. */
  summary?: string;
  onBack: () => void;
  onReload: () => void;
}) {
  const t = useTranslations();

  const facts = [
    detail.version,
    detail.port ? `port ${detail.port}` : null,
  ].filter(Boolean);

  // What names the module on the machine decides nothing for the reader, and
  // decides everything for whoever goes looking on the server itself.
  const named = [detail.id, detail.unit].filter(Boolean).join(" · ");

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <ServiceLogo moduleId={detail.id} name={detail.name} size={24} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-semibold text-ink text-lg tracking-tight">
              {detail.name}
            </h1>
            <StatePill look={SERVICE_LOOK[detail.state]} name={detail.state} />
          </div>

          {facts.length > 0 ? (
            <p className="mt-0.5 font-data text-[12px] text-ink-3">
              {facts.join(" · ")}
            </p>
          ) : null}

          {summary ? (
            <p className="mt-1 text-ink-3 leading-relaxed">{summary}</p>
          ) : null}

          <Details className="mt-1" name="service">
            <span className="font-data">{named}</span>
          </Details>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button icon={RefreshCw} onClick={onReload} variant="discreet">
          {t("services.panel.reload")}
        </Button>
        <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
          {t("services.panel.back")}
        </Button>
      </div>
    </header>
  );
}
