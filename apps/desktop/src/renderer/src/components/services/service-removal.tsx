import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import type { Removal } from "@renderer/lib/service-removal";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ServiceRemovalLosses } from "./service-removal-losses";

/**
 * Retiring a module, asked twice, the second time with the bill.
 *
 * A module the catalogue calls mandatory has no button at all: the machine
 * depends on it, and offering the gesture only to refuse it would be a lie.
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

  if (asking) {
    return (
      <ServiceRemovalLosses
        losses={removal.losses}
        name={name}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onRemove();
        }}
      />
    );
  }

  return (
    <div>
      <Button icon={Trash2} onClick={() => setAsking(true)} variant="danger">
        Retirer ce module
      </Button>
    </div>
  );
}
