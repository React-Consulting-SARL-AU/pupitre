import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { FoldingSection } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { HelpTarget } from "./help-screen";

/** What each remote editor asks for, answered with the driven server's word. */
export function HelpEditorsSection({ target }: { target: HelpTarget }) {
  const t = useTranslations();

  const { server } = target;

  return (
    <FoldingSection name="help-editors" title={t("help.editors.title")}>
      <Panel inset="lg">
        <FactList columns={3}>
          <Fact label={t("help.editors.vscode")} prose>
            {t("help.editors.vscode.value", { ssh: target.host })}
          </Fact>
          <Fact label={t("help.editors.zed")}>
            zed://ssh/{target.host}
            {target.projectPath.startsWith("/") ? target.projectPath : ""}
          </Fact>
          <Fact label={t("help.editors.jetbrains")} prose>
            {t("help.editors.jetbrains.value", {
              port: server.port,
              ssh: target.host,
              user: server.user,
            })}
          </Fact>
        </FactList>

        <p className="mt-4 text-[12px] text-ink-3 leading-relaxed">
          {t("help.editors.buttons")}
        </p>
      </Panel>
    </FoldingSection>
  );
}
