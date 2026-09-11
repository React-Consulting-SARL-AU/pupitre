import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Removal } from "@renderer/lib/service-removal";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ServiceRemovalLosses } from "./service-removal-losses";

/**
 * Retiring a module, asked twice, the second time with the bill.
 *
 * The gesture stands in the page's header with the other things done to the
 * module as a whole. A module the catalogue calls mandatory has no button at
 * all: the machine depends on it, and offering the gesture only to refuse it
 * would be a lie — the header's facts say so instead.
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
  const t = useTranslations();

  const [asking, setAsking] = useState(false);

  if (!removal.allowed) {
    return null;
  }

  return (
    <>
      <Button icon={Trash2} onClick={() => setAsking(true)} variant="danger">
        {t("services.removal.button")}
      </Button>

      <ServiceRemovalLosses
        losses={removal.losses}
        name={name}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onRemove();
        }}
        open={asking}
      />
    </>
  );
}
