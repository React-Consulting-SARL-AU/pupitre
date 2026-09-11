import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { type Gesture, usePending } from "@renderer/lib/use-pending";
import type { EditState } from "@renderer/stores/servers";
import type { Server, ServerChanges } from "@shared/servers";
import { grantGone } from "@shared/servers";
import { KeyRound, OctagonAlert, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../ui/button";
import { CopyField } from "../ui/copy-field";
import { fieldControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";
import { StatusDot, type StatusShape } from "../ui/status-dot";
import { ServerRowDetail } from "./server-row-detail";
import { ServerRowEditing } from "./server-row-editing";

/**
 * One server, and everything that can be done to it from a list.
 *
 * Deleting asks first, and says what goes with it: the key the app made for
 * this machine leaves with the server, and no other copy of it exists. A
 * server the platform grants offers the two gestures apart — removed from here
 * it stays granted; erased everywhere it does not come back.
 *
 * Either deletion holds the confirmation open while it runs: the spinner turns
 * on the button that was clicked, and its neighbour cannot be pressed meanwhile.
 */
export function ServerRow({
  server,
  active,
  onActivate,
  onRename,
  onUpdate,
  onForgetEdit,
  edit = { status: "idle" },
  onRemove,
  onForget,
  refusal,
}: {
  server: Server;
  active: boolean;
  onActivate: Gesture;
  onRename: (name: string) => void;
  /** The address, the port or the account, changed in place. */
  onUpdate?: (changes: ServerChanges) => Promise<void>;
  onForgetEdit?: () => void;
  /** Where the last change stands, for whichever row asked for it. */
  edit?: EditState;
  onRemove: Gesture;
  onForget: Gesture;
  /** What the platform objected to the removal with, in its own words. */
  refusal?: ReactNode;
}) {
  const t = useTranslations();

  const [name, setName] = useState(server.name);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const editable = server.origin === "app" && onUpdate !== undefined;

  function change(changes: ServerChanges): void {
    onUpdate?.(changes);
  }

  function closeEdit(): void {
    setEditing(false);
    onForgetEdit?.();
  }

  const [activate, activating] = usePending(onActivate);
  const [remove, removing] = usePending(onRemove);
  const [forget, forgetting] = usePending(onForget);

  const deleting = removing || forgetting;

  let activeShape: StatusShape = active ? "filled" : "empty";
  if (activating) {
    activeShape = "breathing";
  }

  function commitName() {
    const clean = name.trim();
    if (clean && clean !== server.name) {
      onRename(clean);
    } else {
      setName(server.name);
    }
  }

  async function revealKey() {
    setPublicKey(
      publicKey ? null : await window.pupitre.serverPublicKey(server.id)
    );
  }

  return (
    <div
      className={`elevation-raised rounded-md border p-4 transition-soft ${
        active ? "border-line-strong bg-raised" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          aria-busy={activating}
          aria-current={active}
          aria-label={t("servers.row.activate", { name: server.name })}
          className="clickable shrink-0 rounded-sm p-0.5 text-ink disabled:opacity-40"
          disabled={activating}
          onClick={activate}
          title={t("servers.row.activate", { name: server.name })}
          type="button"
        >
          <StatusDot shape={activeShape} size={13} />
        </button>

        <input
          aria-label={t("servers.row.rename", { name: server.name })}
          className={`min-w-0 flex-1 ${fieldControlClass}`}
          onBlur={commitName}
          onChange={(e) => setName(e.target.value)}
          value={name}
        />

        {editable ? (
          <IconButton
            expanded={editing}
            icon={Pencil}
            label={t("servers.row.edit", { name: server.name })}
            onClick={() => (editing ? closeEdit() : setEditing(true))}
            variant="discreet"
          />
        ) : null}

        {server.origin === "app" && !server.grant?.adopted ? (
          <IconButton
            icon={KeyRound}
            label={
              publicKey
                ? t("servers.row.hidePublicKey")
                : t("servers.row.showPublicKey")
            }
            onClick={revealKey}
            variant="discreet"
          />
        ) : null}

        <IconButton
          icon={Trash2}
          label={t("servers.row.remove", { name: server.name })}
          onClick={() => setConfirming(true)}
          variant="danger"
        />
      </div>

      <dl className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 pl-7">
        <ServerRowDetail label={t("servers.field.address")}>
          {server.origin === "system"
            ? server.host
            : `${server.user}@${server.host}:${server.port}`}
        </ServerRowDetail>
        <ServerRowDetail label={t("servers.row.configLabel")}>
          {t(configLabel(server))}
        </ServerRowDetail>
        <ServerRowDetail label={t("servers.row.hostKeyLabel")}>
          {server.hostFingerprint ?? t("servers.row.notPinned")}
        </ServerRowDetail>
      </dl>

      {editing ? (
        <ServerRowEditing
          edit={edit}
          onClose={closeEdit}
          onSubmit={change}
          server={server}
        />
      ) : null}

      {publicKey ? (
        <div className="mt-5 pl-7">
          <CopyField label={t("servers.field.publicKey")} value={publicKey} />
        </div>
      ) : null}

      {confirming ? (
        <div className="fade-in mt-5 flex items-start gap-2.5 rounded-sm border border-danger/40 bg-danger/10 p-3">
          <OctagonAlert
            className="mt-0.5 shrink-0 text-danger"
            size={14}
            strokeWidth={1.5}
          />
          <div className="min-w-0">
            <p className="font-medium text-ink leading-relaxed">
              {t("servers.row.confirmQuestion", { name: server.name })}
            </p>
            <p className="mt-1 text-ink-2 leading-relaxed">
              {t(confirmLabel(server))}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                disabled={forgetting}
                icon={Trash2}
                loading={removing}
                onClick={remove}
                size="sm"
                variant="destructive"
              >
                {t(removeLabel(server))}
              </Button>
              {granted(server) ? (
                <Button
                  disabled={removing}
                  icon={Trash2}
                  loading={forgetting}
                  onClick={forget}
                  size="sm"
                  variant="destructive"
                >
                  {t("servers.row.confirmForget")}
                </Button>
              ) : null}
              <Button
                disabled={deleting}
                onClick={() => setConfirming(false)}
                size="sm"
                variant="discreet"
              >
                {t("common.cancel")}
              </Button>
            </div>

            {refusal ? <div className="mt-3">{refusal}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function configLabel(server: Server): DictionaryKey {
  if (server.grant?.adopted) {
    return "servers.row.configGranted";
  }

  return server.origin === "app"
    ? "servers.row.configApp"
    : "servers.row.configSystem";
}

/**
 * What the button promises, and it promises only what it can keep.
 *
 * What decides is not who created the entry but whether the platform still
 * grants the machine: only the platform can delete it. Removing it here hides
 * it on this computer, and the granted-servers panel knows how to bring it back.
 */
function granted(server: Server): boolean {
  return Boolean(server.grant && !grantGone(server.grant));
}

function removeLabel(server: Server): DictionaryKey {
  return granted(server)
    ? "servers.row.confirmRemoveGranted"
    : "servers.row.confirmRemove";
}

function confirmLabel(server: Server): DictionaryKey {
  if (granted(server)) {
    return "servers.row.confirmGrantedOrForget";
  }

  return server.origin === "app"
    ? "servers.row.confirmApp"
    : "servers.row.confirmSystem";
}
