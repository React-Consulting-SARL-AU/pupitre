import type { AgentError } from "@shared/agent";
import type { KeyChoice, ServerDraft } from "@shared/servers";
import { FileKey2, KeyRound, Server as ServerIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { ButtonIcon } from "../ui/button";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Field, fieldControlClass } from "../ui/field";
import { Label } from "../ui/label";

type Mode = KeyChoice["mode"];

const DEFAULT_PORT = "22";

const MODES: { mode: Mode; icon: ButtonIcon; title: string; detail: string }[] =
  [
    {
      detail:
        "Une clé ed25519 propre à cet ordinateur, dans le dossier de l'app. Rien à préparer.",
      icon: KeyRound,
      mode: "generate",
      title: "Générer une clé",
    },
    {
      detail:
        "Une clé que vous avez déjà. Elle est recopiée dans le dossier de l'app, jamais lue sur place.",
      icon: FileKey2,
      mode: "import",
      title: "Importer une clé",
    },
    {
      detail:
        "Un hôte déjà décrit dans votre ~/.ssh/config. L'app n'écrit alors rien du tout.",
      icon: ServerIcon,
      mode: "system",
      title: "Utiliser un hôte du système",
    },
  ];

/**
 * Adding a server: an address, a port, an account, and who owns the key.
 *
 * The three ways of giving a key are shown side by side rather than hidden in a
 * menu, because choosing between them is the one decision of this screen — and
 * the recommended one says so.
 */
export function ServerAddForm({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: AgentError | null;
  onSubmit: (draft: ServerDraft) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<Mode>("generate");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT);
  const [user, setUser] = useState("root");
  const [file, setFile] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [systemHost, setSystemHost] = useState("");

  useEffect(() => {
    window.pupitre.sshHosts().then((found) => {
      setHosts(found);
      setSystemHost((current) => current || (found[0] ?? ""));
    });
  }, []);

  async function pickFile() {
    const picked = await window.pupitre.pickKeyFile();
    if (picked) {
      setFile(picked);
    }
  }

  function key(): KeyChoice {
    if (mode === "import") {
      return { file, mode: "import" };
    }
    if (mode === "system") {
      return { host: systemHost, mode: "system" };
    }
    return { mode: "generate" };
  }

  function submit() {
    onSubmit({
      host: mode === "system" ? systemHost : host,
      key: key(),
      name,
      port: Number.parseInt(port, 10),
      user,
    });
  }

  const ready =
    mode === "system"
      ? systemHost !== ""
      : host.trim() !== "" && user.trim() !== "" && (mode !== "import" || file);

  return (
    <div className="elevation-raised rounded-md border border-line bg-surface p-5">
      <h3 className="font-medium text-ink">Ajouter un serveur</h3>
      <p className="mt-1 text-ink-3 leading-relaxed">
        L'app écrit sa propre configuration SSH et garde la clé dans son
        dossier. Votre{" "}
        <code className="font-data text-ink-2">~/.ssh/config</code> n'est jamais
        modifié.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {MODES.map((option) => (
          <ModeCard
            detail={option.detail}
            icon={option.icon}
            key={option.mode}
            onPick={() => setMode(option.mode)}
            picked={mode === option.mode}
            recommended={option.mode === "generate"}
            title={option.title}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field help="Ce que la barre latérale affichera" label="Nom">
          <input
            className={fieldControlClass}
            onChange={(e) => setName(e.target.value)}
            placeholder="Serveur de développement"
            value={name}
          />
        </Field>

        {mode === "system" ? (
          <Field
            help={
              hosts.length > 0
                ? `${hosts.length} hôtes lus dans ~/.ssh/config`
                : "Aucun hôte dans ~/.ssh/config"
            }
            label="Hôte du système"
          >
            <select
              className={fieldControlClass}
              onChange={(e) => setSystemHost(e.target.value)}
              value={systemHost}
            >
              {hosts.map((declared) => (
                <option key={declared} value={declared}>
                  {declared}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field help="Une adresse IP ou un nom d'hôte" label="Adresse">
            <input
              className={fieldControlClass}
              onChange={(e) => setHost(e.target.value)}
              placeholder="203.0.113.10"
              value={host}
            />
          </Field>
        )}

        {mode === "system" ? null : (
          <>
            <Field help="22 sur un serveur SSH ordinaire" label="Port">
              <input
                className={fieldControlClass}
                inputMode="numeric"
                onChange={(e) => setPort(e.target.value)}
                placeholder={DEFAULT_PORT}
                value={port}
              />
            </Field>

            <Field
              help="root au premier contact, dev une fois la machine durcie"
              label="Utilisateur"
            >
              <input
                className={fieldControlClass}
                onChange={(e) => setUser(e.target.value)}
                placeholder="root"
                value={user}
              />
            </Field>
          </>
        )}
      </div>

      {mode === "import" ? (
        <div className="mt-5">
          <Label>Fichier de la clé privée</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Button icon={FileKey2} onClick={pickFile}>
              Choisir un fichier…
            </Button>
            <span className="min-w-0 truncate font-data text-[11px] text-ink-3">
              {file || "aucun fichier choisi"}
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-5">
          <Callout fix={error.fix} tone="danger">
            {error.message}
          </Callout>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          disabled={!ready}
          loading={busy}
          onClick={submit}
          variant="inverse"
        >
          {busy ? "Préparation…" : "Ajouter"}
        </Button>
        <Button onClick={onCancel} variant="discreet">
          Annuler
        </Button>
      </div>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  detail,
  picked,
  recommended,
  onPick,
}: {
  icon: ButtonIcon;
  title: string;
  detail: string;
  picked: boolean;
  recommended: boolean;
  onPick: () => void;
}): ReactNode {
  return (
    <button
      aria-pressed={picked}
      className={`flex flex-col items-start gap-1.5 rounded-sm border p-3 text-left transition-soft ${
        picked
          ? "border-ink bg-raised text-ink"
          : "border-line bg-base text-ink-2 hover:border-line-strong"
      }`}
      onClick={onPick}
      type="button"
    >
      <span className="flex items-center gap-1.5 font-medium text-ink">
        <Icon size={13} strokeWidth={1.5} />
        {title}
      </span>
      {recommended ? <Label>Recommandé</Label> : null}
      <span className="text-[11px] text-ink-3 leading-relaxed">{detail}</span>
    </button>
  );
}
