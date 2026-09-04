import { beforeEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useShots } from "../shots";

const SERVER = "srv-1";

const SHOTS = [
  {
    created_at: "2026-09-04T10:00:00Z",
    name: "accueil.png",
    path: "/var/lib/pupitre/shots/accueil.png",
    size_bytes: 240_000,
  },
];

function agent(answers: Partial<Record<CommandName, unknown>>): void {
  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName) => {
      const answer = answers[cmd];

      return Promise.resolve(
        answer === undefined
          ? { error: { code: "internal", message: "rien" }, ok: false }
          : { ok: true, result: answer }
      );
    },
    openUrl: () => Promise.resolve(),
  });
}

beforeEach(() => {
  useShots.getState().forget();
});

describe("la galerie", () => {
  it("liste les captures que le serveur a nommées", async () => {
    agent({ "shots.list": { shots: SHOTS } });

    await useShots.getState().read(SERVER);

    expect(useShots.getState().state).toMatchObject({
      shots: [{ name: "accueil.png", size_bytes: 240_000 }],
      status: "read",
    });
  });

  it("garde le refus de l'agent, sans vider ce qui est affiché", async () => {
    agent({});

    await useShots.getState().read(SERVER);

    expect(useShots.getState().state).toMatchObject({ status: "failed" });
  });

  it("dit combien le nettoyage a supprimé, puis relit", async () => {
    agent({
      "shots.clean": { removed: 12 },
      "shots.list": { shots: [] },
    });

    await useShots.getState().clean(SERVER);

    expect(useShots.getState().removed).toBe(12);
    expect(useShots.getState().state).toMatchObject({
      shots: [],
      status: "read",
    });
  });

  it("ouvre l'adresse que le serveur donne, jamais une adresse construite", async () => {
    const opened: string[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({ ok: true, result: { url: "https://shots.exemple" } }),
      openUrl: (url: string) => {
        opened.push(url);

        return Promise.resolve();
      },
    });

    await useShots.getState().openGallery(SERVER);

    expect(opened).toEqual(["https://shots.exemple"]);
    expect(useShots.getState().gallery).toBe("https://shots.exemple");
  });
});
