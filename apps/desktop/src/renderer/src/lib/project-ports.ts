import type {
  DetectedRoute,
  RoutePatch,
} from "@pupitre/shared/agent-protocol/projects";
import {
  HOSTNAME_MAX,
  HOSTNAME_PATTERN,
  type Process,
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

export interface PortRow {
  /** Stays stable while the label is being typed. */
  key: string;
  label: string;
  port: number;
  publish: boolean;
  web: string;
  /** On a route the server stored, `web` is its whole hostname rather than a subdomain. */
  whole: boolean;
  /** Set once the reader typed `web`: it stops following the project's name. */
  ownWeb: boolean;
}

export type RowProblem =
  | "label"
  | "labelTaken"
  | "port"
  | "portTaken"
  | "web"
  | "webTaken";

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

export function rowsFromDetection(
  routes: readonly DetectedRoute[],
  publish: boolean
): PortRow[] {
  return routes.map((route) =>
    row({ label: route.label, port: route.port, publish })
  );
}

/** A stored hostname stays whole, so sending it back unchanged keeps it as it is. */
export function rowsFromProcess(process: Process): PortRow[] {
  const rows = process.routes.map((route) =>
    row({
      label: route.label,
      ownWeb: Boolean(route.hostname),
      port: route.port,
      publish: Boolean(route.hostname),
      web: route.hostname ?? "",
      whole: Boolean(route.hostname),
    })
  );

  if (rows.some((current) => current.port === process.port)) {
    return rows;
  }

  return [row({ label: "web", port: process.port, publish: false }), ...rows];
}

/** `main`: the first row belongs to the first process and takes the bare project name. */
export function followName(
  rows: readonly PortRow[],
  name: string,
  exposure: boolean,
  taken: readonly string[],
  main = true
): PortRow[] {
  const claimed = [...taken];

  return rows.map((current, index) => {
    if (current.ownWeb || !exposure) {
      return current.ownWeb ? current : { ...current, web: "" };
    }

    const web = proposedWeb(name, current.label, main && index === 0, claimed);

    claimed.push(web);

    return { ...current, web, whole: false };
  });
}

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

export function hostnamesOf(project: Pick<Project, "processes">): string[] {
  return project.processes.flatMap((process) =>
    process.routes.flatMap((route) => route.hostname ?? [])
  );
}

/** Each `ram_mb` already counts the whole process tree, as the agent summed it. */
export function memoryOf(project: Pick<Project, "processes">): number {
  return project.processes.reduce(
    (total, process) => total + (process.ram_mb ?? 0),
    0
  );
}

export function portsOf(project: Pick<Project, "processes">): number[] {
  return project.processes.flatMap((process) => [
    process.port,
    ...process.routes.map((route) => route.port),
  ]);
}

export function heldBy(projects: readonly Project[], except?: string): Held {
  const others = projects.filter((project) => project.name !== except);

  return {
    hostnames: others.flatMap(hostnamesOf),
    ports: others.flatMap(portsOf),
  };
}
