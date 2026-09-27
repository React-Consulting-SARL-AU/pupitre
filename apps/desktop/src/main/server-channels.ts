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
import { forgetAccess } from "./access";
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

const unknownServer = () => refuseWith("bad_request", "refusal.server.unknown");

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
  forgetAccess(serverId);
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

  // The renderer never names a key path of its own: only a file picked here is accepted.
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

  // The platform first: a local removal would lose the only handle able to erase the platform's row.
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

  // A new host key is a new machine: nothing held for the old one carries over.
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

  // The password is held nowhere: `installKey` hands it to one `ssh` through askpass and forgets it.
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
