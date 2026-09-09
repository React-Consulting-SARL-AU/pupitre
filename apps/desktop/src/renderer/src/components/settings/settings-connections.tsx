import { useTranslations } from "@renderer/i18n/use-translations";
import { ConnectionCard } from "../connections/connection-card";
import { CONNECTIONS } from "../connections/connection-descriptors";
import { Label } from "../ui/label";

/**
 * The third-party accounts the app holds, seen from the preferences.
 *
 * They are the same blocks the configuration screen shows above the module that
 * needs one: connecting an account there and looking at it here are one thing,
 * not two screens that could disagree.
 */
export function SettingsConnections() {
  const t = useTranslations();

  return (
    <div className="flex max-w-sm flex-col gap-8">
      {CONNECTIONS.map((connection) => (
        <div key={connection.kind}>
          <Label>{t(connection.title)}</Label>

          <div className="mt-3">
            <ConnectionCard connection={connection} />
          </div>
        </div>
      ))}
    </div>
  );
}
