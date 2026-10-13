---
name: desktop-screens
description: "Add or rework a screen of the Electron app `apps/desktop` — an allowed protocol command in `src/main/agent-bridge.ts` or a dedicated channel in `src/main`, one line in `src/preload/index.ts`, a Zustand store with discriminated states in `src/renderer/src/stores`, a view in `stores/navigation.ts`, texts in `i18n/strings`, `Screen` · `Section` · `Panel` · `Fact` components on the `@pupitre/design` tokens, `usePending` on every gesture, `fix` displayed as is, store tests on `stubPupitre`, main-process tests on the fake agent, a Playwright scenario. Use whenever a screen is touched."
---

# Desktop app screens

The app is a client of the agent: it displays what `pupitred` returns and has no second model. A screen starts with the protocol command it reads, reuses the primitives of `components/ui/`, and ends with its tests. **Read [`apps/desktop/CLAUDE.md`](../../../apps/desktop/CLAUDE.md) first**: this skill says how a screen is built, the guide says what the app never does.

The existing code is the reference: before writing, open the screen closest to what you are asked for (`access/` for a list read from the agent, `services/` for a sheet with a form, `files/` for a view that holds its own height, `onboarding/` for a step of a flow) and copy its shape.

## Where things live

| File | Role |
| --- | --- |
| `packages/shared/src/agent-protocol/` · `docs/contracts/agent-protocol.md` | the commands, their parameters, their results, their events — nothing is redeclared elsewhere |
| `apps/desktop/src/shared/` | what crosses IPC and is not protocol: the `AgentResponse` envelope, the channel errors, the app's own shapes |
| `src/main/agent-client.ts` | a server's SSH client: five channels — control, work, beat, follow, and privileged on demand —, `request(serverId, cmd, params, { onEvent, onSecret })` |
| `src/main/agent-bridge.ts` | `BRIDGE_COMMANDS`, the only commands the renderer can name on `agent:call`; `checkedCall` validates the server, the command and its parameters |
| `src/main/<feature>.ts` | `register<Feature>()`: a feature's `ipcMain.handle`s, registered from `src/main/index.ts` |
| `src/main/<feature>-run.ts` | the pure flow of an operation, testable without Electron, with its dependencies as parameters |
| `src/main/refusal.ts` | `refuseWith(code, "refusal.<feature>.<what>", values)`: a main-process refusal names a dictionary entry, it writes no sentence |
| `src/preload/index.ts` | `window.pupitre`, typed `PupitreApi`; `agentCall`, `agentPoll`, `agentStream` for the protocol, a named method for each dedicated channel |
| `src/renderer/src/lib/agent-call.ts` | `agentCall<T>()` and `agentPoll<T>()`, the call typed by what the screen expects |
| `src/renderer/src/stores/<feature>.ts` | one Zustand store per subject, state as a union discriminated by `status` |
| `src/renderer/src/stores/navigation.ts` | `VIEWS`, `Location`, the app's history |
| `src/renderer/src/i18n/strings/<feature>.ts` | the screen's texts, `en` and `fr`, including the `refusal.<feature>.<what>` refusals and their `.fix` |
| `src/renderer/src/components/<feature>/` | the screen and its sibling files, `{feature}-{context}-{type}.tsx` |
| `src/renderer/src/components/ui/` | Base UI + shadcn on the tokens: `screen`, `section`, `panel`, `fact`, `button`, `icon-button`, `confirm-button`, `dialog`, `menu`, `field`, `error-notice`, `waiting-notice`, `empty-state`, `skeleton`, `status-dot`, `tooltip`… |
| `src/renderer/src/lib/use-pending.ts` | `usePending`: the clicked control waits as long as the gesture's promise runs |
| `src/renderer/src/components/shell/app-sidebar.tsx` · `src/renderer/src/app.tsx` | where a view opens |
| `src/main/__tests__/` · `fixtures/` | main-process tests; `fake-agent.ts` replays `.jsonl` transcripts |
| `src/renderer/src/__tests__/stub-pupitre.ts` · `stores/__tests__/` | `stubPupitre(partial)` replaces `window.pupitre` for a store test |
| `e2e/` · `e2e/harness/` | Playwright for Electron; `launchPupitre()`, `ANSWERS`, `assertAccessible` |

Workspace-specific style: `apps/desktop/biome.jsonc` enforces **semicolons** (the rest of the monorepo omits them). Alias `@renderer` → `src/renderer/src`, `@shared` → `src/shared`. One React component per file outside `components/ui/`, no barrel file.

## The path of a piece of data

```
component ──► store ──► agentCall(serverId, cmd, params) ──► preload ──► agent:call ──► checkedCall ──► agentClient.request ──► pupitred
```

- **The protocol goes through `agent:call`.** A command that the screen reads or triggers is added to `BRIDGE_COMMANDS`; the main process checks that it exists in `COMMANDS`, that its parameters have the shape of the contract, that the server is known, and that the named service is one the agent has just listed. `agentPoll` for what a screen rereads on a timer (`beat` channel), `agentStream` for a long command whose events matter.
- **A dedicated channel only when the main process adds or holds something**: a secret, a token, a local path, an `ssh`, a file. It lives in `src/main/<feature>.ts`, its flow in `<feature>-run.ts` with its dependencies injected, and refuses through `refuseWith`. Never a `child_process` in a handler, never one `ssh` per call.
- **The renderer names, the main process validates.** A server identifier, a project name, a label, an action. No free string from the interface reaches a shell (`docs/security.md`).
- **The result crosses as is.** `{ ok: true, result }` or `{ ok: false, error: { code, message, fix?, phrase? } }`. The store keeps it as is and does not complete it: what the agent did not say, the screen does not show. `ErrorNotice` renders `message` then `fix`; `phrase` is a main-process refusal that the renderer translates.
- **No secret in a store, a log or a command.** A secret leaves through the secret stream (`onSecret`) and is never kept after sending.

## Adding a screen, in order

1. **The protocol type.** The command and its result exist in `docs/contracts/agent-protocol.md` and in `@pupitre/shared/agent-protocol`. Otherwise, stop: the need is flagged to the owner and the contract is amended first.
2. **The bridge.** The command enters `BRIDGE_COMMANDS`; or, if the main process must contribute, a handler in `src/main/<feature>.ts` + a typed line in `src/preload/index.ts` + its entry in `QUIET` of `stub-pupitre.ts` if a step triggers it on its own. `ipc-surface.test.ts` refuses a channel that one side calls and the other does not listen to, and a channel the Playwright harness does not answer.
3. **The store**, `stores/<feature>.ts`: `state` as a union discriminated by `status` — `idle` · `loading` · `read` · `failed` — never `loading` and `error` side by side; one field per gesture in progress (`removing: string | null`) so that only the clicked button waits; `forget()` for the test and for the server change.
4. **The texts**, `i18n/strings/<feature>.ts`, `en` then `fr`, imported in `i18n/en.ts` and `i18n/fr.ts`. Plurals as `.one` / `.other`, refusals as `refusal.<feature>.<what>` and `refusal.<feature>.<what>.fix`. No sentence in a component.
5. **The view**, if the screen is a page: `VIEWS` in `stores/navigation.ts`, its entry in `app-sidebar.tsx`, its rendering in `app.tsx`, its command in the palette if it is expected there.
6. **The components**, `components/<feature>/`: `<feature>-screen.tsx` composes the primitives; sub-components are sibling files.
7. **The tests**: the store on `stubPupitre`, the main-process flow on its dependencies or on a fake-agent transcript, the screen through Playwright with `assertAccessible`.

## Components

- **Look for the primitive before writing**: button, status dot, label, waiting notice, error notice, field, list, menu, tooltip. If it is missing, it is born in `components/ui/` with a `variant`, never in the feature's folder.
- **Every control is a primitive on Base UI**: `Select` (groups through `groups`), `NumberField`, `CheckBox` / `CheckLine`, `Switch` / `SwitchLine` for a preference, `RadioGroup` + `Radio` / `RadioLine`, `ModeCards` + `ModeCard` for a choice in cards, `Segmented`, `TabBar` + `Tab` (`orientation="vertical"` for a column of panes), `Details` (folded, `open` + `onOpenChange` when a refusal must open it), `FoldingSection` (a `Section` that folds under its title, `open` for the one that starts open — a page read in pieces, like the help), `Dialog`, `ConfirmButton` (an `alertdialog`), `Menu`, `Tooltip`, `Hint`. Never a hand-written `<select>`, `<details>`, native checkbox or `role="dialog"`. A form is a series of `Section`s on `Panel inset="lg"`s, its fields at `gap-6`, its gesture in the `ActionBar` at the foot of the page.
- **A shell page starts with `Screen`**: `eyebrow` is the context (the server's name on its pages, "Project" or "Service" on a sheet, "Application" in the settings), `title` is the thing or the page, `actions` carries the gestures on the whole thing, `tabs` a `TabBar`, `fill` when the body holds its own height. A step of a flow is a `Screen` in `column` with `step` and `footer`; in the onboarding it adds `plain`. No page sets its own `max-w-*`, its `h1` or its banner.
- **Every section is `Section`**: `title`, `aside` for what qualifies it, `actions` for its gestures on the same line. **Every frame is `Panel`**: `list` for rows, `inset` for air, `panelClass()` on a `form`. **Every fact is `Fact`** in a `FactList`: label, value in `font-data`, `detail` underneath. A page does not write the same piece of data twice.
- **Every gesture answers where it was made.** `Button`, `IconButton` and `ConfirmButton` switch to `loading` on their own as soon as the handler returns a promise (`usePending`): an async handler always returns its promise. A form ends on its button at the foot, active when something has changed; a refusal is read under the field, with `aria-invalid` and `aria-describedby`.
- **A confirmation is `ConfirmButton`** when it fits on the gesture's line, `ConfirmDialog` — the same question, without the button — when something other than that button opens it (a shortcut, closing a tab), `Dialog` when it carries a consequence to read or several outcomes. Never a red block drawn in the card.
- **A button that has only an icon carries a tooltip** (`IconButton` sets it, on `ui/tooltip.tsx`); an icon + label button carries none. The native `title` is not displayed in Electron on macOS.
- **Tokens only**: `bg-base`, `bg-surface`, `bg-sunken`, `bg-raised`, `text-ink` to `text-ink-4`, `border-line`, `border-line-strong`, `bg-inverse text-inverse-ink` for the primary button, `text-ok`, `text-warn`, `text-danger` for state only, `font-data` for any data, `rounded-sm` for controls, `rounded-md` for panels. `grep -rE "#[0-9a-f]{6}|hsl\(|rgb\(" src/renderer --include=*.tsx` stays empty.
- **State is read by shape first**: filled dot for online, empty circle for stopped, struck dot for failed, breathing dot for in progress. Colour confirms.
- **Every wait says what is happening** (`WaitingNotice`, `SkeletonRows`): the module, the step, the duration. Never a spinner alone. **Every error says the remedy** (`ErrorNotice` with `onRetry`).
- **Base UI + shadcn, `render` prop**, never `asChild`, never Radix. Lucide only, 1.5 px stroke, never coloured. An action button carries its icon before its label.
- No shadow, no gradient, no illustration, no description that narrates the screen.

## Example: the Access page, as it is written

A server's access keys: the list comes from the agent (`access.list` on `agent:call`), what touches this computer — drawing a key, keeping it sealed, revoking it — goes through dedicated channels. Excerpts from `stores/access.ts`, `components/access/` and their tests — open the files for the rest.

### The store — `src/renderer/src/stores/access.ts`

```ts
export type AccessState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; keys: AccessKey[]; held: AccessHeld }
  | { status: "failed"; serverId: string; error: AgentError };

/** The last gesture's outcome, shown where it was made. */
export type AccessGesture =
  | { status: "idle" }
  | { status: "copied"; id: string; form: AccessCopyForm }
  | { status: "failed"; id: string | null; error: AgentError };

interface AccessStore {
  state: AccessState;
  gesture: AccessGesture;
  revoking: string | null;
  read: (serverId: string) => Promise<void>;
  revoke: (serverId: string, id: string) => Promise<void>;
  …
  forget: () => void;
}

export const useAccess = create<AccessStore>((set, get) => {
  …
  return {
    async read(serverId) {
      const current = get().state;

      if (!("serverId" in current && current.serverId === serverId)) {
        set({ state: { serverId, status: "loading" } });
      }

      const answer = await call<AccessListResult>(serverId, "access.list");

      if (!answer.ok) {
        set({ state: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      const held = await window.pupitre.heldAccessKeys(
        serverId,
        answer.result.keys.map((key) => key.id)
      );

      set({
        state: {
          held: held.ok ? held.result : NOTHING_HELD,
          keys: answer.result.keys,
          serverId,
          status: "read",
        },
      });
    },

    async revoke(serverId, id) {
      set({ gesture: { status: "idle" }, revoking: id });

      const answer = await window.pupitre.revokeAccessKey(serverId, id);

      set({ revoking: null });

      if (!answer.ok) {
        failed(id, answer.error);

        return;
      }

      await get().read(serverId);
    },
    …
  };
});
```

A reread keeps the list on screen (`loading` only when the server changes); the refusal of a gesture lands in `gesture`, beside the row that made it, not in `state`.

### The screen — `src/renderer/src/components/access/access-screen.tsx` · `access-keys.tsx`

```tsx
export function AccessScreen({ serverId, serverName, projects }: { … }) {
  const t = useTranslations();

  const read = useAccess((s) => s.read);

  useEffect(() => {
    read(serverId);
  }, [serverId, read]);

  return (
    <Screen eyebrow={serverName} title={t("access.title")}>
      <AccessKeys project={null} projects={projects} serverId={serverId} title={t("access.keys.title")} />
      <AccessUsage />
    </Screen>
  );
}
```

`AccessKeys` is a `Section` — its count in `aside`, "Nouvelle clé" in `actions` — that draws each state of the store: `SkeletonRows` while loading, `ErrorNotice` with `onRetry` on a failure, `EmptyState` in a `Panel inset="lg"` when there is no key, otherwise a `Panel as="ul" list` of `AccessKeyRow`s. A row revokes through a `ConfirmButton` whose `onConfirm` returns the store's promise, so the button waits on its own; creating a key opens a `Dialog` (`AccessKeyCreateDialog`). The same section is reused on a project's configuration, narrowed by `project`.

A page reads on `useEffect` on arrival. An **onboarding step** does not: it is `stores/onboarding-machine.ts` that says what entering a step triggers, and the store runs the effect.

### The store test — `stores/__tests__/access.test.ts`

```ts
function agent(keys: AccessKey[], listed: string[][] = []): void {
  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName) =>
      Promise.resolve(
        cmd === "access.list"
          ? { ok: true, result: { keys } }
          : { error: { code: "internal", message: "rien" }, ok: false }
      ),
    heldAccessKeys: (_serverId, ids) => {
      listed.push(ids);

      return Promise.resolve({ ok: true, result: { device: "device000001", held: ["device000001"] } });
    },
    …
  });
}

it("reads the keys, then what this computer holds of them", async () => {
  const listed: string[][] = [];
  agent(KEYS, listed);

  await useAccess.getState().read(SERVER);

  expect(useAccess.getState().state).toMatchObject({ keys: KEYS, status: "read" });
  expect(listed).toEqual([["device000001", "review000001"]]);
});
```

### Dedicated channels and their flow — `src/main/access.ts` · `access-run.ts`

```ts
export function registerAccess(): void {
  handle("access:revoke", shape(anything, anything), (_event, serverId, id) =>
    revokeKey(serverId, id, deps)
  );
  …
}

export async function revokeKey(serverId: unknown, id: unknown, deps: AccessDeps): Promise<AgentResponse<{ id: string }>> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuseWith("bad_request", "refusal.server.unknown");
  }

  if (typeof id !== "string") {
    return refuseWith("bad_request", "refusal.access.invalid");
  }

  const answer = await deps.request(serverId, "access.revoke", { id });

  if (!answer.ok) {
    return answer;
  }

  deps.vault.forget(serverId, id);

  return { ok: true, result: { id } };
}
```

The flow receives its dependencies — `request`, the sealed `vault`, `copy`, `open` — and is tested without Electron in `__tests__/access-run.test.ts`, on a vault in a temporary folder and a `request` that records what was sent. A flow whose interest is the conversation with the agent is tested on transcripts instead: `__tests__/agent-update.test.ts` hands `fakeAgent` the `.jsonl` files of `fixtures/` (`agent-upgrade-ok.jsonl`, `agent-migrate-ok.jsonl`…) as the spawned `pupitred serve`.

### The Playwright scenario — `e2e/access.spec.ts`

The harness launches the app (`launchPupitre()`) and answers the dedicated channels itself (`answer("access:held", …)`, `answer("access:create", …)` in `e2e/harness/launch.ts`), so no key is drawn and no agent is reached. The test reads the screen like a reader — `getByRole("button", { name: "Nouvelle clé" })`, `getByRole("heading", { name: "Accès" })` — then `assertAccessible(page, "access")`.

## Before handing back

1. The command and the type come from `@pupitre/shared/agent-protocol`; nothing is redeclared in `src/shared/`.
2. The renderer only sends identifiers; `BRIDGE_COMMANDS` or the dedicated handler validates them.
3. The store keeps the envelope; `fix` reaches the screen as is; no sentence outside `i18n/strings`.
4. `Screen` · `Section` · `Panel` · `Fact`; no hard-coded colour; no primitive reinvented outside `components/ui/`; one component per file; semicolons.
5. Every async gesture returns its promise; every wait says what is happening; every error says the remedy; every button without a label has its tooltip.
6. Tests: store on `stubPupitre`, main process on its dependencies or a transcript, screen through Playwright with `assertAccessible(page, "<screen>")`. What floats (dialog, a `Select`'s list) is read through `mount` and `optionsOf` of `__tests__/dom.tsx`, never through `renderToStaticMarkup`. Assertions in `it()`, no `.only`.
7. `bun --cwd=apps/desktop run lint`, `check:types`, `test` green; `test:e2e` green. Then the real app: `bun run dev:desktop` and the screen opened, not only the tests.
