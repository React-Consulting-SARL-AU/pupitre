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

/**
 * The agent that can be offered to a server, next to the one it runs.
 *
 * Two sources, in this order. The platform first: it publishes a signed
 * version, the agent downloads it itself with its server token and checks its
 * digest, and the app only has a version number to name. The app second, for a
 * server the platform no longer reaches: it carries the binary of its own
 * build, and the matching signature when the publishing chain left it one.
 *
 * Comparing the two versions is all this file does — what is shown belongs to
 * the screen, what is installed belongs to the agent.
 */

export interface CarriedAgent {
  version: string;
  arch: string;
  notes: readonly string[];
  /** Whether the app also carries the signature this architecture requires. */
  signed: boolean;
}

export type OfferSource = "platform" | "app";

export interface AgentOffer extends CarriedAgent {
  source: OfferSource;
}

export type VersionOrder = "ahead" | "same" | "behind" | "unknown";

/**
 * Updating a server is two gestures, in this order and never the other.
 *
 * `agent.upgrade` replaces the binary. The configuration it reads stays where
 * it is, so a release that changed the shape of a file under /etc/pupitre would
 * leave the new binary reading the old shape. `agent.migrate` closes that gap,
 * and the agent has already run it by the time the app asks: what the app adds
 * is the moment — right after the binary changed — and somewhere to show the
 * answer.
 *
 * `migration` is null for an agent from before the ledger: it has no command to
 * answer, and no shape to carry over.
 */
export interface AgentUpgradeOutcome {
  upgrade: AgentUpgradeResult;
  migration: AgentMigrateResult | null;
}

export interface AgentUpdateState {
  /** The version the server answered, or nothing on a machine without agent. */
  installed: string | null;
  /**
   * Where the configuration on the server stands against the agent reading it,
   * as `hello` said it. Null for an agent from before the ledger.
   */
  config: ConfigRevision | null;
  offer: AgentOffer | null;
  order: VersionOrder;
  /** Whether the platform still answers this server, and can sign for it. */
  platform: boolean;
  /** What the compatibility sheet says about this app and this agent. */
  verdict: CompatibilityVerdict;
  /** The oldest agent this version of the app knows how to drive. */
  floor: string | null;
}

/**
 * The fingerprint and the signature come from the platform, which the agent
 * reads with its server token: a server it still reaches needs nothing from the
 * app. `restricted` is a server that lost it seven days ago, `dev` one that
 * never had it, and an agent too old to speak the protocol answers neither.
 */
/**
 * Whether the server owes a migration before anything can be driven on it.
 *
 * The agent refuses on its own — this is only what lets the app say why before
 * the reader presses a button that would be refused.
 */
export function owesMigration(config: ConfigRevision | null): boolean {
  return config !== null && config.state !== "current";
}

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

/**
 * A build that is not semver — `git describe` on an untagged commit — compares
 * to nothing: saying so is the honest answer, and it keeps the app from
 * offering an update it cannot justify.
 */
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

/**
 * The compatibility verdict for the running app and the answering agent. A
 * server one generation behind no longer speaks this app's protocol: the screen
 * does not hide that behind a plain version number.
 */
export function verdictOf(
  appVersion: string,
  installed: string | null
): CompatibilityVerdict {
  return installed ? compatibility(appVersion, installed) : "unknown";
}

export function floorOf(appVersion: string): string | null {
  return agentFloorFor(appVersion);
}
