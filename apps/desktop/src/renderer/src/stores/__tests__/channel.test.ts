import { beforeEach, describe, expect, it } from "bun:test";
import { useAnnouncements } from "../announcements";
import { useChannel } from "../channel";
import { useServers } from "../servers";

function knownServers(names: Record<string, string>): void {
  useServers.setState({
    config: {
      active: null,
      dismissed: [],
      servers: Object.entries(names).map(([id, name]) => ({
        host: "203.0.113.10",
        id,
        keyPath: `/data/keys/${id}`,
        name,
        origin: "app" as const,
        port: 22,
        user: "root",
      })),
    },
    status: "ready",
  });
}

beforeEach(() => {
  useChannel.setState({ states: {} });
  useAnnouncements.getState().clear();
});

describe("la liaison à un serveur", () => {
  it("annonce la perte et le retour par le nom du serveur, jamais par son identifiant", () => {
    knownServers({ "srv-1": "atelier" });

    useChannel.getState().note("srv-1", "open");
    useChannel.getState().note("srv-1", "lost");

    expect(useAnnouncements.getState().assertive.text).toContain("atelier");
    expect(useAnnouncements.getState().assertive.text).not.toContain("srv-1");

    useChannel.getState().note("srv-1", "open");

    expect(useAnnouncements.getState().polite.text).toContain("atelier");
  });

  it("se rabat sur l'identifiant d'un serveur que la liste ne connaît pas", () => {
    knownServers({});

    useChannel.getState().note("srv-9", "open");
    useChannel.getState().note("srv-9", "lost");

    expect(useAnnouncements.getState().assertive.text).toContain("srv-9");
  });

  it("ne dit rien d'un serveur dont on n'avait jamais entendu parler", () => {
    knownServers({ "srv-1": "atelier" });

    useChannel.getState().note("srv-1", "lost");

    expect(useAnnouncements.getState().assertive.text).toBe("");
  });
});
