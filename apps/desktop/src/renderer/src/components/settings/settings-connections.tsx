import { useTranslations } from "@renderer/i18n/use-translations";
import { ConnectionCloudflare } from "../connections/connection-cloudflare";
import { Label } from "../ui/label";

/**
 * The third-party accounts the app holds, seen from the preferences.
 *
 * It is the same block the configuration screen shows above the module that
 * needs it: connecting an account there and looking at it here are one thing,
 * not two screens that could disagree.
 */
export function SettingsConnections() {
  const t = useTranslations();

  return (
    <div className="max-w-sm">
      <Label>{t("connections.cloudflare.title")}</Label>

      <div className="mt-3">
        <ConnectionCloudflare />
      </div>
    </div>
  );
}
