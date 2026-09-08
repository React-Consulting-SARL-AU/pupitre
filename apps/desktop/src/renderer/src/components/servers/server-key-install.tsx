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
import { Field, fieldControlClass } from "../ui/field";
import { StatusDot } from "../ui/status-dot";
import { WaitingNotice } from "../ui/waiting-notice";
import { ServerKeyCard } from "./server-key-card";

/**
 * The key, put on the server by the app rather than by the reader.
 *
 * It starts on its own the moment the server is added, because that is the one
 * thing standing between a machine that was just declared and a machine that
 * answers. Three outcomes, and each is a different screen: it opens, and the
 * step walks on by itself; it needs the account's password, and that is the
 * only thing asked; it cannot be done from here, and then — only then — the
 * line to paste comes back, with the reason it came back.
 *
 * The password lives in this component's state for as long as it takes to send
 * it, and nowhere else: not in the store, not in the trace, not on a command
 * line.
 */

const SETTLED_MS = 900;

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

  // Taking over: the app stops trying and hands back the key and the command
  // line. This isn't moving to the next step — the machine isn't open yet.
  const [byHand, setByHand] = useState(false);

  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (useServers.getState().keyInstall.status === "idle") {
      installKey(server.id, null);
    }
  }, [server.id, installKey]);

  // The key opens the machine: there is nothing left to read here, and holding
  // the reader on a green tick would only be a click asking to be made.
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
        note={t("servers.key.installing.note")}
        phases={phasesAt(KEY_INSTALL_PHASES, phase, (id) =>
          t(`servers.key.phase.${id}`)
        )}
        title={t("servers.key.installing.title")}
      />
    );
  }

  if (!byHand && keyInstall.status === "opened") {
    return (
      <div className="elevation-raised fade-in flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4">
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
          <p className="mt-1 text-ink-3 leading-relaxed">
            {t(
              keyInstall.installed
                ? "servers.key.installed.detail"
                : "servers.key.alreadyOpen.detail"
            )}
          </p>
        </div>
      </div>
    );
  }

  if (!byHand && keyInstall.status === "password") {
    return (
      <form
        className="elevation-raised fade-in rounded-md border border-line bg-surface p-5"
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

        {keyInstall.retry ? (
          <div className="mt-5">
            <Callout tone="warn">{t("servers.key.password.refused")}</Callout>
          </div>
        ) : null}

        <div className="mt-5 max-w-sm">
          <Field
            help={t("servers.key.password.help")}
            label={t("servers.key.password.label")}
          >
            <input
              autoComplete="off"
              autoFocus
              className={fieldControlClass}
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

/**
 * What the screen has to say about the refusal, if there is one.
 *
 * Taking over by hand is not a failure: the app then has nothing to hold
 * against the machine, and the card shows without a warning.
 */
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
