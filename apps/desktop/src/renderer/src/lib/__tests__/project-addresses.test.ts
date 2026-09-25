import { describe, expect, it } from "bun:test";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { liveAddresses, routeLabel } from "../project-addresses";

const FLYLEAF = SNAPSHOT.projects[0] as Project;

function withProcesses(processes: Project["processes"]): Project {
  return { ...FLYLEAF, processes };
}

describe("liveAddresses", () => {
  it("lists every name on the web of a running project, in order", () => {
    expect(liveAddresses(FLYLEAF)).toEqual([
      {
        hostname: "flyleaf.example.org",
        label: "web",
        url: "https://flyleaf.example.org",
      },
      {
        hostname: "api-flyleaf.example.org",
        label: "api",
        url: "https://api-flyleaf.example.org",
      },
    ]);
  });

  it("drops the routes of a process that does not run, since they lead nowhere", () => {
    const main = FLYLEAF.processes[0] as Project["processes"][number];

    expect(
      liveAddresses(withProcesses([{ ...main, state: "stopped" }]))
    ).toEqual([]);
    expect(
      liveAddresses(
        withProcesses([
          { ...main, id: "web", state: "failed" },
          {
            ...main,
            id: "worker",
            routes: [
              { hostname: "jobs.example.org", label: "jobs", port: 4000 },
            ],
            state: "online",
          },
        ])
      )
    ).toEqual([
      {
        hostname: "jobs.example.org",
        label: "worker/jobs",
        url: "https://jobs.example.org",
      },
    ]);
  });

  it("offers nothing for a route kept on the machine", () => {
    expect(liveAddresses(SNAPSHOT.projects[1] as Project)).toEqual([]);
  });
});

describe("routeLabel", () => {
  it("names the process only when the project has several", () => {
    expect(routeLabel(1, "shop", "web")).toBe("web");
    expect(routeLabel(2, "shop", "web")).toBe("shop/web");
  });
});
