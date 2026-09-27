import { useServers } from "@renderer/stores/servers";

/** A project's address opens on the server shown: a protected one carries this computer's key. */
export async function openAddress(url: string): Promise<void> {
  const serverId = useServers.getState().config?.active ?? null;

  if (!serverId) {
    await window.pupitre.openUrl(url);

    return;
  }

  await window.pupitre.openAddress(serverId, url);
}
