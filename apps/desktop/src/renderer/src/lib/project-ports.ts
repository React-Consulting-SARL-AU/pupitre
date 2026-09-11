import type {
  DetectedRoute,
  RoutePatch,
} from "@pupitre/shared/agent-protocol/projects";
import {
  HOSTNAME_MAX,
  HOSTNAME_PATTERN,
  type Project,
  ROUTE_LABEL_MAX,
  type RouteRequest,
} from "@pupitre/shared/agent-protocol/state";
import {
  freePort,
  freeSubdomain,
  subdomainFromName,
  validSubdomain,
} from "./project-draft";

/**
 * The ports of a project, one row each, as the form shows them.
 *
 * The first row is the main port — the one that decides the state and the
 * local address. Every row carries a short label and, when the reader chooses
 * to publish it, the name it answers to on the web: a subdomain the agent
 * completes with the server's domain, or, on a route the server already
 * holds, the whole hostname it stored. Nothing here decides anything the agent
 * has not said: what is proposed is free as far as the app knows, and the
 * registry is the one that refuses.
 */

export interface PortRow {
  /** What tells one row from another on screen while their labels are typed. */
  key: string;
  label: string;
  port: number;
  publish: boolean;
  /** The name on the web: a subdomain, or a whole hostname when `whole` is set. */
  web: string;
  /** True on a route the server stored: `web` is the hostname as it stands. */
  whole: boolean;
  /** True once the reader typed the name themselves: it stops following the project's name. */
  ownWeb: boolean;
}

export type RowProblem =
  | "label"
  | "labelTaken"
  | "port"
  | "portTaken"
  | "web"
  | "webTaken";

/** What the rows are weighed against: what the other projects of the server hold. */
export interface Held {
  ports: readonly number[];
  hostnames: readonly string[];
}

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const NOT_LABEL = /[^a-z0-9-]+/g;

const DOUBLE_DASH = /-{2,}/g;

const EDGE_DASHES = /^-+|-+$/g;

const LOWEST_PORT = 1024;

const HIGHEST_PORT = 65_535;

/** The labels proposed to a row added by hand, in the order projects usually grow. */
const USUAL_LABELS = ["web", "api", "docs", "admin", "worker"];

export function validLabel(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= ROUTE_LABEL_MAX &&
    LABEL_PATTERN.test(value)
  );
}

export function labelFrom(value: string): string {
  return value
    .toLowerCase()
    .replace(NOT_LABEL, "-")
    .replace(DOUBLE_DASH, "-")
    .replace(EDGE_DASHES, "");
}

export function validHostname(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= HOSTNAME_MAX &&
    HOSTNAME_PATTERN.test(value)
  );
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= LOWEST_PORT && port <= HIGHEST_PORT;
}

/**
 * The subdomain proposed for a row: the project's own name on the first row,
 * `<label>-<name>` on the others, each one no declared project holds.
 */
export function proposedWeb(
  name: string,
  label: string,
  first: boolean,
  taken: readonly string[]
): string {
  const base = subdomainFromName(name);

  if (base.length === 0) {
    return "";
  }

  const folded = labelFrom(label);
  const stem = first || folded.length === 0 ? base : `${folded}-${base}`;

  return freeSubdomain(stem, taken);
}

/** The subdomains the held hostnames start with: what a proposal must not repeat. */
export function heldSubdomains(hostnames: readonly string[]): string[] {
  return hostnames.map((hostname) => hostname.split(".")[0] ?? "");
}

let keys = 0;

function row(partial: Partial<PortRow> & { port: number }): PortRow {
  keys += 1;

  return {
    key: `row-${keys}`,
    label: "",
    ownWeb: false,
    publish: true,
    web: "",
    whole: false,
    ...partial,
  };
}

/** One row on a free port, with the first usual label no row carries yet. */
export function firstRow(port: number, publish: boolean): PortRow {
  return row({ label: USUAL_LABELS[0] ?? "web", port, publish });
}

export function addedRow(
  rows: readonly PortRow[],
  held: Held,
  publish: boolean
): PortRow {
  const labels = new Set(rows.map((current) => current.label));
  const label =
    USUAL_LABELS.find((usual) => !labels.has(usual)) ??
    `port-${rows.length + 1}`;
  const from = Math.max(...rows.map((current) => current.port), 0) + 1;

  return row({
    label,
    port: freePort(
      [...held.ports, ...rows.map((current) => current.port)],
      from
    ),
    publish,
  });
}

/** The rows the agent read off a monorepo, in its order, all published when the server can. */
export function rowsFromDetection(
  routes: readonly DetectedRoute[],
  publish: boolean
): PortRow[] {
  return routes.map((route) =>
    row({ label: route.label, port: route.port, publish })
  );
}

/**
 * The rows of a declared project, as the configuration screen opens them.
 *
 * A route the server stored a name for keeps that name whole: what the reader
 * sees is what answers, and what they send back, unchanged, is what stays.
 */
export function rowsFromProject(project: Project): PortRow[] {
  const rows = project.routes.map((route) =>
    row({
      label: route.label,
      ownWeb: Boolean(route.hostname),
      port: route.port,
      publish: Boolean(route.hostname),
      web: route.hostname ?? "",
      whole: Boolean(route.hostname),
    })
  );

  if (rows.some((current) => current.port === project.port)) {
    return rows;
  }

  return [row({ label: "web", port: project.port, publish: false }), ...rows];
}

/**
 * Every row's name on the web refreshed from the project's name, except those
 * the reader took over.
 */
export function followName(
  rows: readonly PortRow[],
  name: string,
  exposure: boolean,
  taken: readonly string[]
): PortRow[] {
  const claimed = [...taken];

  return rows.map((current, index) => {
    if (current.ownWeb || !exposure) {
      return current.ownWeb ? current : { ...current, web: "" };
    }

    const web = proposedWeb(name, current.label, index === 0, claimed);
    claimed.push(web);

    return { ...current, web, whole: false };
  });
}

/**
 * Why the agent would refuse a row, weighed before it is asked.
 *
 * A port another project holds, a label another row of this project carries,
 * a name on the web that DNS would not take or that a project already answers
 * to: catching them here keeps the button from sending a form that comes back
 * with a phase in failure.
 */
export function rowProblem(
  rows: readonly PortRow[],
  index: number,
  held: Held,
  exposure: boolean
): RowProblem | null {
  const current = rows[index];

  if (!current) {
    return null;
  }

  if (!validLabel(current.label)) {
    return "label";
  }

  if (rows.some((other, at) => at !== index && other.label === current.label)) {
    return "labelTaken";
  }

  if (!validPort(current.port)) {
    return "port";
  }

  if (
    held.ports.includes(current.port) ||
    rows.some((other, at) => at < index && other.port === current.port)
  ) {
    return "portTaken";
  }

  if (!(exposure && current.publish)) {
    return null;
  }

  const web = current.web.trim();

  if (current.whole ? !validHostname(web) : !validSubdomain(web)) {
    return "web";
  }

  const taken = current.whole
    ? held.hostnames.includes(web)
    : held.hostnames.some((hostname) => hostname.startsWith(`${web}.`));

  if (taken) {
    return "webTaken";
  }

  return rows.some(
    (other, at) =>
      at !== index && other.publish && other.web.trim() === web && web !== ""
  )
    ? "webTaken"
    : null;
}

export function rowsReady(
  rows: readonly PortRow[],
  held: Held,
  exposure: boolean
): boolean {
  return (
    rows.length > 0 &&
    rows.every(
      (_row, index) => rowProblem(rows, index, held, exposure) === null
    )
  );
}

/** The routes `project.add` takes: a subdomain for what is published, nothing for the rest. */
export function routeRequests(
  rows: readonly PortRow[],
  exposure: boolean
): RouteRequest[] {
  return rows.map((current) => {
    const web = current.web.trim();
    const published = exposure && current.publish && web.length > 0;

    return {
      label: current.label,
      port: current.port,
      ...(published ? { subdomain: web } : {}),
    };
  });
}

/** The routes `project.update` takes: a stored name travels whole, a new one as a subdomain. */
export function routePatches(
  rows: readonly PortRow[],
  exposure: boolean
): RoutePatch[] {
  return rows.map((current) => {
    const web = current.web.trim();
    const published = exposure && current.publish && web.length > 0;

    if (!published) {
      return { label: current.label, port: current.port };
    }

    return {
      label: current.label,
      port: current.port,
      ...(current.whole ? { hostname: web } : { subdomain: web }),
    };
  });
}

/** The names on the web a project's routes hold: what a rewrite may take away. */
export function hostnamesOf(project: Pick<Project, "routes">): string[] {
  return project.routes.flatMap((route) => route.hostname ?? []);
}

/** What the other projects of a server hold, read off the list the agent gave. */
export function heldBy(projects: readonly Project[], except?: string): Held {
  const others = projects.filter((project) => project.name !== except);

  return {
    hostnames: others.flatMap(hostnamesOf),
    ports: others.flatMap((project) => [
      project.port,
      ...project.routes.map((route) => route.port),
    ]),
  };
}
