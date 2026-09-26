---
name: project-env
description: The PUPITRE_* environment variables every project on this server receives — its port, host, local and public addresses, its routes, its sibling processes' addresses, the server's domain. Use it before writing a port, a host, a URL or a domain into code, a script or a config file, when wiring a client to its API, or when a variable seems missing or stale.
---

# project-env

Every port, address and domain a project needs is already in its environment.
Read it from there; never hardcode it. When the owner moves the domain or
publishes a route from the app, the variables follow and the code does not
change.

## Where they come from

- **A process** started with `dev up`, `dev restart` or at boot receives all of
  them at start. A running process keeps what it received: after a change, run
  `dev restart <project> [process]`. The app marks a process whose variables
  changed since it started.
- **A terminal** receives them for the folder it stands in, refreshed at every
  prompt: inside a process's folder, that process's; at a project's root without
  a process there, the project's; elsewhere, the machine's.
- **An agent** opened from the app on a project receives the project's.

`env | grep ^PUPITRE_` shows what the current shell has.

## The variables

Everywhere:

    PUPITRE=1                      this shell or process runs on a Pupitre server
    PUPITRE_PROJECTS_DIR           the projects root, /home/dev/projects
    PUPITRE_DOMAIN                 the server's published domain; absent without one

In a project:

    PUPITRE_PROJECT                the project's name
    PUPITRE_PROJECT_DIR            its absolute folder
    PUPITRE_PROJECT_URL            its address: the first published process's, else the first's local one
    PUPITRE_PROCESS_<ID>_PORT      each process's main port
    PUPITRE_PROCESS_<ID>_URL       each process's address, public when published

In a process:

    PUPITRE_PROCESS                the process's id
    PUPITRE_PROCESS_DIR            its absolute folder
    PUPITRE_HOST, PUPITRE_PORT     where the server must listen
    PUPITRE_URL                    its address: public when published, local otherwise
    PUPITRE_LOCAL_URL              http://<host>:<port>
    PUPITRE_PUBLIC_URL             https://<hostname>; absent when not published
    PUPITRE_ROUTE_<LABEL>_PORT     each route's port
    PUPITRE_ROUTE_<LABEL>_URL      each route's address, public when it carries a name

`<ID>` and `<LABEL>` are upper-cased, a dash becoming an underscore: process
`api-v2` gives `PUPITRE_PROCESS_API_V2_URL`.

## Using them

- Bind the dev server to them rather than to literals:
  `vite --host $PUPITRE_HOST --port $PUPITRE_PORT`, `next dev -p $PUPITRE_PORT`,
  `server.port=${PUPITRE_PORT}` in a Spring configuration.
- Point a client at its API through its sibling: `PUPITRE_PROCESS_API_URL`
  locally or behind a proxy.
- `PORT` and `HOST` are never set: the repository's `.env.local` keeps
  authority over them. Map explicitly when a tool only reads `PORT`:
  `PORT=$PUPITRE_PORT bun run start`.
- Vite exposes only `VITE_*` to browser code. Pass a value through
  `define` or `envPrefix` in `vite.config`, or `VITE_API_URL=$PUPITRE_PROCESS_API_URL`
  in the start command; never copy the value itself into the code.
- No secret travels here: secrets stay in `.env.local`.
- A value that must hold outside this server gets a fallback:
  `process.env.PUPITRE_PUBLIC_URL ?? "http://localhost:3000"`.
