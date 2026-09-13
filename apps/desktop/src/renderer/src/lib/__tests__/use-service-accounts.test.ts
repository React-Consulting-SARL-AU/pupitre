import { describe, expect, it } from "bun:test";
import type { Service } from "@pupitre/shared/agent-protocol/state";
import { NO_CONNECTIONS } from "@shared/connections";
import { serviceAccountsOf } from "../use-service-accounts";

const SERVER = "srv-1";

const SERVICES: readonly Service[] = [
  {
    configured: true,
    id: "ai.claude",
    name: "Claude Code",
    runs: true,
    state: "running",
  },
  {
    configured: true,
    id: "db.postgres",
    name: "PostgreSQL",
    runs: true,
    state: "running",
  },
  {
    configured: true,
    id: "editor.jetbrains",
    name: "JetBrains",
    runs: true,
    state: "stopped",
  },
  {
    configured: true,
    connection: "cloudflare",
    id: "exposure.cloudflare",
    name: "Cloudflare Tunnel",
    runs: true,
    state: "running",
  },
];

describe("les comptes lus pour le tableau de bord", () => {
  it("joignent ce que les CLI ont dit et le compte que l'ordinateur tient", () => {
    expect(
      serviceAccountsOf(
        SERVICES,
        {
          "ai.claude": { login: { state: "signed_in" }, status: "answered" },
          "db.postgres": { login: null, status: "answered" },
          "editor.jetbrains": { status: "asking" },
        },
        SERVER,
        SERVER,
        {
          ...NO_CONNECTIONS,
          cloudflare: { account: null, sealed: false, status: "connected" },
        }
      )
    ).toEqual({ "ai.claude": "signed_in", "exposure.cloudflare": "signed_in" });
  });

  it("disent le tunnel non connecté sans compte tenu, et rien des CLI d'un autre serveur", () => {
    expect(
      serviceAccountsOf(
        SERVICES,
        { "ai.claude": { login: { state: "signed_in" }, status: "answered" } },
        "srv-2",
        SERVER,
        NO_CONNECTIONS
      )
    ).toEqual({ "exposure.cloudflare": "signed_out" });
  });
});
