import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SwitchLine } from "@renderer/components/ui/switch";
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
      <Section name="ssh" title={t("settings.section.ssh")}>
        <WaitingLine>{t("settings.ssh.reading")}</WaitingLine>
      </Section>
    );
  }

  return (
    <>
      <Section name="ssh" title={t("settings.section.ssh")}>
        <Panel inset="lg">
          <SwitchLine
            checked={state.shared}
            detail={t("settings.ssh.line", { file: state.userConfigPath })}
            label={t("settings.ssh.label")}
            name="settings.ssh"
            onChange={set}
          />

          <code
            className="mt-4 block rounded-sm bg-sunken px-3 py-2 font-data text-ink-2 text-small"
            data-ssh-include
          >
            {state.line}
          </code>
        </Panel>
      </Section>

      <Section name="ssh-servers" title={t("settings.ssh.servers")}>
        {state.servers.length === 0 ? (
          <p className="text-ink-2">{t("settings.ssh.none")}</p>
        ) : (
          <Panel inset="lg">
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
          </Panel>
        )}
      </Section>
    </>
  );
}
