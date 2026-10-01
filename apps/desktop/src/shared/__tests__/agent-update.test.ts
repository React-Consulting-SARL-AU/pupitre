import { describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import {
  compareVersions,
  floorOf,
  judgedForApp,
  orderOf,
  verdictOf,
  versionCore,
} from "../agent-update";

describe("reading a version", () => {
  it("accepts semver, with or without v, with or without a suffix", () => {
    expect(versionCore("0.4.0")).toEqual([0, 4, 0]);
    expect(versionCore("v1.12.3")).toEqual([1, 12, 3]);
    expect(versionCore("2.0.0-beta.1")).toEqual([2, 0, 0]);
  });

  it("refuses what is not one", () => {
    expect(versionCore("g4c9f2a")).toBeNull();
    expect(versionCore("dev")).toBeNull();
  });
});

describe("the comparison", () => {
  it("compares field by field, not character by character", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.1.0")).toBe(-1);
  });

  it("does not compare a version it cannot read", () => {
    expect(compareVersions("0.4.0", "g4c9f2a")).toBeNull();
  });
});

describe("the order announced on screen", () => {
  it("says what the app can offer, what it must ask for, or nothing", () => {
    expect(orderOf("0.4.0", "0.3.0")).toBe("ahead");
    expect(orderOf("0.3.0", "0.9.0")).toBe("behind");
    expect(orderOf("0.3.0", "0.3.0")).toBe("same");
  });

  it("stays silent on a machine without an agent or an unreadable version", () => {
    expect(orderOf("0.4.0", null)).toBe("unknown");
    expect(orderOf(null, "0.3.0")).toBe("unknown");
    expect(orderOf("0.4.0", "dev")).toBe("unknown");
  });
});

// A 0.9.x agent still answers hello but its own agent.upgrade would roll a 1.0 back: the reinstall pushes it instead.
describe("1.0 facing a 0.9 agent", () => {
  it("judges it too old and names 1.0 as the floor", () => {
    expect(verdictOf("1.0.0", "0.9.1")).toBe("agent_too_old");
    expect(floorOf("1.0.0")).toBe("1.0.0");
  });

  it("keeps a 0.9 app in agreement with its 0.9 agent", () => {
    expect(verdictOf("0.9.1", "0.9.1")).toBe("ok");
    expect(verdictOf("0.9.1", "1.0.0")).toBe("app_too_old");
  });
});

function managedBy(agentVersion: string | null): ProbeResult {
  return {
    agent_version: agentVersion,
    arch: "amd64",
    disk_free_gb: 38,
    docker: false,
    installed_modules: [],
    os: "ubuntu",
    panel: null,
    ports: [],
    ram_mb: 8192,
    sudo: true,
    version: "24.04",
    verdict: {
      fixes: [],
      kind: "managed",
      level: "ready",
      reasons: [],
      up_to_date: true,
    },
  };
}

describe("2.0 facing a 1.x agent", () => {
  it("judges it too old: it speaks protocol 2 and refuses the 2.0 hello", () => {
    expect(verdictOf("2.0.0", "1.2.1")).toBe("agent_too_old");
    expect(floorOf("2.0.0")).toBe("2.0.0");
  });

  it("tells the install to replace the agent the shell probe believes is up to date", () => {
    expect(judgedForApp(managedBy("1.2.1"), "2.0.0").verdict).toMatchObject({
      level: "warning",
      up_to_date: false,
    });
  });

  it("leaves as is an agent of the same generation, a development build and a bare machine", () => {
    const current = managedBy("2.0.0");
    const development = managedBy("0.0.0-dev");
    const bare = {
      ...managedBy(null),
      verdict: { fixes: [], kind: "bare", level: "ready", reasons: [] },
    } satisfies ProbeResult;

    expect(judgedForApp(current, "2.0.0")).toBe(current);
    expect(judgedForApp(development, "g4c9f2a")).toBe(development);
    expect(judgedForApp(bare, "2.0.0")).toBe(bare);
  });
});
