import { useTranslations } from "@renderer/i18n/use-translations";
import { Fact, FactList } from "../ui/fact";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";

export function AccessUsage() {
  const t = useTranslations();

  return (
    <Section name="access-usage" title={t("access.usage.title")}>
      <Panel inset="lg">
        <FactList columns={3}>
          <Fact label={t("access.usage.browser")} prose>
            {t("access.usage.browserDetail")}
          </Fact>
          <Fact label={t("access.usage.client")} prose>
            {t("access.usage.clientDetail")}
          </Fact>
          <Fact label={t("access.usage.socket")} prose>
            {t("access.usage.socketDetail")}
          </Fact>
        </FactList>
      </Panel>
    </Section>
  );
}
