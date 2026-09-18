import type { LoginState, Service } from "@pupitre/shared/agent-protocol/state";
import { Label } from "@renderer/components/ui/label";
import { Panel } from "@renderer/components/ui/panel";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CATEGORY_NAMES, groupByCategory } from "@renderer/lib/module-category";
import { ServiceRow } from "./service-row";

/**
 * The installed modules, under the same captions as the catalogue they were
 * picked from: a runtime is found among the runtimes, a database among the
 * databases, in the order the snapshot listed them.
 */
export function ServicesList({
  services,
  accounts,
  onOpen,
}: {
  services: readonly Service[];
  accounts: Readonly<Record<string, LoginState>>;
  onOpen: (moduleId: string) => void;
}) {
  const t = useTranslations();

  const groups = groupByCategory(services, (service) => service.id);

  return (
    <Panel list>
      {groups.map((group) => {
        const name = CATEGORY_NAMES[group.category];
        const title = name ? t(name) : group.category;

        return (
          <section
            aria-label={title}
            className="divide-y divide-line"
            data-service-category={group.category}
            key={group.category}
          >
            <h3 className="bg-raised px-4 py-1.5">
              <Label>{title}</Label>
            </h3>

            <ul className="divide-y divide-line">
              {group.items.map((service) => (
                <ServiceRow
                  account={accounts[service.id]}
                  key={service.id}
                  onOpen={() => onOpen(service.id)}
                  service={service}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </Panel>
  );
}
