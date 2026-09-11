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

describe("une connexion ouverte dans le navigateur", () => {
  it("apporte d'abord le port sur lequel elle revient, puis ouvre le navigateur", async () => {
    const h = harness();

    expect(await openPendingLogin("t1", h.deps)).toBe(true);
    expect(h.forwarded).toEqual([
      { id: "t1", port: 54_545, serverId: "srv-1" },
    ]);
    expect(h.opened).toEqual([CLAUDE]);
    expect(h.order).toEqual(["forward", "browser"]);
  });

  it("ouvre sans tunnel un flux qui ne revient pas sur la machine", async () => {
    const h = harness(DEVICE);

    expect(await openPendingLogin("t1", h.deps)).toBe(true);
    expect(h.forwarded).toEqual([]);
    expect(h.opened).toEqual([DEVICE]);
  });

  it("n'ouvre rien pour une session sans adresse, ou inconnue", async () => {
    const h = harness(null);

    expect(await openPendingLogin("t1", h.deps)).toBe(false);
    expect(await openPendingLogin("t9", h.deps)).toBe(false);
    expect(h.opened).toEqual([]);
  });

  it("traite une adresse cliquée dans la session de la même façon", async () => {
    const h = harness();

    expect(await openFromTerminal("t2", NEON, h.deps)).toBe(true);
    expect(h.forwarded).toEqual([
      { id: "t2", port: 41_233, serverId: "srv-1" },
    ]);
    expect(h.opened).toEqual([NEON]);
  });

  it("refuse une adresse que le navigateur ne doit pas recevoir", async () => {
    const h = harness();

    expect(await openFromTerminal("t2", "http://exemple.test", h.deps)).toBe(
      false
    );
    expect(await openFromTerminal("t9", CLAUDE, h.deps)).toBe(false);
    expect(h.opened).toEqual([]);
  });
});

describe("les tunnels d'une session", () => {
  it("se ferment avec elle, et une seule fois", () => {
    const closed: string[] = [];

    rememberForward("t1", "f1");
    rememberForward("t1", "f2");
    rememberForward("t2", "f3");

    releaseForwards("t1", (id) => closed.push(id));
    releaseForwards("t1", (id) => closed.push(id));

    expect(closed).toEqual(["f1", "f2"]);
  });
});
