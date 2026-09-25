import type { BuildKind } from "@shared/account";
import { app } from "electron";
import {
  agentPlatformUrlOf,
  buildKindOf,
  platformUrlOf,
} from "./platform-client";

/**
 * Which platform this build talks to: the hosted one once packaged, the
 * console beside it in development, or the one `PUPITRE_PLATFORM_URL` names —
 * `bun run dev:desktop:prod` points it at the hosted platform.
 */
export function platformUrl(): string {
  return platformUrlOf(app.isPackaged, process.env.PUPITRE_PLATFORM_URL);
}

/**
 * The same platform, as the agent reaches it: the API's own base, not the
 * console's — and under a name the server can actually resolve.
 *
 * A development console is served on this computer, which the VPS has no way to
 * reach; what leaves for the server is the tunnel that publishes that same
 * console. `PUPITRE_AGENT_PLATFORM_URL` names another one, in a development
 * build only, when the agent has to answer somewhere else than the app does.
 */
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
