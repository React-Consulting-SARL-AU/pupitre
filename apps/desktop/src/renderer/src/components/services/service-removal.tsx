import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { StatusDot } from "@renderer/components/ui/status-dot";
import type { Removal } from "@renderer/lib/service-removal";
import { Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Retiring a module, asked twice, the second time with the bill.
 *
 * The question is not "are you sure": it is the list of what this machine will
 * not have any more, drawn from the manifest of the module itself. Nothing is
 * removed on the strength of a button whose label the reader has to interpret.
 */
export function ServiceRemoval({
  name,
  removal,
  onRemove,
}: {
  name: string;
  removal: Removal;
  onRemove: () => void;
}) {
  const [asking, setAsking] = useState(false);

  if (!removal.allowed) {
    return <Callout tone="info">{removal.refusal}</Callout>;
  }

  if (!asking) {
    return (
      <div>
        <Button icon={Trash2} onClick={() => setAsking(true)} variant="danger">
          Retirer ce module
        </Button>
      </div>
    );
  }

  return (
    <section
      className="elevation-raised flex flex-col gap-3 rounded-md border border-danger/40 bg-surface px-4 py-4"
      data-confirm="uninstall"
    >
      <p className="text-ink">Retirer {name} de ce serveur fait perdre :</p>

      <ul className="flex flex-col gap-1.5">
        {removal.losses.map((loss) => (
          <li className="flex items-start gap-2 text-ink-2" key={loss}>
            <span className="pt-1">
              <StatusDot shape="struck" size={9} tone="danger" />
            </span>
            <span className="leading-relaxed">{loss}</span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-ink-3 leading-relaxed">
        Rien n'est sauvegardé au passage : exportez ce qui compte avant.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={Trash2}
          onClick={() => {
            setAsking(false);
            onRemove();
          }}
          variant="danger"
        >
          Retirer définitivement
        </Button>
        <Button onClick={() => setAsking(false)} variant="discreet">
          Annuler
        </Button>
      </div>
    </section>
  );
}
