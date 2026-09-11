import { beforeEach, describe, expect, it } from "bun:test";
import type { Manifest } from "@pupitre/shared/catalog";
import { NO_CONNECTIONS } from "@shared/connections";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { forgetScope, useConnections } from "../connections";

const CONNECTED = {
  ...NO_CONNECTIONS,
  github: {
    account: { id: "42", name: "ada" },
    sealed: true,
    status: "connected" as const,
  },
};

function manifest(id: string, connection?: Manifest["connection"]): Manifest {
  return {
    category: "tool",
    connection,
    description: id,
    fields: [],
    id: id as Manifest["id"],
    name: id,
    resources: { disk_gb: 0, ram_mb: 0 },
    version: "1",
  } as unknown as Manifest;
}

beforeEach(() => {
  useConnections.setState({ health: {}, state: CONNECTED });
});

describe("la santé d'un jeton", () => {
  it("dit comme quel compte le fournisseur répond, et le renomme", async () => {
    stubPupitre({
      verifyAccount: () =>
        Promise.resolve({
          ok: true,
          result: {
            account: { id: "42", name: "ada-renamed" },
            status: "answered",
          },
        }),
    });

    await useConnections.getState().verify("github");

    expect(useConnections.getState().health.github).toMatchObject({
      account: "ada-renamed",
      status: "answered",
    });
    expect(useConnections.getState().state.github).toMatchObject({
      account: { name: "ada-renamed" },
      status: "connected",
    });
  });

  it("garde le refus d'un jeton révoqué, avec son remède", async () => {
    stubPupitre({
      verifyAccount: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            message: "refusal.connection.revoked",
            phrase: { id: "refusal.connection.revoked" },
          },
          ok: false,
        }),
    });

    await useConnections.getState().verify("github");

    expect(useConnections.getState().health.github).toMatchObject({
      error: { message: "refusal.connection.revoked" },
      status: "refused",
    });
  });

  it("dit qu'un fournisseur muet ne peut pas être interrogé", async () => {
    stubPupitre({
      verifyAccount: () =>
        Promise.resolve({ ok: true, result: { status: "unaskable" } }),
    });

    await useConnections.getState().verify("1password");

    expect(useConnections.getState().health["1password"]).toEqual({
      status: "unaskable",
    });
  });

  it("oublie la santé avec le compte", async () => {
    useConnections.setState({
      health: { github: { status: "unaskable" } },
    });
    stubPupitre({ forgetAccount: () => Promise.resolve(NO_CONNECTIONS) });

    await useConnections.getState().forget("github");

    expect(useConnections.getState().health.github).toBeUndefined();
    expect(useConnections.getState().state.github).toEqual({
      status: "absent",
    });
  });
});

describe("le rayon d'action d'un oubli", () => {
  const manifests = [
    manifest("tool.github", "github"),
    manifest("tool.neon", "neon"),
    manifest("runtime.node"),
  ];

  it("nomme les modules installés qui déclarent ce compte", () => {
    expect(
      forgetScope("github", ["tool.github", "runtime.node"], manifests)
    ).toEqual({ known: true, modules: ["tool.github"] });
  });

  it("ne nomme pas un module qui n'est pas installé", () => {
    expect(forgetScope("neon", ["tool.github"], manifests)).toEqual({
      known: true,
      modules: [],
    });
  });

  it("dit qu'il ne sait pas quand le catalogue n'a pas été lu", () => {
    expect(forgetScope("github", ["tool.github"], null)).toEqual({
      known: false,
      modules: [],
    });
  });
});
