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

describe("the link to a server", () => {
  it("announces the loss and the return by the server's name, never by its identifier", () => {
    knownServers({ "srv-1": "atelier" });

    useChannel.getState().note("srv-1", "open");
    useChannel.getState().note("srv-1", "lost");

    expect(useAnnouncements.getState().assertive.text).toContain("atelier");
    expect(useAnnouncements.getState().assertive.text).not.toContain("srv-1");

    useChannel.getState().note("srv-1", "open");

    expect(useAnnouncements.getState().polite.text).toContain("atelier");
  });

  it("falls back to the identifier of a server the list does not know", () => {
    knownServers({});

    useChannel.getState().note("srv-9", "open");
    useChannel.getState().note("srv-9", "lost");

    expect(useAnnouncements.getState().assertive.text).toContain("srv-9");
  });

  it("says nothing about a server never heard of before", () => {
    knownServers({ "srv-1": "atelier" });

    useChannel.getState().note("srv-1", "lost");

    expect(useAnnouncements.getState().assertive.text).toBe("");
  });
});
