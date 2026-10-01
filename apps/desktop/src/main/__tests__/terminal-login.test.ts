import { describe, expect, it } from "bun:test";
import {
  type LoginDeps,
  openFromTerminal,
  openPendingLogin,
  releaseForwards,
  rememberForward,
} from "../terminal-login";

const CLAUDE =
  "https://claude.ai/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A54545%2Fcallback&state=x";
const NEON =
  "https://oauth2.neon.tech/oauth2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A41233%2Fcallback";
const DEVICE = "https://github.com/login/device";

function harness(pending: string | null = CLAUDE): {
  deps: LoginDeps;
  forwarded: { id: string; serverId: string; port: number }[];
  opened: string[];
  order: string[];
} {
  const forwarded: { id: string; serverId: string; port: number }[] = [];
  const opened: string[] = [];
  const order: string[] = [];

  return {
    deps: {
      forward: (id, serverId, port) => {
        forwarded.push({ id, port, serverId });
        order.push("forward");

        return Promise.resolve(true);
      },
      openExternal: (url) => {
        opened.push(url);
        order.push("browser");
      },
      openable: (url) => url.startsWith("https://"),
      pending: (id) =>
        id === "t1" && pending ? { host: "claude.ai", url: pending } : null,
      serverOf: (id) => (id === "t1" || id === "t2" ? "srv-1" : null),
    },
    forwarded,
    opened,
    order,
  };
}

describe("a login opened in the browser", () => {
  it("first brings up the port it returns on, then opens the browser", async () => {
    const h = harness();

    expect(await openPendingLogin("t1", h.deps)).toBe(true);
    expect(h.forwarded).toEqual([
      { id: "t1", port: 54_545, serverId: "srv-1" },
    ]);
    expect(h.opened).toEqual([CLAUDE]);
    expect(h.order).toEqual(["forward", "browser"]);
  });

  it("opens without a tunnel a flow that does not return to the machine", async () => {
    const h = harness(DEVICE);

    expect(await openPendingLogin("t1", h.deps)).toBe(true);
    expect(h.forwarded).toEqual([]);
    expect(h.opened).toEqual([DEVICE]);
  });

  it("opens nothing for a session with no address, or an unknown one", async () => {
    const h = harness(null);

    expect(await openPendingLogin("t1", h.deps)).toBe(false);
    expect(await openPendingLogin("t9", h.deps)).toBe(false);
    expect(h.opened).toEqual([]);
  });

  it("treats an address clicked in the session the same way", async () => {
    const h = harness();

    expect(await openFromTerminal("t2", NEON, h.deps)).toBe(true);
    expect(h.forwarded).toEqual([
      { id: "t2", port: 41_233, serverId: "srv-1" },
    ]);
    expect(h.opened).toEqual([NEON]);
  });

  it("opens the whole address when the clicked one is only its first line", async () => {
    const h = harness();
    const firstLine = CLAUDE.slice(0, 60);

    expect(await openFromTerminal("t1", firstLine, h.deps)).toBe(true);
    expect(h.opened).toEqual([CLAUDE]);
    expect(h.forwarded).toEqual([
      { id: "t1", port: 54_545, serverId: "srv-1" },
    ]);
  });

  it("refuses an address the browser must not receive", async () => {
    const h = harness();

    expect(await openFromTerminal("t2", "http://exemple.test", h.deps)).toBe(
      false
    );
    expect(await openFromTerminal("t9", CLAUDE, h.deps)).toBe(false);
    expect(h.opened).toEqual([]);
  });
});

describe("a session's tunnels", () => {
  it("close with it, and only once", () => {
    const closed: string[] = [];

    rememberForward("t1", "f1");
    rememberForward("t1", "f2");
    rememberForward("t2", "f3");

    releaseForwards("t1", (id) => closed.push(id));
    releaseForwards("t1", (id) => closed.push(id));

    expect(closed).toEqual(["f1", "f2"]);
  });
});
