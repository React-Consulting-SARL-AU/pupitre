import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { useEffect } from "react";
import { CONNECTIONS } from "../connections/connection-descriptors";
import { ConnectionRow } from "../connections/connection-row";

/**
 * The third-party accounts the app holds, seen from the preferences.
 *
 * One line per account, its form folded under it — the same card the
 * configuration screen shows above the module that needs one, so connecting an
 * account there and looking at it here are one thing, not two screens that
 * could disagree.
 */
export function SettingsConnections() {
  const t = useTranslations();

  const read = useConnections((store) => store.read);

  useEffect(() => {
    read();
  }, [read]);

  return (
    <div>
      <p className="text-ink-3 leading-relaxed">{t("connections.lead")}</p>

      {/*
        The rows run edge to edge inside the card: an inset would draw a second
        frame within the one already there, and each line already carries its
        own breathing room.
      */}
      <div className="elevation-raised mt-4 overflow-hidden rounded-md border border-line bg-surface">
        {CONNECTIONS.map((connection) => (
          <ConnectionRow connection={connection} key={connection.kind} />
        ))}
      </div>
    </div>
  );
}
