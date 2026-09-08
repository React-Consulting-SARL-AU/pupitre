import type { Entitlement } from "@pupitre/shared/agent-protocol/session";
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

export interface AgentUpdateState {
  /** The version the server answered, or nothing on a machine without agent. */
  installed: string | null;
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
