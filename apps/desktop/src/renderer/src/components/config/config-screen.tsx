import { problemText } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { FieldProblemView } from "../../lib/catalog-selection";
import { useCatalog } from "../../stores/catalog";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Screen } from "../ui/screen";
import { ConfigConnectionBlock } from "./config-connection-block";
import type { FieldHandlers } from "./config-field-control";
import { ConfigIndex } from "./config-index";
import { ConfigModuleGroup } from "./config-module-group";

/**
 * The questions the chosen services ask, one service at a time.
 *
 * Ordinary values stay in the store, where the install will read them. Secrets
 * never land there: each keystroke goes to the main process, which keeps it
 * until the install writes it on the protocol's secret line.
 *
 * The index says which service is open and which ones still wait; the panel
 * asks what that service needs and keeps its other settings folded; the bar at
 * the bottom says what stands in the way of the button next to it, and a
 * refused field anywhere brings its service back on screen.
 */
export function ConfigScreen({
  serverName,
  notice,
  only,
  submitLabel,
  actions,
  plain,
  onBack,
  onInstall,
}: {
  serverName?: string;
  /** What the header offers on the whole sequence: a way out of it. */
  actions?: ReactNode;
  /** The header sits on the page, as the onboarding's steps read theirs. */
  plain?: boolean;
  /** Said above the questions when something explains why they are asked. */
  notice?: ReactNode;
  /** The services to ask about, when the screen is opened for some of them. */
  only?: readonly string[];
  submitLabel?: string;
  onBack?: () => void;
  onInstall?: () => void;
}) {
  const t = useTranslations();

  const groups = useCatalog((state) => state.groups);
  const problems = useCatalog((state) => state.problems);
  const deferred = useCatalog((state) => state.deferred);
  const defer = useCatalog((state) => state.defer);
  const shown = useCatalog((state) => state.shown);
  const values = useCatalog((state) => state.values);
  const secrets = useCatalog((state) => state.secrets);
  const setValue = useCatalog((state) => state.setValue);
  const setSecret = useCatalog((state) => state.setSecret);
  const generate = useCatalog((state) => state.generate);
  const reveal = useCatalog((state) => state.reveal);
  const attempt = useCatalog((state) => state.attempt);

  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const [wanted, setWanted] = useState<FieldProblemView | null>(null);

  const asked = only
    ? groups().filter((group) => only.includes(group.module.id))
    : groups();

  const index = Math.max(
    0,
    asked.findIndex((group) => group.module.id === open)
  );
  const current = asked[index] ?? null;

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

  function show(moduleId: string): void {
    setOpen(moduleId);
    setMoved(true);
  }

  /** The refused field takes the focus once its service is on screen. */
  useEffect(() => {
    if (!wanted || wanted.module !== current?.module.id) {
      return;
    }

    const control = document.getElementById(`${wanted.module}.${wanted.field}`);

    control?.scrollIntoView({ behavior: "smooth", block: "center" });
    control?.focus({ preventScroll: true });
    setWanted(null);
  }, [wanted, current]);

  function goTo(problem: FieldProblemView | undefined): void {
    if (!problem) {
      return;
    }

    setWanted(problem);
    show(problem.module);
  }

  const left = mine(problems());
  const marked = mine(shown());
  const last = index >= asked.length - 1;

  /**
   * The gesture answers where it was made. A refusal stops the screen and puts
   * the reader on the first field it names; anything else goes on to install.
   */
  async function submit(): Promise<void> {
    if (left.length > 0) {
      attempt();
      goTo(left[0]);

      return;
    }

    setChecking(true);
    const refused = await useCatalog
      .getState()
      .check(asked.map((one) => one.module.id));
    setChecking(false);

    if (refused.length > 0) {
      goTo(refused[0]);

      return;
    }

    onInstall?.();
  }

  const install = (
    <Button
      icon={Download}
      loading={checking}
      onClick={() => submit()}
      title={left.length > 0 ? t("config.remaining.goTo") : undefined}
      variant={left.length === 0 || last ? "inverse" : "default"}
    >
      {submitLabel ?? t("config.install")}
    </Button>
  );

  return (
    <Screen
      actions={actions}
      column
      eyebrow={t("config.eyebrow")}
      footer={
        <ActionBar name="config" note={note(t, left, marked, checking, goTo)}>
          {index > 0 ? (
            <Button
              icon={ArrowLeft}
              onClick={() => show(asked[index - 1].module.id)}
              variant="discreet"
            >
              {t("config.previous")}
            </Button>
          ) : null}
          {index === 0 && onBack ? (
            <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
              {t("config.back")}
            </Button>
          ) : null}
          {last ? null : (
            <Button
              icon={ArrowRight}
              onClick={() => show(asked[index + 1].module.id)}
              variant={left.length > 0 ? "inverse" : "default"}
            >
              {t("config.next")}
            </Button>
          )}
          {install}
        </ActionBar>
      }
      plain={plain}
      step="config"
      title={serverName ?? t("config.thisServer")}
    >
      {notice}

      <div className="grid gap-gutter lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <ConfigIndex
            current={current?.module.id ?? null}
            groups={asked}
            onPick={show}
            problems={left}
            shown={marked}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-gutter">
          {current ? (
            <ConfigModuleGroup
              before={
                current.module.connection ? (
                  <ConfigConnectionBlock module={current.module} />
                ) : null
              }
              deferred={deferred.includes(current.module.id)}
              focus={moved}
              group={current}
              handlers={handlersFor(current.module.id)}
              key={current.module.id}
              marks={secrets[current.module.id]}
              onDefer={(later) => defer(current.module.id, later)}
              position={{ index: index + 1, total: asked.length }}
              problems={marked
                .filter((one) => one.module === current.module.id)
                .map((one) => ({ ...one, message: problemText(t, one) }))}
              values={values[current.module.id] ?? {}}
            />
          ) : null}
        </div>
      </div>
    </Screen>
  );
}

function note(
  t: ReturnType<typeof useTranslations>,
  left: readonly FieldProblemView[],
  marked: readonly FieldProblemView[],
  checking: boolean,
  goTo: (problem: FieldProblemView | undefined) => void
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
      onClick={() => goTo(marked[0] ?? left[0])}
      type="button"
    >
      {t.plural("config.remaining", left.length)}
    </button>
  );
}
