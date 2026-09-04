import { Button } from "@renderer/components/ui/button";
import { CopyField } from "@renderer/components/ui/copy-field";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Label } from "@renderer/components/ui/label";
import type { PortForward } from "@shared/services";
import { Cable, X } from "lucide-react";

/**
 * The service's port, brought to this computer for as long as it is wanted.
 *
 * Nothing changes on the server: the database stays on its loopback, and what
 * opens is an `ssh -L` of the app. It is how a desktop client reaches a service
 * that must never be exposed.
 */
export function ServiceForward({
  port,
  forwards,
  onOpen,
  onClose,
}: {
  /** The port the agent reported for this service, if it reported one. */
  port?: number;
  forwards: readonly PortForward[];
  onOpen: () => void;
  onClose: (id: string) => void;
}) {
  if (port === undefined) {
    return null;
  }

  const open = forwards.filter((forward) => forward.remotePort === port);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>Tunnel vers ce port</Label>

        <Button icon={Cable} onClick={onOpen} size="sm">
          Ouvrir un tunnel vers {port}
        </Button>
      </div>

      {open.length === 0 ? (
        <p className="text-[11px] text-ink-3">
          Aucun tunnel ouvert. Une fois ouvert, le port {port} du serveur répond
          sur cette machine.
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
                  help={`Le port ${forward.remotePort} du serveur, sur cette machine.`}
                  label="Adresse locale"
                  value={`127.0.0.1:${forward.localPort}`}
                />
              </span>
              <span className="pb-6">
                <IconButton
                  icon={X}
                  label="Fermer ce tunnel"
                  onClick={() => onClose(forward.id)}
                  variant="danger"
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
