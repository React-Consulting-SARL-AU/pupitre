import { problemText } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import { ArrowLeft, Download } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { FieldProblemView } from "../../lib/catalog-selection";
import { useCatalog } from "../../stores/catalog";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { StepHeading } from "../ui/step-heading";
import { ConfigConnectionBlock } from "./config-connection-block";
import type { FieldHandlers } from "./config-field-control";
import { ConfigIndex } from "./config-index";
import { ConfigModuleGroup } from "./config-module-group";

/**
 * The questions the chosen modules ask, and the answers on their way out.
 *
 * Ordinary values stay in the store, where the install will read them. Secrets
 * never land there: each keystroke goes to the main process, which keeps it
 * until the install writes it on the protocol's secret line.
 *
 * The page reads from top to bottom and ends on the gesture: the index says
 * where each module is, every field carries its own refusal, and the bar at the
 * bottom says what stands in the way of the button next to it.
 */
export function ConfigScreen({
  serverName,
  notice,
  only,
  submitLabel,
  onBack,
  onInstall,
}: {
  serverName?: string;
  /** Said above the questions when something explains why they are asked. */
  notice?: ReactNode;
  /** The modules to ask about, when the screen is opened for one of them. */
  only?: readonly string[];
  submitLabel?: string;
  onBack?: () => void;
  onInstall?: () => void;
}) {
  const t = useTranslations();

  const groups = useCatalog((state) => state.groups);
  const problems = useCatalog((state) => state.problems);
  const shown = useCatalog((state) => state.shown);
  const values = useCatalog((state) => state.values);
  const secrets = useCatalog((state) => state.secrets);
  const setValue = useCatalog((state) => state.setValue);
  const setSecret = useCatalog((state) => state.setSecret);
  const generate = useCatalog((state) => state.generate);
  const reveal = useCatalog((state) => state.reveal);
  const attempt = useCatalog((state) => state.attempt);

  const [checking, setChecking] = useState(false);

  function asked() {
    return only
      ? groups().filter((group) => only.includes(group.module.id))
      : groups();
  }

  function mine(list: readonly FieldProblemView[]) {
    return list.filter((one) => !only || only.includes(one.module));
  }

  function handlersFor(moduleId: string): FieldHandlers {
    return {
      onValue: (key, value) => setValue(moduleId, key, value),
      onSecret: (key, value) => {
        setSecret(moduleId, key, value);
      },
      onGenerate: (key) => {
        generate(moduleId, key);
      },
      onReveal: (key) => reveal(moduleId, key),
    };
  }

  const left = mine(problems());
  const marked = mine(shown());

  /**
   * The gesture answers where it was made. A refusal stops the screen and puts
   * the reader on the first field it names; anything else goes on to install.
   */
  async function submit(): Promise<void> {
    if (left.length > 0) {
      attempt();
      focusFirst(left);

      return;
    }

    setChecking(true);
    const refused = await useCatalog
      .getState()
      .check(asked().map((one) => one.module.id));
    setChecking(false);

    if (refused.length > 0) {
      focusFirst(refused);

      return;
    }

    onInstall?.();
  }

  return (
    <section className="flex flex-col gap-section">
      <StepHeading
        description={t("config.description")}
        eyebrow={t("config.eyebrow")}
        step="config"
        title={serverName ?? t("config.thisServer")}
      />

      {notice}

      <div className="grid gap-gutter md:grid-cols-[12rem_1fr]">
        <div className="md:sticky md:top-4 md:self-start">
          <ConfigIndex groups={asked()} problems={left} shown={marked} />
        </div>

        <div className="flex min-w-0 flex-col gap-gutter">
          <p className="text-[12px] text-ink-3 leading-relaxed">
            {t("config.secretsNotice")}
          </p>

          {asked().map((group, index) => (
            <div className="rise" key={group.module.id} style={riseAt(index)}>
              <ConfigModuleGroup
                before={
                  group.module.connection ? (
                    <ConfigConnectionBlock module={group.module} />
                  ) : null
                }
                group={group}
                handlers={handlersFor(group.module.id)}
                marks={secrets[group.module.id]}
                problems={marked
                  .filter((one) => one.module === group.module.id)
                  .map((one) => ({ ...one, message: problemText(t, one) }))}
                values={values[group.module.id] ?? {}}
              />
            </div>
          ))}
        </div>
      </div>

      <ActionBar note={note(t, left, marked, checking)}>
        {onBack ? (
          <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
            {t("config.back")}
          </Button>
        ) : null}
        <Button
          icon={Download}
          loading={checking}
          onClick={() => submit()}
          title={left.length > 0 ? t("config.remaining.goTo") : undefined}
          variant="inverse"
        >
          {submitLabel ?? t("config.install")}
        </Button>
      </ActionBar>
    </section>
  );
}

/** The first refused field takes the focus, and the page scrolls to it. */
function focusFirst(problems: readonly FieldProblemView[]): void {
  const first = problems[0];

  if (!first) {
    return;
  }

  const control = document.getElementById(`${first.module}.${first.field}`);

  control?.scrollIntoView({ behavior: "smooth", block: "center" });
  control?.focus({ preventScroll: true });
}

function note(
  t: ReturnType<typeof useTranslations>,
  left: readonly FieldProblemView[],
  marked: readonly FieldProblemView[],
  checking: boolean
): ReactNode {
  if (checking) {
    return t("config.checking");
  }

  if (left.length === 0) {
    return t("config.ready");
  }

  return (
    <button
      className="clickable text-left underline underline-offset-2"
      onClick={() => focusFirst(marked.length > 0 ? marked : left)}
      type="button"
    >
      {t.plural("config.remaining", left.length)}
    </button>
  );
}
