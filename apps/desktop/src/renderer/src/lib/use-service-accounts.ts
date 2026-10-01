import type { LoginState, Service } from "@pupitre/shared/agent-protocol/state";
import type { ConnectionsState } from "@shared/connections";
import { useEffect, useMemo } from "react";
import { useConnections } from "../stores/connections";
import { type LoginAnswer, useLogins } from "../stores/logins";
import { snapshotOf, useSnapshot } from "../stores/snapshot";
import { accountStateOf } from "./account-state";

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

/** A restricted agent refuses `service.status`, so its CLIs are not asked; the shell's notice says why. */
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
  const restricted = useSnapshot(
    (state) => snapshotOf(state.state, serverId)?.license === "restricted"
  );

  const key = services.map((service) => service.id).join(" ");
  const declares = services.some((service) => service.connection);

  useEffect(() => {
    if (!(active && serverId) || restricted) {
      return;
    }

    readLogins(serverId, key.length > 0 ? key.split(" ") : []);

    if (declares) {
      readConnections();
    }
  }, [
    active,
    serverId,
    restricted,
    key,
    declares,
    readLogins,
    readConnections,
  ]);

  return useMemo(
    () =>
      serviceAccountsOf(services, answers, answeredFor, serverId, connections),
    [services, answers, answeredFor, serverId, connections]
  );
}
