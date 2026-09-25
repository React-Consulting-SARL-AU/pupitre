import { beforeEach, describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { BARE, OCCUPIED } from "../../__tests__/probe-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { probeOf, useInspection } from "../inspection";

describe("l'inspection", () => {
  beforeEach(() => {
    useInspection.setState({ inspection: { status: "idle" }, probes: {} });
  });

  it("dit qui elle inspecte pendant qu'elle attend", async () => {
    const waiting: ((answer: AgentResponse<ProbeResult>) => void)[] = [];

    stubPupitre({
      inspect: () =>
        new Promise((resolve) => {
          waiting.push(resolve);
        }),
    });

    const running = useInspection.getState().inspect("srv-1");

    expect(useInspection.getState().inspection).toEqual({
      serverId: "srv-1",
      status: "running",
    });

    waiting[0]({ ok: true, result: BARE });
    await running;
  });

  it("garde le rapport tel que la sonde le renvoie", async () => {
    stubPupitre({
      inspect: () => Promise.resolve({ ok: true, result: OCCUPIED }),
    });

    await useInspection.getState().inspect("srv-1");

    expect(useInspection.getState().inspection).toEqual({
      probe: OCCUPIED,
      serverId: "srv-1",
      status: "done",
    });
  });

  it("laisse le rapport en mémoire pour l'écran suivant", async () => {
    stubPupitre({ inspect: () => Promise.resolve({ ok: true, result: BARE }) });

    await useInspection.getState().inspect("srv-1");
    useInspection.getState().forget();

    expect(useInspection.getState().inspection).toEqual({ status: "idle" });
    expect(probeOf("srv-1")).toEqual(BARE);
    expect(probeOf("srv-2")).toBeNull();
    expect(probeOf(null)).toBeNull();
  });

  it("garde le remède de l'agent quand la sonde échoue", async () => {
    stubPupitre({
      inspect: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "disconnected",
            message: "La sonde n'a pas pu s'exécuter sur le serveur.",
            fix: "Vérifie que le serveur répond en SSH, puis relance l'inspection.",
          },
        }),
    });

    await useInspection.getState().inspect("srv-1");

    expect(useInspection.getState().inspection).toEqual({
      error: {
        code: "disconnected",
        message: "La sonde n'a pas pu s'exécuter sur le serveur.",
        fix: "Vérifie que le serveur répond en SSH, puis relance l'inspection.",
      },
      serverId: "srv-1",
      status: "failed",
    });
    expect(probeOf("srv-1")).toBeNull();
  });

  it("laisse tomber la réponse d'une machine quittée pour une autre", async () => {
    const waiting: Record<
      string,
      (answer: AgentResponse<ProbeResult>) => void
    > = {};
    stubPupitre({
      inspect: (serverId: string) =>
        new Promise((resolve) => {
          waiting[serverId] = resolve;
        }),
    });

    const first = useInspection.getState().inspect("srv-1");
    const second = useInspection.getState().inspect("srv-2");

    waiting["srv-2"]?.({ ok: true, result: BARE });
    await second;
    waiting["srv-1"]?.({ ok: true, result: OCCUPIED });
    await first;

    expect(useInspection.getState().inspection).toEqual({
      probe: BARE,
      serverId: "srv-2",
      status: "done",
    });
    expect(probeOf("srv-1")).toEqual(OCCUPIED);
  });

  it("ne rouvre pas une inspection oubliée sur une réponse tardive", async () => {
    let settle: (answer: AgentResponse<ProbeResult>) => void = () => undefined;

    stubPupitre({
      inspect: () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    });

    const running = useInspection.getState().inspect("srv-1");

    useInspection.getState().forget();
    settle({ ok: true, result: BARE });
    await running;

    expect(useInspection.getState().inspection).toEqual({ status: "idle" });
  });
});
