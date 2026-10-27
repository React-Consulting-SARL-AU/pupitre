# 0020 — A process reserves a span of ports

Date: 2026-10-27 · Status: accepted

**The problem.** The registry knows one port per process, plus the ports of its routes. A repository like React-Box starts one command that listens on 3000 — a gateway — and on 3001 to 3006 behind it, ports nobody declared. Another project then registers 3001, and the agent believes it runs: its port answers, `external` when it is stopped, `online` when its window is open on a dev server that fell back on another port. Since 2.2.0 the agent attributes each listening port to the project window it descends from (`ss -ltnpH` + the `ps` tree): a port another project's window holds no longer reads as this process's, `project.up` refuses with the holder and a free port, and `project.add` / `project.update` warn. That only shows the collision; nothing would stop it at declaration time, because the backend ports are declared nowhere.

**The decision.** A process reserves a contiguous **span** of ports that starts at its `port`: `port` stays the main port, the one the tunnel and the state probe target; the following `port_span - 1` ports are its own to hand out. Pupitre never listens on them and never publishes them unless a route names one; it only keeps them away from every other process, and tells the process where they are. A count from `port` rather than two bounds: a main port outside its own range cannot be written.

## The contract

**Registry** (`/etc/pupitre/projects.local.json`). Each process gains `port_span`, an integer from 1 to `PORT_SPAN_MAX = 100` (`packages/shared`, exported to the agent as `ProjectRules.port_span_max`). Registry migration no. 10, `processes-port-span`, writes `port_span: 1` on every process that has none.

**Validation** (`project.add`, `project.update`):

- `port + port_span - 1 ≤ 65535`.
- Two processes' spans never overlap, across all projects.
- A route's port is either inside its own process's span — publishing a backend — or outside every span.
- A collision answers `bad_request` with the existing `port_taken` remedy; `port_free` is the first port **where the whole span fits**, free of every span and of every port listening right now. No new remedy field.
- What the machine holds at that moment (a port of the span listening under another project's window) stays a warning: the owner may be declaring the project the port belongs to.

**Protocol.** `project.add` and `project.update` accept `port_span?` on a process; the app omits it at 1, its default, so an app of this generation still speaks to every agent of it ([closed parameters](../contracts/agent-protocol.md)). An agent that knows the field announces `port_span` in `hello.capabilities[]`, served beside `project.add`; the app only shows the field to such an agent. `Project.processes[]` returns `port_span` and `held_by?`: the `<project>/<process>` window of **another** project that holds this process's main port right now, absent otherwise. Both are result fields, open, ignored by older apps. `PROTOCOL_VERSION` does not move.

**Environment** (names are added, none renamed — [the variables](../contracts/agent-protocol.md)). Every process receives them, span of 1 included, so that a script never branches:

| Variable | Value | Level |
|---|---|---|
| `PUPITRE_PORT_LAST` | `port + port_span - 1` | process |
| `PUPITRE_PORT_RANGE` | `<port>-<last>`, e.g. `3000-3009` | process |
| `PUPITRE_PROCESS_<ID>_PORT_RANGE` | the same for each process of the project | project |

`PUPITRE_PORT` stays the first port. React-Box reads `PUPITRE_PORT_RANGE` when it creates its gateway and its backends, instead of freezing 3001–3006.

**Detection.** `project.detect` proposes nothing about spans for now: every detected process starts at 1, and the owner widens it on screen. Proposing a span that covers a turbo monorepo's routes is left for later.

**The apps.** The Electron app only; the Rust app ([0019](./0019-desktop-in-rust-gpui.md)) takes it up when it ports the project screens. The process form gains a "Ports réservés" `NumberField` under the command, default 1, with the resulting range read out in its help ("3000 – 3009"), refused when out of bounds or overlapping another process. A process the agent says is `held_by` another project's window says so on its row. Nothing the app keeps on the laptop changes shape, so no app migration.

**AI agents.** `project_list` of the MCP server returns `port_span` and `held_by`; the `project-env` and `server-dev` skills say that a repository spreading over several ports declares a span and reads `PUPITRE_PORT_RANGE`.
