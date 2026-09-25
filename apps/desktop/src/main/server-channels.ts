import { join } from "node:path";
import type { AgentResponse } from "@shared/agent";
import type {
  HostKeyDecision,
  KeyInstall,
  KeyInstallPhase,
  ServerAdded,
  ServerChanges,
  ServerReach,
  ServersConfig,
  ServerUpdated,
} from "@shared/servers";
import { movesConnection } from "@shared/servers";
import type { SshShareState } from "@shared/ssh-names";
import { app, dialog } from "electron";
import { account } from "./account";
import { currentLanguage } from "./agent";
import { dialogTextIn } from "./dialogs";
import { asAgentError } from "./enrollment-run";
import { handle } from "./ipc";
import { anything, isString, shape } from "./ipc-guard";
import { designatedKeyFile, designateKeyFile } from "./key-files";
import { installKey } from "./key-install";
import { isServerKnock, knock } from "./knock";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { addServerRun, isServerDraft } from "./server-add-run";
import { SetupError } from "./server-setup";
import {
  activate,
  add,
  byId,
  forgetOrphanPin,
  hostKey,
  paths,
  publicKey,
  read,
  remove,
  rename,
  setSshShare,
  sshHosts,
  sshPathsWritten,
  sshShareState,
  trustReinstalled,
  update,
} from "./servers";
import { forgetSudoPassword } from "./sudo";
import { usageRefusal } from "./usage-guard";

/**
 * The servers of this computer, as the renderer reaches them.
 *
 * `settle` is what has to be dropped with one server — its channels, its
 * terminals, what the app held for it — when the machine it named is no
 * longer the one the app talks to.
 */

const unknownServer = () => refuseWith("bad_request", "refusal.server.unknown");

/** What the renderer may change on a server, read field by field and nothing else. */
function serverChanges(value: unknown): ServerChanges {
  const held = (value ?? {}) as Record<string, unknown>;

  return {
    ...(typeof held.host === "string" ? { host: held.host } : {}),
    ...(typeof held.port === "number" ? { port: held.port } : {}),
    ...(typeof held.user === "string" ? { user: held.user } : {}),
    ...(typeof held.slug === "string" ? { slug: held.slug } : {}),
  };
}

function forgetServer(serverId: string, settle: (id: string) => void): void {
  settle(serverId);
  forgetSudoPassword(serverId);
}

function registerReading(): void {
  handle("servers", shape(), (): ServersConfig => read());
  handle("ssh-hosts", shape(), (): string[] => sshHosts());
  handle("ssh-share:state", shape(), (): SshShareState => sshShareState());
  handle(
    "ssh-share:set",
    shape(anything),
    (_e, shared): SshShareState => setSshShare(shared === true)
  );
  handle("server-public-key", shape(isString), (_e, id): string | null =>
    publicKey(id)
  );
}

function registerAdding(): void {
  handle(
    "server-reach",
    shape(isServerKnock),
    (_e, target): Promise<ServerReach> =>
      knock(target, sshPathsWritten(), {
        forgetStalePin: () => forgetOrphanPin(target),
      })
  );

  /**
   * The password, when the knock asked for one, crosses here with the draft
   * and goes straight to one `ssh`: the server is added and opened in the same
   * gesture, or not added at all when the machine refuses it.
   */
  handle(
    "server-add",
    shape(isServerDraft),
    (_e, draft): Promise<AgentResponse<ServerAdded>> => {
      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return Promise.resolve(refused);
      }

      if (draft.key.mode === "import" && !designatedKeyFile(draft.key.file)) {
        return Promise.resolve(
          refuseWith("bad_request", "refusal.key.missing", {
            source: draft.key.file,
          })
        );
      }

      return addServerRun(draft, {
        add,
        config: read,
        install: (server, half, password) =>
          installKey({
            freshKey: true,
            password,
            paths: paths(),
            publicKey: half,
            server,
          }),
        remove: (id) => remove(id).then(() => undefined),
      });
    }
  );

  /**
   * The file picker for an imported key.
   *
   * The renderer never names a path of its own: it opens this dialog, the user
   * points at a file, and only then does a path reach the main process.
   */
  handle("key-file-pick", shape(), async (): Promise<string | null> => {
    const picked = await dialog.showOpenDialog({
      buttonLabel: dialogTextIn(currentLanguage(), "import"),
      defaultPath: join(app.getPath("home"), ".ssh"),
      properties: ["openFile", "showHiddenFiles"],
      title: dialogTextIn(currentLanguage(), "pickKey"),
    });

    return picked.canceled ? null : designateKeyFile(picked.filePaths[0]);
  });
}

function registerChanging(settle: (id: string) => void): void {
  handle("server-rename", shape(isString, isString), (_e, id, name) =>
    rename(id, name)
  );
  handle("server-activate", shape(isString), (_e, id) => activate(id));

  /**
   * The address, the port, the account or the SSH name of a server, as the
   * reader typed them. Each is checked here before it becomes a line of the
   * SSH file; the channels are dropped when the address, the port or the
   * account moved, since the ones open reach the old one. The SSH name is
   * other clients' word for the server — the app's own sessions ride the
   * identifier and stand.
   */
  handle(
    "server-update",
    shape(anything, anything),
    async (_e, id, changes): Promise<AgentResponse<ServerUpdated>> => {
      if (!(isString(id) && byId(id))) {
        return unknownServer();
      }

      try {
        const asked = serverChanges(changes);
        const updated = await update(id, asked);

        if (movesConnection(asked)) {
          settle(id);
        }

        return { ok: true, result: updated };
      } catch (failure) {
        if (failure instanceof SetupError) {
          return {
            ok: false,
            error: {
              code: "bad_request",
              message: failure.message,
              phrase: failure.phrase,
            },
          };
        }

        throw failure;
      }
    }
  );
}

function registerLeaving(settle: (id: string) => void): void {
  handle("server-remove", shape(isString), async (_e, id) => {
    forgetServer(id, settle);

    return await remove(id);
  });

  /**
   * The server leaves this computer and the platform in the same gesture.
   *
   * The platform first: a local removal that left the row standing would make
   * the only place still able to erase it disappear from the app.
   */
  handle(
    "server-forget",
    shape(anything),
    async (_e, id): Promise<AgentResponse<ServersConfig>> => {
      const server = isString(id) ? byId(id) : null;

      if (!server) {
        return unknownServer();
      }

      const platformId = server.grant?.id;

      if (platformId) {
        const forgotten = await account.forgetServer(platformId);

        if (!forgotten.ok) {
          return { ok: false, error: asAgentError(forgotten.error) };
        }
      }

      forgetServer(server.id, settle);

      return { ok: true, result: await remove(server.id) };
    }
  );
}

function registerTrust(settle: (id: string) => void): void {
  handle(
    "server-host-key",
    shape(anything),
    async (_e, id): Promise<AgentResponse<HostKeyDecision>> =>
      isString(id) ? { ok: true, result: await hostKey(id) } : unknownServer()
  );

  /**
   * A new host key is a new machine: what was open on the old one — sessions,
   * the names it declared, its credentials — says nothing about this one, and
   * the next contact pins what answers.
   */
  handle(
    "server-trust-reinstalled",
    shape(anything),
    async (_e, id): Promise<AgentResponse<ServersConfig>> => {
      if (!isString(id)) {
        return unknownServer();
      }

      forgetServer(id, settle);

      return { ok: true, result: await trustReinstalled(id) };
    }
  );

  /**
   * Installing the app's own key on the server, rather than dictating a line.
   *
   * The password crosses the bridge once, on its way in, and is held nowhere:
   * `installKey` hands it to one `ssh` through its askpass helper and forgets
   * it. The public half is read here rather than sent by the renderer, which
   * never had to carry it.
   */
  handle(
    "server-key-install",
    shape(anything, anything, anything),
    async (event, token, id, password): Promise<AgentResponse<KeyInstall>> => {
      const server = isString(id) ? byId(id) : null;

      if (!server) {
        return unknownServer();
      }

      const half = publicKey(server.id);

      if (!half) {
        return refuseWith("bad_request", "refusal.key.unreadable");
      }

      return await installKey({
        onPhase: relayTo<KeyInstallPhase>(
          event.sender,
          token,
          "server-key-install:phase",
          "phase"
        ),
        password: isString(password) ? password : null,
        paths: paths(),
        publicKey: half,
        server,
      });
    }
  );
}

export function registerServerChannels(settle: (id: string) => void): void {
  registerReading();
  registerAdding();
  registerChanging(settle);
  registerLeaving(settle);
  registerTrust(settle);
}
