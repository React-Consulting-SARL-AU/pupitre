import type { BuildKind } from "@shared/account";
import { app } from "electron";
import {
  agentBaseUrl,
  buildKindOf,
  DEFAULT_PLATFORM_URL,
  LOCAL_PLATFORM_URL,
} from "./platform-client";

/**
 * Which platform this build talks to.
 *
 * A packaged app knows only the hosted one. A development build talks to the
 * console running beside it, so the whole account — device flow, enrolment,
 * console links — stays on this computer; `PUPITRE_PLATFORM_URL` names another
 * one when it is elsewhere, the hosted platform included: that is how a screen
 * is tried against the real account and the real servers without a release.
 */
export function platformUrl(): string {
  const fallback = app.isPackaged ? DEFAULT_PLATFORM_URL : LOCAL_PLATFORM_URL;

  return process.env.PUPITRE_PLATFORM_URL || fallback;
}

/**
 * The same platform, as the agent reaches it: the API's own base, not the
 * console's — and under a name the server can actually resolve.
 *
 * A development console is served on this computer, which the VPS has no way to
 * reach; what leaves for the server is the tunnel that publishes that same
 * console. `PUPITRE_AGENT_PLATFORM_URL` names another one when the agent has to
 * answer somewhere else than the app does.
 */
export function agentPlatformUrl(): string {
  const base = process.env.PUPITRE_AGENT_PLATFORM_URL || platformUrl();

  return new URL("/api/v1", agentBaseUrl(base)).toString();
}

export function buildKind(): BuildKind {
  return buildKindOf(app.isPackaged, platformUrl());
}
