import { beforeEach, describe, expect, it } from "bun:test";
import type { LocalAgentsState } from "@pupitre/shared/desktop-mcp";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useLocalAgents } from "../local-agents";

const OFF: LocalAgentsState = {
  clients: [],
  enabled: false,
  machines: [{ entry: "pupitre-atelier", serverName: "Atelier" }],
  supported: true,
  unattended: false,
};

beforeEach(() => {
  useLocalAgents.setState({ state: null });
});

describe("the AI agents of this computer", () => {
  it("draws nothing before reading, then what was read", async () => {
    stubPupitre({ localAgentsState: () => Promise.resolve(OFF) });

    expect(useLocalAgents.getState().state).toBeNull();

    await useLocalAgents.getState().read();

    expect(useLocalAgents.getState().state).toEqual(OFF);
  });

  it("shows what the clients say after declaring, not what was requested", async () => {
    const asked: boolean[] = [];
    const declared: LocalAgentsState = {
      ...OFF,
      clients: [
        {
          declared: [],
          found: true,
          id: "claude-code",
          problem: "pupitre: add exited 1",
        },
      ],
      enabled: true,
    };

    stubPupitre({
      setLocalAgents: (enabled) => {
        asked.push(enabled);

        return Promise.resolve(declared);
      },
    });

    await useLocalAgents.getState().set(true);

    expect(asked).toEqual([true]);
    expect(useLocalAgents.getState().state).toEqual(declared);
  });

  it("lets changes run unattended only on request", async () => {
    const asked: boolean[] = [];
    const unattended: LocalAgentsState = {
      ...OFF,
      enabled: true,
      unattended: true,
    };

    stubPupitre({
      setLocalAgentsUnattended: (value) => {
        asked.push(value);

        return Promise.resolve(unattended);
      },
    });

    await useLocalAgents.getState().setUnattended(true);

    expect(asked).toEqual([true]);
    expect(useLocalAgents.getState().state).toEqual(unattended);
  });
});
