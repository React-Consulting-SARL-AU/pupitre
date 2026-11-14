import type { ModuleConfig } from "@pupitre/shared/agent-protocol/install";
import type {
  ProcessPatch,
  ProjectAddParams,
  ProjectPatch,
  RoutePatch,
} from "@pupitre/shared/agent-protocol/projects";
import type {
  Process,
  Project,
  ProjectRuntimes,
  Route,
} from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import type { DialogKey } from "./dialogs";

export type Say = (key: DialogKey, values?: Record<string, string>) => string;

/** A line under a heading is drawn indented. */
export interface ChangeLine {
  text: string;
  under?: boolean;
}

const NO_SPAN = 1;

function line(text: string, under = false): ChangeLine {
  return under ? { text, under } : { text };
}

function changed(
  say: Say,
  field: DialogKey,
  from: string | undefined,
  to: string | undefined,
  empty: DialogKey = "mcpNone"
): string {
  const none = say(empty);

  return say("mcpChanged", {
    field: say(field),
    from: from || none,
    to: to || none,
  });
}

function runtimesText(runtimes: ProjectRuntimes | undefined): string {
  return Object.entries(runtimes ?? {})
    .map(([tool, version]) => `${tool} ${version}`)
    .sort()
    .join(", ");
}

function patchRouteName(route: RoutePatch): string | undefined {
  return route.hostname ?? route.subdomain;
}

function routeShown(say: Say, route: RoutePatch | Route): string {
  return (
    route.hostname ??
    ("subdomain" in route ? route.subdomain : undefined) ??
    say("mcpLocalRoute", { label: route.label })
  );
}

function sameAddress(held: Route, wanted: RoutePatch): boolean {
  const name = patchRouteName(wanted);

  if (!(name && held.hostname)) {
    return !(name || held.hostname);
  }

  return (
    held.hostname === name ||
    (wanted.subdomain !== undefined &&
      held.hostname.startsWith(`${wanted.subdomain}.`))
  );
}

function routeLines(
  say: Say,
  held: readonly Route[],
  wanted: readonly RoutePatch[]
): ChangeLine[] {
  const lines: ChangeLine[] = [];

  for (const route of wanted) {
    const was = held.find((one) => one.label === route.label);

    if (was && sameAddress(was, route)) {
      if (was.port !== route.port) {
        lines.push(
          line(
            say("mcpRouteMoved", {
              from: String(was.port),
              name: routeShown(say, route),
              to: String(route.port),
            }),
            true
          )
        );
      }

      continue;
    }

    if (was) {
      lines.push(
        line(say("mcpRouteRemoved", { name: routeShown(say, was) }), true)
      );
    }

    lines.push(
      line(
        say("mcpRouteAdded", {
          name: routeShown(say, route),
          port: String(route.port),
        }),
        true
      )
    );
  }

  for (const route of held) {
    if (!wanted.some((one) => one.label === route.label)) {
      lines.push(
        line(say("mcpRouteRemoved", { name: routeShown(say, route) }), true)
      );
    }
  }

  return lines;
}

function processFieldLines(
  say: Say,
  held: Process,
  wanted: ProcessPatch
): ChangeLine[] {
  const fields: [DialogKey, string | undefined, string | undefined][] = [
    ["mcpFieldCommand", held.cmd, wanted.cmd],
    ["mcpFieldInstall", held.install, wanted.install],
    ["mcpFieldPort", String(held.port), String(wanted.port)],
    [
      "mcpFieldSpan",
      String(held.port_span ?? NO_SPAN),
      String(wanted.port_span ?? NO_SPAN),
    ],
    ["mcpFieldHost", held.host, wanted.host],
    ["mcpFieldDir", held.dir, wanted.dir],
    ["mcpFieldPkgmgr", held.pkgmgr, wanted.pkgmgr],
  ];
  const lines = fields
    .filter(([, from, to]) => (from || "") !== (to || ""))
    .map(([field, from, to]) =>
      line(
        changed(
          say,
          field,
          from,
          to,
          field === "mcpFieldInstall" ? "mcpInstallDefault" : "mcpNone"
        ),
        true
      )
    );

  if (held.protected !== wanted.protected && wanted.protected !== undefined) {
    lines.push(line(say(wanted.protected ? "mcpProtect" : "mcpOpen"), true));
  }

  if (held.cmd !== wanted.cmd) {
    lines.push(line(say("mcpRestarts"), true));
  }

  return lines;
}

function processLines(
  say: Say,
  held: readonly Process[],
  wanted: readonly ProcessPatch[]
): ChangeLine[] {
  const lines: ChangeLine[] = [];

  for (const process of wanted) {
    const was = held.find((one) => one.id === process.id);

    if (!was) {
      lines.push(line(newProcess(say, process)));
      lines.push(...routeLines(say, [], process.routes));
      continue;
    }

    const under = [
      ...processFieldLines(say, was, process),
      ...routeLines(say, was.routes, process.routes),
    ];

    if (under.length > 0) {
      lines.push(line(say("mcpProcess", { id: process.id })), ...under);
    }
  }

  for (const process of held) {
    if (!wanted.some((one) => one.id === process.id)) {
      lines.push(line(say("mcpProcessRemoved", { id: process.id })));
    }
  }

  return lines;
}

function newProcess(
  say: Say,
  process: Pick<ProcessPatch, "id" | "cmd" | "port">
): string {
  return say("mcpProcessAdded", {
    cmd: process.cmd,
    id: process.id,
    port: String(process.port),
  });
}

/** Only what differs from the project as the agent last read it; without it, the patch as sent. */
export function updateLines(
  say: Say,
  held: Project | null,
  patch: ProjectPatch
): ChangeLine[] {
  const lines: ChangeLine[] = [];

  if (patch.branch !== undefined && patch.branch !== held?.branch) {
    lines.push(
      line(changed(say, "mcpFieldBranch", held?.branch, patch.branch))
    );
  }

  if (patch.boot !== undefined && patch.boot !== held?.boot) {
    lines.push(line(say(patch.boot ? "mcpBootOn" : "mcpBootOff")));
  }

  if (patch.protected !== undefined && patch.protected !== held?.protected) {
    lines.push(line(say(patch.protected ? "mcpProtect" : "mcpOpen")));
  }

  if (patch.runtimes !== undefined) {
    const from = runtimesText(held?.runtimes);
    const to = runtimesText(patch.runtimes);

    if (from !== to) {
      lines.push(line(changed(say, "mcpFieldRuntimes", from, to)));
    }
  }

  if (patch.processes) {
    lines.push(...processLines(say, held?.processes ?? [], patch.processes));
  }

  return lines.length > 0 ? lines : [line(say("mcpNoChange"))];
}

export function addLines(say: Say, project: ProjectAddParams): ChangeLine[] {
  const source = project.repo
    ? say("mcpSet", {
        field: say("mcpFieldRepo"),
        value: project.branch
          ? `${project.repo} (${project.branch})`
          : project.repo,
      })
    : say("mcpSet", { field: say("mcpFieldDir"), value: project.dir });
  const lines = [line(source)];

  for (const process of project.processes) {
    lines.push(line(newProcess(say, process)));
    lines.push(
      ...process.routes.map((route) =>
        line(
          say("mcpRouteAdded", {
            name: routeShown(say, route),
            port: String(route.port),
          }),
          true
        )
      )
    );
  }

  if (project.boot) {
    lines.push(line(say("mcpBootOn")));
  }

  if (!project.protected) {
    lines.push(line(say("mcpOpen")));
  }

  return lines;
}

export function removeLines(say: Say, held: Project | null): ChangeLine[] {
  const lines = [line(say("mcpRemoveStops"))];

  if (held) {
    lines.push(line(say("mcpRemoveKeeps", { dir: held.path })));
  }

  return lines;
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The catalogue's names and labels, when it answered; the ids the model sent otherwise. */
export function moduleLines(
  say: Say,
  modules: readonly string[],
  config: ModuleConfig,
  manifests: readonly Manifest[]
): ChangeLine[] {
  return modules.flatMap((id) => {
    const manifest = manifests.find((one) => one.id === id);
    const fields = Object.entries(config[id] ?? {}).map(([key, value]) => {
      const label =
        manifest?.fields.find((field) => field.key === key)?.label ?? key;

      return line(
        say("mcpSet", { field: label, value: valueText(value) }),
        true
      );
    });

    return [line(manifest ? `${manifest.name} (${id})` : id), ...fields];
  });
}

export function moduleSubject(
  modules: readonly string[],
  manifests: readonly Manifest[]
): string {
  return modules
    .map((id) => manifests.find((one) => one.id === id)?.name ?? id)
    .join(", ");
}

export function detailText(
  lines: readonly ChangeLine[],
  footer: string
): string {
  const body = lines
    .map((one) => (one.under ? `    ${one.text}` : `•  ${one.text}`))
    .join("\n");

  return `${body}\n\n${footer}`;
}
