import { useTranslations } from "@renderer/i18n/use-translations";
import { useSudoPassword } from "@renderer/stores/sudo-password";
import { Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Fact } from "../ui/fact";
import { IconButton } from "../ui/icon-button";
import { ServerSudoEnterDialog } from "./server-sudo-enter-dialog";

const MASK = "••••-••••-••••-••••-••••-••••";

const FEEDBACK_MS = 1600;

export function ServerSudoFact({ serverId }: { serverId: string }) {
  const t = useTranslations();

  const state = useSudoPassword((store) => store.states[serverId]);
  const read = useSudoPassword((store) => store.read);
  const reveal = useSudoPassword((store) => store.reveal);
  const copy = useSudoPassword((store) => store.copy);

  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    read(serverId);
  }, [serverId, read]);

  if (!state) {
    return null;
  }

  // Even the securing that would set a new password needs the current one (decision 0015).
  if (!state.held) {
    return (
      <Fact data-sudo-password="absent" label={t("sudo.password.label")}>
        <span className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-ink-3">
            {t("sudo.password.absent")}
          </span>
          <IconButton
            icon={KeyRound}
            label={t("sudo.password.enter")}
            onClick={() => setEntering(true)}
            size={12}
            variant="discreet"
          />
        </span>
        <ServerSudoEnterDialog
          onClose={() => setEntering(false)}
          open={entering}
          serverId={serverId}
        />
      </Fact>
    );
  }

  async function toggle() {
    setShown(shown === null ? await reveal(serverId) : null);
  }

  async function copyPassword() {
    setCopied(await copy(serverId));
    setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <Fact
      data-sudo-password={shown === null ? "masked" : "revealed"}
      detail={state.kept ? t("sudo.password.kept") : t("sudo.password.unkept")}
      label={t("sudo.password.label")}
    >
      <span className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate">{shown ?? MASK}</span>
        <IconButton
          icon={shown === null ? Eye : EyeOff}
          label={
            shown === null ? t("sudo.password.reveal") : t("sudo.password.hide")
          }
          onClick={toggle}
          size={12}
          variant="discreet"
        />
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? t("sudo.password.copied") : t("sudo.password.copy")}
          onClick={copyPassword}
          size={12}
          variant="discreet"
        />
      </span>
    </Fact>
  );
}
