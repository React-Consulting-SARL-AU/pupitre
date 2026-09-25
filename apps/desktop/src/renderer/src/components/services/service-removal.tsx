import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Removal } from "@renderer/lib/service-removal";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ServiceRemovalLosses } from "./service-removal-losses";

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

  // No button to refuse: the header's facts carry the refusal instead.
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
