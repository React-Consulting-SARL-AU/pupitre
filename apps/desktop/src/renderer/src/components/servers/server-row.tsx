import { Tooltip } from "@renderer/components/ui/tooltip";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { type Gesture, usePending } from "@renderer/lib/use-pending";
import type { FleetOpening } from "@renderer/stores/fleet";
import type { EditState } from "@renderer/stores/servers";
import type { Server, ServerChanges, ServerGrant } from "@shared/servers";
import { grantGone } from "@shared/servers";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../ui/button";
import { CopyField } from "../ui/copy-field";
import { Dialog } from "../ui/dialog";
import { Fact, FactList } from "../ui/fact";
import { IconButton } from "../ui/icon-button";
import { Panel } from "../ui/panel";
import { StatusDot, type StatusShape } from "../ui/status-dot";
import { ServerGrantDetail } from "./server-grant-detail";
import { ServerGrantOpen } from "./server-grant-open";
import { ServerRowEditing } from "./server-row-editing";

/**
 * One server, and everything that can be done to it from a list.
 *
 * A machine the platform grants is the same row as one typed here: the
 * console's word is one of its facts, and its first opening one of its
 * gestures. Deleting asks first, and says what goes with it: the key the app
 * made for this machine leaves with the server, and no other copy of it
 * exists. A server the platform grants offers the two gestures apart — removed
 * from here it stays granted; erased everywhere it does not come back.
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
  opening = null,
  onOpen,
  footer,
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
  /** The first opening of a granted server in flight, when it is this one's. */
  opening?: FleetOpening | null;
  onOpen?: () => void;
  /** What the row ends on: the way into the install, when the machine has none. */
  footer?: ReactNode;
}) {
  const t = useTranslations();

  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const editable = server.origin === "app" && onUpdate !== undefined;
  const grant = liveGrant(server);

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

  async function revealKey() {
    setPublicKey(
      publicKey ? null : await window.pupitre.serverPublicKey(server.id)
    );
  }

  return (
    <Panel
      className={`transition-soft ${active ? "border-line-strong" : ""}`}
      data-active={active ? "true" : undefined}
      data-server={server.id}
    >
      <div className="flex items-center gap-3">
        <Tooltip label={t("servers.row.activate", { name: server.name })}>
          <button
            aria-busy={activating}
            aria-current={active}
            aria-label={t("servers.row.activate", { name: server.name })}
            className="clickable shrink-0 rounded-sm p-0.5 text-ink disabled:opacity-40"
            disabled={activating}
            onClick={activate}
            type="button"
          >
            <StatusDot shape={activeShape} size={13} />
          </button>
        </Tooltip>

        <h3 className="min-w-0 flex-1 truncate font-medium text-ink">
          {server.name}
        </h3>

        <IconButton
          expanded={editing}
          icon={Pencil}
          label={t("servers.row.edit", { name: server.name })}
          onClick={() => (editing ? closeEdit() : setEditing(true))}
          variant="discreet"
        />

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

      <FactList className="mt-4 pl-7" columns={3}>
        <Fact label={t("servers.field.address")}>
          {server.origin === "system"
            ? server.host
            : `${server.user}@${server.host}:${server.port}`}
        </Fact>
        <Fact label={t("servers.row.configLabel")}>
          {t(configLabel(server))}
        </Fact>
        <Fact label={t("servers.row.hostKeyLabel")}>
          {server.hostFingerprint ?? t("servers.row.notPinned")}
        </Fact>
        {grant ? <ServerGrantDetail grant={grant} /> : null}
      </FactList>

      {grant && onOpen ? (
        <ServerGrantOpen grant={grant} onOpen={onOpen} opening={opening} />
      ) : null}

      {editing ? (
        <ServerRowEditing
          addressEditable={editable}
          edit={edit}
          onClose={closeEdit}
          onRename={onRename}
          onSubmit={change}
          server={server}
        />
      ) : null}

      {publicKey ? (
        <div className="mt-5 pl-7">
          <CopyField label={t("servers.field.publicKey")} value={publicKey} />
        </div>
      ) : null}

      {footer}

      <Dialog
        actions={
          <>
            <Button
              disabled={deleting}
              onClick={() => setConfirming(false)}
              size="sm"
              variant="discreet"
            >
              {t("common.cancel")}
            </Button>
            {grant ? (
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
              disabled={forgetting}
              icon={Trash2}
              loading={removing}
              onClick={remove}
              size="sm"
              variant="destructive"
            >
              {t(removeLabel(server))}
            </Button>
          </>
        }
        name="server-remove"
        onClose={() => {
          if (!deleting) {
            setConfirming(false);
          }
        }}
        open={confirming}
        title={t("servers.row.confirmQuestion", { name: server.name })}
      >
        <p className="text-ink-2 leading-relaxed">{t(confirmLabel(server))}</p>
        {refusal}
      </Dialog>
    </Panel>
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
 * it on this computer, and the list offers the way back below its rows.
 */
function liveGrant(server: Server): ServerGrant | null {
  return server.grant && !grantGone(server.grant) ? server.grant : null;
}

function granted(server: Server): boolean {
  return liveGrant(server) !== null;
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
