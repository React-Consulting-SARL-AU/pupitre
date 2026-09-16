import { CheckLine } from "@renderer/components/ui/check-line";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Section } from "@renderer/components/ui/section";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useSshShare } from "@renderer/stores/ssh-share";
import { useEffect } from "react";

/**
 * Whether the system's own SSH file includes the app's.
 *
 * The main process reads and writes that file, so it is the one that keeps the
 * answer: the switch asks it and draws what it wrote back. Under the switch,
 * the word each server answers to once the line is there — the one to type
 * after `ssh`, and the one the editor buttons hand out.
 */
export function SettingsSsh() {
  const t = useTranslations();

  const state = useSshShare((store) => store.state);
  const read = useSshShare((store) => store.read);
  const set = useSshShare((store) => store.set);

  useEffect(() => {
    read();
  }, [read]);

  if (!state) {
    return (
      <div className="max-w-sm">
        <WaitingLine>{t("settings.ssh.reading")}</WaitingLine>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <CheckLine
          checked={state.shared}
          label={t("settings.ssh.label")}
          name="settings.ssh"
          onChange={set}
        />
        <p className="text-[12px] text-ink-3">
          {t("settings.ssh.line", { file: state.userConfigPath })}
        </p>
        <code className="font-data text-[12px] text-ink-2" data-ssh-include>
          {state.line}
        </code>
      </div>

      <Section name="ssh-servers" title={t("settings.ssh.servers")}>
        {state.servers.length === 0 ? (
          <p className="text-ink-2">{t("settings.ssh.none")}</p>
        ) : (
          <FactList>
            {state.servers.map((server) => (
              <Fact
                data-ssh-name={server.ssh}
                key={server.id}
                label={server.name}
              >
                ssh {server.ssh}
              </Fact>
            ))}
          </FactList>
        )}
      </Section>
    </div>
  );
}
