import type { LoginState, Service } from "@pupitre/shared/agent-protocol/state";
import type { ConnectionsState } from "@shared/connections";
import { useEffect, useMemo } from "react";
import { useConnections } from "../stores/connections";
import { type LoginAnswer, useLogins } from "../stores/logins";
import { accountStateOf } from "./account-state";

/**
 * Whose account each service works as, by module identifier.
 *
 * `answers` are the CLIs' own, and count only when they were asked of this
 * server; `connections` are the accounts this computer holds, which a module
 * declaring one is read against. A module with nothing to sign in to has no
 * entry.
 */
export function serviceAccountsOf(
  services: readonly Service[],
  answers: Readonly<Record<string, LoginAnswer>>,
  answeredFor: string | null,
  serverId: string | null,
  connections: ConnectionsState
): Readonly<Record<string, LoginState>> {
  const accounts: Record<string, LoginState> = {};

  for (const service of services) {
    const answer = answeredFor === serverId ? answers[service.id] : undefined;
    const login =
      answer?.status === "answered" ? (answer.login ?? undefined) : undefined;
    const held = service.connection ? connections[service.connection] : null;
    const state = accountStateOf(login, held);

    if (state) {
      accounts[service.id] = state;
    }
  }

  return accounts;
}

/**
 * The accounts of the services given, asked while `active`: once per opening
 * and again when the list of modules changes — the CLIs through
 * `service.status`, the held accounts through the main process.
 */
export function useServiceAccounts(
  serverId: string | null,
  services: readonly Service[],
  active: boolean
): Readonly<Record<string, LoginState>> {
  const answers = useLogins((state) => state.answers);
  const answeredFor = useLogins((state) => state.serverId);
  const readLogins = useLogins((state) => state.read);
  const connections = useConnections((state) => state.state);
  const readConnections = useConnections((state) => state.read);

  const key = services.map((service) => service.id).join(" ");
  const declares = services.some((service) => service.connection);

  useEffect(() => {
    if (!(active && serverId)) {
      return;
    }

    readLogins(serverId, key.length > 0 ? key.split(" ") : []);

    if (declares) {
      readConnections();
    }
  }, [active, serverId, key, declares, readLogins, readConnections]);

  return useMemo(
    () =>
      serviceAccountsOf(services, answers, answeredFor, serverId, connections),
    [services, answers, answeredFor, serverId, connections]
  );
}
