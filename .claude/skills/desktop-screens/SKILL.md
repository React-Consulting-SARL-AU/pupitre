---
name: desktop-screens
description: "Add or rework a screen of the Electron app `apps/desktop` — an allowed protocol command in `src/main/agent-bridge.ts` or a dedicated channel in `src/main`, one line in `src/preload/index.ts`, a Zustand store with discriminated states in `src/renderer/src/stores`, a view in `stores/navigation.ts`, texts in `i18n/strings`, `Screen` · `Section` · `Panel` · `Fact` components on the `@pupitre/design` tokens, `usePending` on every gesture, `fix` displayed as is, store tests on `stubPupitre`, main-process tests on the fake agent, a Playwright scenario. Use whenever a screen is touched."
---

# Desktop app screens

The app is a client of the agent: it displays what `pupitred` returns and has no second model. A screen starts with the protocol command it reads, reuses the primitives of `components/ui/`, and ends with its tests. **Read [`apps/desktop/CLAUDE.md`](../../../apps/desktop/CLAUDE.md) first**: this skill says how a screen is built, the guide says what the app never does.

The existing code is the reference: before writing, open the screen closest to what you are asked for (`shots/` for a list read from the agent, `services/` for a sheet with a form, `files/` for a view that holds its own height, `onboarding/` for a step of a flow) and copy its shape.

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

## Example: the gallery, as it is written

Excerpts from `stores/shots.ts`, `components/shots/shots-screen.tsx` and their tests — open the files for the rest.

### The store — `src/renderer/src/stores/shots.ts`

```ts
import type { Shot, ShotsListResult } from "@pupitre/shared/agent-protocol/processes";
import { agentCall as call } from "@renderer/lib/agent-call";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

export type ShotsState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; shots: Shot[] }
  | { status: "failed"; serverId: string; error: AgentError };

interface ShotsStore {
  state: ShotsState;
  removing: string | null;
  read: (serverId: string) => Promise<void>;
  remove: (serverId: string, path: string) => Promise<void>;
  forget: () => void;
}

export const useShots = create<ShotsStore>((set, get) => ({
  state: { status: "idle" },
  removing: null,

  async read(serverId) {
    set({ state: { status: "loading", serverId } });

    const answer = await call<ShotsListResult>(serverId, "shots.list");

    set({
      state: answer.ok
        ? { status: "read", serverId, shots: answer.result.shots }
        : { status: "failed", serverId, error: answer.error },
    });
  },

  async remove(serverId, path) {
    set({ removing: path });

    const answer = await call(serverId, "shots.clean", { path });

    set({ removing: null });

    if (answer.ok) {
      await get().read(serverId);
    }
  },

  forget() {
    set({ state: { status: "idle" }, removing: null });
  },
}));
```

### The screen — `src/renderer/src/components/shots/shots-screen.tsx`

```tsx
export function ShotsScreen({ serverId, serverName }: { serverId: string; serverName: string }) {
  const t = useTranslations();
  const state = useShots((s) => s.state);
  const read = useShots((s) => s.read);
  const clean = useShots((s) => s.clean);

  useEffect(() => {
    read(serverId);
  }, [serverId, read]);

  return (
    <Screen
      actions={
        <ConfirmButton
          confirmLabel={t("shots.clearConfirm")}
          icon={Trash2}
          onConfirm={() => clean(serverId)}
          question={t("shots.clearQuestion")}
        >
          {t("shots.clear")}
        </ConfirmButton>
      }
      eyebrow={serverName}
      title={t("shots.title")}
    >
      {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

      {state.status === "failed" ? (
        <ErrorNotice error={state.error} onRetry={() => read(serverId)} />
      ) : null}

      {state.status === "read"
        ? shotsByDay(state.shots).map((group) => (
            <Section key={group.day} title={dayLabel(group.day)}>
              …
            </Section>
          ))
        : null}
    </Screen>
  );
}
```

A page reads on `useEffect` on arrival. An **onboarding step** does not: it is `stores/onboarding-machine.ts` that says what entering a step triggers, and the store runs the effect.

### The store test — `stores/__tests__/shots.test.ts`

```ts
function agent(answers: Partial<Record<CommandName, unknown>>): void {
  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName) =>
      Promise.resolve(
        answers[cmd] === undefined
          ? { error: { code: "internal", message: "nothing" }, ok: false }
          : { ok: true, result: answers[cmd] }
      ),
  });
}

it("lists the screenshots the server named", async () => {
  agent({ "shots.list": { shots: SHOTS } });

  await useShots.getState().read(SERVER);

  expect(useShots.getState().state).toMatchObject({ status: "read", shots: SHOTS });
});
```

### A dedicated channel and its flow — `src/main/shots.ts` · `shots-run.ts`

```ts
export function registerShots(): void {
  ipcMain.handle("shots:save", (_e, path: unknown, bytes: unknown) =>
    saveShot(path, bytes, { picked: pickedPath, write: writeFile })
  );
}

export async function saveShot(path: unknown, bytes: unknown, deps: Deps): Promise<AgentResponse<{ path: string }>> {
  if (!deps.picked(path)) {
    return refuseWith("bad_request", "refusal.shots.savePath");
  }

  …
}
```

The flow receives its dependencies and is tested without Electron (`__tests__/shots-save.test.ts`); what talks to the agent is tested on a transcript (`fakeAgent("shots-read.jsonl")`, `__tests__/shots-read.test.ts`).

### The Playwright scenario — `e2e/shots.spec.ts`

The harness launches the app (`launchPupitre()`), replaces `agent:call` with `answer("agent:call", …)` on the fixtures of `ANSWERS`, and the test reads the screen like a reader: `getByRole`, `getByText`, then `assertAccessible(page, "shots")`.

## Before handing back

1. The command and the type come from `@pupitre/shared/agent-protocol`; nothing is redeclared in `src/shared/`.
2. The renderer only sends identifiers; `BRIDGE_COMMANDS` or the dedicated handler validates them.
3. The store keeps the envelope; `fix` reaches the screen as is; no sentence outside `i18n/strings`.
4. `Screen` · `Section` · `Panel` · `Fact`; no hard-coded colour; no primitive reinvented outside `components/ui/`; one component per file; semicolons.
5. Every async gesture returns its promise; every wait says what is happening; every error says the remedy; every button without a label has its tooltip.
6. Tests: store on `stubPupitre`, main process on its dependencies or a transcript, screen through Playwright with `assertAccessible(page, "<screen>")`. What floats (dialog, a `Select`'s list) is read through `mount` and `optionsOf` of `__tests__/dom.tsx`, never through `renderToStaticMarkup`. Assertions in `it()`, no `.only`.
7. `bun --cwd=apps/desktop run lint`, `check:types`, `test` green; `test:e2e` green. Then the real app: `bun run dev:desktop` and the screen opened, not only the tests.
