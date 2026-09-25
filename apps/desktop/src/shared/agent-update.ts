import type {
  AgentMigrateResult,
  ConfigRevision,
} from "@pupitre/shared/agent-protocol/migrate";
import type { Entitlement } from "@pupitre/shared/agent-protocol/session";
import type { AgentUpgradeResult } from "@pupitre/shared/agent-protocol/system";
import {
  agentFloorFor,
  type CompatibilityVerdict,
  compatibility,
} from "@pupitre/shared/compat";

export interface CarriedAgent {
  version: string;
  arch: string;
  notes: readonly string[];
  signed: boolean;
}

/** The platform first, the agent fetching and checking it itself; the app's own binary when it no longer answers. */
export type OfferSource = "platform" | "app";

export interface AgentOffer extends CarriedAgent {
  source: OfferSource;
}

export type VersionOrder = "ahead" | "same" | "behind" | "unknown";

/** `agent.upgrade` then `agent.migrate`, never the other way; `migration` is null for a pre-ledger agent. */
export interface AgentUpgradeOutcome {
  upgrade: AgentUpgradeResult;
  migration: AgentMigrateResult | null;
}

export interface AgentUpdateState {
  installed: string | null;
  /** Null for an agent from before the ledger. */
  config: ConfigRevision | null;
  offer: AgentOffer | null;
  order: VersionOrder;
  platform: boolean;
  verdict: CompatibilityVerdict;
  /** The oldest agent this version of the app knows how to drive. */
  floor: string | null;
}

/** The agent refuses on its own; this only lets the app say why before a button that would be refused. */
export function owesMigration(config: ConfigRevision | null): boolean {
  return config !== null && config.state !== "current";
}

/** `restricted` lost the platform seven days ago and `dev` never had it: neither can sign an update. */
export function platformAnswers(entitlement: Entitlement | null): boolean {
  return entitlement === "valid" || entitlement === "grace";
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function versionCore(version: string): [number, number, number] | null {
  const found = SEMVER.exec(version.trim());

  if (!found) {
    return null;
  }

  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

/** A non-semver build (`git describe` on an untagged commit) compares to nothing, so no update is offered. */
export function compareVersions(a: string, b: string): number | null {
  const left = versionCore(a);
  const right = versionCore(b);

  if (!(left && right)) {
    return null;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] < right[i] ? -1 : 1;
    }
  }

  return 0;
}

export function orderOf(
  offered: string | null,
  installed: string | null
): VersionOrder {
  if (!(offered && installed)) {
    return "unknown";
  }

  const compared = compareVersions(offered, installed);

  if (compared === null) {
    return "unknown";
  }

  if (compared === 0) {
    return "same";
  }

  return compared > 0 ? "ahead" : "behind";
}

export function verdictOf(
  appVersion: string,
  installed: string | null
): CompatibilityVerdict {
  return installed ? compatibility(appVersion, installed) : "unknown";
}

export function floorOf(appVersion: string): string | null {
  return agentFloorFor(appVersion);
}
