import { describe, expect, it } from "bun:test";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { accessTurned, guardedProcess } from "../process-access";

const INTRANET: Project = {
  boot: false,
  dir: "intranet",
  name: "intranet",
  path: "/home/dev/projects/intranet",
  processes: [
    {
      cmd: "./gradlew :server:bootRun",
      dir: ".",
      host: "127.0.0.1",
      id: "server",
      install: "./gradlew --version",
      path: "/home/dev/projects/intranet",
      pkgmgr: "gradle",
      port: 8081,
      routes: [
        { hostname: "api-intranet.example.dev", label: "web", port: 8081 },
      ],
      state: "online",
    },
    {
      cmd: "pnpm dev --port 3001",
      dir: "client",
      host: "127.0.0.1",
      id: "client",
      install: "pnpm install",
      path: "/home/dev/projects/intranet/client",
      pkgmgr: "pnpm",
      port: 3001,
      protected: false,
      routes: [{ hostname: "intranet.example.dev", label: "web", port: 3001 }],
      state: "online",
    },
  ],
  protected: true,
  state: "online",
};

function processOf(params: ReturnType<typeof accessTurned>, id: string) {
  return params?.patch.processes?.find((process) => process.id === id);
}

describe("a process's access, turned over from its address", () => {
  it("reads what the process says, or else what the project says", () => {
    const [server, client] = INTRANET.processes;

    expect(server && guardedProcess(INTRANET, server)).toBe(true);
    expect(client && guardedProcess(INTRANET, client)).toBe(false);
  });

  it("makes a process public without touching the others", () => {
    const params = accessTurned(INTRANET, "server");

    expect(params?.name).toBe("intranet");
    expect(processOf(params, "server")?.protected).toBe(false);
    expect(processOf(params, "client")?.protected).toBe(false);
    expect(processOf(params, "server")?.routes).toEqual([
      { hostname: "api-intranet.example.dev", label: "web", port: 8081 },
    ]);
    expect(processOf(params, "server")?.install).toBe("./gradlew --version");
  });

  it("lets a process protected again follow the project", () => {
    const params = accessTurned(INTRANET, "client");

    expect(processOf(params, "client")).not.toHaveProperty("protected");
  });

  it("turns nothing over without an access gate", () => {
    const { protected: _gate, ...ungated } = INTRANET;

    expect(accessTurned(ungated, "server")).toBeNull();
    expect(accessTurned(INTRANET, "worker")).toBeNull();
  });
});
