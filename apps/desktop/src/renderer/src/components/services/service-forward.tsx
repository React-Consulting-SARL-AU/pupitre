import { Button } from "@renderer/components/ui/button";
import { CopyField } from "@renderer/components/ui/copy-field";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { PortForward } from "@shared/services";
import { Cable, X } from "lucide-react";

/** An `ssh -L` of the app: the service stays on the server's loopback. */
export function ServiceForward({
  port,
  forwards,
  onOpen,
  onClose,
}: {
  port?: number;
  forwards: readonly PortForward[];
  onOpen: () => void;
  onClose: (id: string) => void;
}) {
  const t = useTranslations();

  if (port === undefined) {
    return null;
  }

  const open = forwards.filter((forward) => forward.remotePort === port);

  return (
    <Section
      actions={
        <Button icon={Cable} onClick={onOpen} size="sm">
          {t("services.forward.open", { port })}
        </Button>
      }
      name="forward"
      title={t("services.forward.title")}
    >
      {open.length === 0 ? (
        <p className="text-ink-3 text-small">
          {t("services.forward.empty", { port })}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((forward) => (
            <li
              className="flex items-end gap-2"
              data-forward={forward.id}
              key={forward.id}
            >
              <span className="min-w-0 flex-1">
                <CopyField
                  help={
                    forward.movedFrom === undefined
                      ? t("services.forward.help", { port: forward.remotePort })
                      : t("services.forward.moved", {
                          from: forward.movedFrom,
                          port: forward.remotePort,
                        })
                  }
                  label={t("services.forward.address")}
                  value={`127.0.0.1:${forward.localPort}`}
                />
              </span>
              <span className="pb-6">
                <IconButton
                  icon={X}
                  label={t("services.forward.close")}
                  onClick={() => onClose(forward.id)}
                  variant="danger"
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
