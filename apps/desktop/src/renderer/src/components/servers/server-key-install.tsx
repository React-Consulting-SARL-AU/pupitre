import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { phasesAt } from "@renderer/lib/waiting-phases";
import type { KeyInstallPhase, Server } from "@shared/servers";
import { KEY_INSTALL_PHASES } from "@shared/servers";
import { KeyRound, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServers } from "../../stores/servers";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { controlClass, Field, fieldAria } from "../ui/field";
import { Panel, panelClass } from "../ui/panel";
import { StatusDot } from "../ui/status-dot";
import { WaitingNotice } from "../ui/waiting-notice";
import { ServerKeyCard } from "./server-key-card";

const SETTLED_MS = 900;

const PASSWORD = "servers.key.password";

/** The password lives only in this component's state, until it is sent. */
export function ServerKeyInstall({
  server,
  publicKey,
  copyId,
  onDone,
  doneLabel,
}: {
  server: Server;
  publicKey: string;
  copyId: string | null;
  onDone: () => void;
  doneLabel?: string;
}) {
  const t = useTranslations();

  const keyInstall = useServers((state) => state.keyInstall);
  const installKey = useServers((state) => state.installKey);

  const [password, setPassword] = useState("");

  // Not onDone: the machine is not open yet, the reader installs the key by hand.
  const [byHand, setByHand] = useState(false);

  const done = useRef(onDone);

  done.current = onDone;

  useEffect(() => {
    if (useServers.getState().keyInstall.status === "idle") {
      installKey(server.id, null);
    }
  }, [server.id, installKey]);

  useEffect(() => {
    window.pupitre.devDefaults().then((defaults) => {
      if (defaults?.server.password) {
        setPassword((current) => current || defaults.server.password);
      }
    });
  }, []);

  useEffect(() => {
    if (keyInstall.status !== "opened") {
      return;
    }

    const timer = setTimeout(() => done.current(), SETTLED_MS);

    return () => clearTimeout(timer);
  }, [keyInstall.status]);

  function submitPassword(): void {
    const typed = password;

    setPassword("");
    installKey(server.id, typed);
  }

  if (
    !byHand &&
    (keyInstall.status === "idle" || keyInstall.status === "working")
  ) {
    const phase: KeyInstallPhase =
      keyInstall.status === "working" ? keyInstall.phase : "reaching";

    return (
      <WaitingNotice
        detail={t("servers.key.installing.detail", { name: server.name })}
        phases={phasesAt(KEY_INSTALL_PHASES, phase, (id) =>
          t(`servers.key.phase.${id}`)
        )}
        title={t("servers.key.installing.title")}
      />
    );
  }

  if (!byHand && keyInstall.status === "opened") {
    return (
      <Panel className="fade-in flex items-start gap-3">
        <span className="translate-y-1">
          <StatusDot shape="filled" size={12} tone="ok" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {t(
              keyInstall.installed
                ? "servers.key.installed.title"
                : "servers.key.alreadyOpen.title",
              { name: server.name }
            )}
          </p>
        </div>
      </Panel>
    );
  }

  if (!byHand && keyInstall.status === "password") {
    const refused = keyInstall.retry
      ? t("servers.key.password.refused")
      : undefined;

    return (
      <form
        className={`${panelClass("lg")} fade-in`}
        onSubmit={(event) => {
          event.preventDefault();
          submitPassword();
        }}
      >
        <h3 className="font-medium text-ink">
          {t("servers.key.password.title", { name: server.name })}
        </h3>
        <p className="mt-1 text-ink-3 leading-relaxed">
          {t("servers.key.password.intro", {
            user: server.user,
            host: server.host,
          })}
        </p>

        <div className="mt-5 max-w-sm">
          <Field
            help={t("servers.key.password.help")}
            label={t("servers.key.password.label")}
            name={PASSWORD}
            problem={refused}
            required
          >
            <input
              {...fieldAria({
                help: true,
                name: PASSWORD,
                problem: Boolean(refused),
                required: true,
              })}
              autoComplete="off"
              autoFocus
              className={controlClass("data", Boolean(refused))}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            disabled={password === ""}
            icon={KeyRound}
            submit
            variant="inverse"
          >
            {t("servers.key.password.submit")}
          </Button>
          <Button onClick={() => setByHand(true)} variant="discreet">
            {t("servers.key.password.skip")}
          </Button>
        </div>
      </form>
    );
  }

  const refusal = refusalOf(t, keyInstall);

  return (
    <div className="flex flex-col gap-gutter">
      {refusal ? (
        <Callout
          action={
            <Button
              icon={RefreshCw}
              onClick={() => {
                setByHand(false);
                installKey(server.id, null);
              }}
            >
              {t("common.retry")}
            </Button>
          }
          fix={refusal.fix}
          tone={refusal.tone}
        >
          {refusal.message}
        </Callout>
      ) : null}

      <ServerKeyCard
        copyId={copyId}
        doneLabel={doneLabel}
        onDone={onDone}
        publicKey={publicKey}
        server={server}
      />
    </div>
  );
}

function refusalOf(
  t: ReturnType<typeof useTranslations>,
  keyInstall: ReturnType<typeof useServers.getState>["keyInstall"]
): { message: string; fix?: string; tone: "warn" | "danger" } | null {
  if (keyInstall.status === "manual") {
    return {
      ...agentText(t, {
        message: keyInstall.phrase.id,
        phrase: keyInstall.phrase,
      }),
      tone: "warn",
    };
  }

  if (keyInstall.status === "failed") {
    return { ...agentText(t, keyInstall.error), tone: "danger" };
  }

  return null;
}
