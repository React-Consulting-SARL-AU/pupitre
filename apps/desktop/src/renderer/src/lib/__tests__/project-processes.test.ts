import { describe, expect, it } from "bun:test";
import {
  PORT_SPAN_MAX,
  type Project,
} from "@pupitre/shared/agent-protocol/state";
import {
  firstProcess,
  heldAround,
  processesFromProject,
  processesReady,
  processPatches,
  processRequests,
  spanProblem,
  spanRange,
} from "../project-processes";

const NO_HELD = { hostnames: [], ports: [] };

const BOX: Project = {
  boot: false,
  dir: "box",
  name: "box",
  path: "/home/dev/projects/box",
  processes: [
    {
      cmd: "bun run dev",
      dir: ".",
      host: "127.0.0.1",
      id: "gateway",
      path: "/home/dev/projects/box",
      pkgmgr: "bun",
      port: 3000,
      port_span: 10,
      routes: [],
      state: "online",
    },
  ],
  state: "online",
};

function spanning(port: number, span: number) {
  return { ...firstProcess(port, false), cmd: "bun run dev", span };
}

describe("a process's span of ports", () => {
  it("is read from the agent, one port when it says nothing", () => {
    expect(processesFromProject(BOX)[0]?.span).toBe(10);

    const [gateway] = BOX.processes;
    const older = {
      ...BOX,
      processes: [{ ...gateway, port_span: undefined }],
    } as Project;

    expect(processesFromProject(older)[0]?.span).toBe(1);
  });

  it("travels only above one, so an agent that predates spans accepts the call", () => {
    const drafts = [spanning(3000, 1), spanning(3100, 10)];

    expect(
      processRequests(drafts, false).map((request) => request.port_span)
    ).toEqual([undefined, 10]);
    expect(
      processPatches(drafts, false).map((patch) => patch.port_span)
    ).toEqual([undefined, 10]);
  });

  it("reads as the range it covers", () => {
    expect(spanRange(spanning(3000, 10))).toBe("3000 – 3009");
    expect(spanRange(spanning(3000, 1))).toBe("3000");
  });

  it("keeps the other processes of the draft out of it", () => {
    const drafts = [spanning(3000, 10), spanning(3200, 1)];

    expect(heldAround(drafts, 1, NO_HELD).ports).toEqual([
      3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009,
    ]);
  });

  it("refuses a size out of bounds, a span past the last port, and ports someone holds", () => {
    expect(spanProblem([spanning(3000, 0)], 0, NO_HELD)).toBe("span");
    expect(spanProblem([spanning(3000, PORT_SPAN_MAX + 1)], 0, NO_HELD)).toBe(
      "span"
    );
    expect(spanProblem([spanning(65_530, 10)], 0, NO_HELD)).toBe("span");
    expect(
      spanProblem([spanning(3000, 10)], 0, { hostnames: [], ports: [3005] })
    ).toBe("spanTaken");
    expect(
      spanProblem([spanning(3000, 10), spanning(3004, 1)], 0, NO_HELD)
    ).toBe("spanTaken");
    expect(spanProblem([spanning(3000, 10)], 0, NO_HELD)).toBeNull();
  });

  it("holds the form back while it is refused", () => {
    expect(
      processesReady(
        [spanning(3000, 10)],
        { hostnames: [], ports: [3005] },
        false
      )
    ).toBe(false);
    expect(processesReady([spanning(3000, 10)], NO_HELD, false)).toBe(true);
  });
});
