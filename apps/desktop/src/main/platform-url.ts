import type { BuildKind } from "@shared/account";
import { app } from "electron";
import {
  agentPlatformUrlOf,
  buildKindOf,
  platformUrlOf,
} from "./platform-client";

export function platformUrl(): string {
  return platformUrlOf(app.isPackaged, process.env.PUPITRE_PLATFORM_URL);
}

/** The VPS cannot reach a dev console on this computer, so the agent gets the tunnel publishing it. */
export function agentPlatformUrl(): string {
  return agentPlatformUrlOf(
    app.isPackaged,
    process.env.PUPITRE_AGENT_PLATFORM_URL,
    platformUrl()
  );
}

export function buildKind(): BuildKind {
  return buildKindOf(app.isPackaged, platformUrl());
}
