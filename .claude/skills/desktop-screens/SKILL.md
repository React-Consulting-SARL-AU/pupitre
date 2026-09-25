---
name: desktop-screens
description: "Ajouter ou refondre un écran de l'app Electron `apps/desktop` — commande du protocole autorisée dans `src/main/agent-bridge.ts` ou canal dédié dans `src/main`, une ligne dans `src/preload/index.ts`, store Zustand à états discriminés dans `src/renderer/src/stores`, vue dans `stores/navigation.ts`, textes dans `i18n/strings`, composants `Screen` · `Section` · `Panel` · `Fact` sur les tokens de `@pupitre/design`, `usePending` sur chaque geste, `fix` affiché tel quel, tests du store sur `stubPupitre`, du main sur l'agent factice, scénario Playwright. À utiliser dès qu'on touche à un écran."
---

# Écrans de l'app desktop

L'app est un client de l'agent : elle affiche ce que `pupitred` renvoie et n'a pas de second modèle. Un écran commence par la commande du protocole qu'il lit, réutilise les primitives de `components/ui/`, et finit par ses tests. **Lis d'abord [`apps/desktop/CLAUDE.md`](../../../apps/desktop/CLAUDE.md)** : ce skill dit comment un écran se construit, le guide dit ce que l'app ne fait jamais.

Le code existant est la référence : avant d'écrire, ouvre l'écran le plus proche de ce qu'on te demande (`shots/` pour une liste lue de l'agent, `services/` pour une fiche avec formulaire, `files/` pour une vue qui tient sa hauteur, `onboarding/` pour une étape d'un parcours) et copie sa forme.

## Où vivent les choses

| Fichier | Rôle |
| --- | --- |
| `packages/shared/src/agent-protocol/` · `docs/contracts/agent-protocol.md` | les commandes, leurs paramètres, leurs résultats, leurs événements — rien n'est redéclaré ailleurs |
| `apps/desktop/src/shared/` | ce qui traverse IPC et n'est pas du protocole : l'enveloppe `AgentResponse`, les erreurs du canal, les formes propres à l'app |
| `src/main/agent-client.ts` | le client SSH d'un serveur : cinq canaux — contrôle, travail, battement, suivi, et privilégié à la demande —, `request(serverId, cmd, params, { onEvent, onSecret })` |
| `src/main/agent-bridge.ts` | `BRIDGE_COMMANDS`, les seules commandes que le renderer peut nommer sur `agent:call` ; `checkedCall` valide le serveur, la commande et ses paramètres |
| `src/main/<feature>.ts` | `register<Feature>()` : les `ipcMain.handle` d'une feature, enregistrés depuis `src/main/index.ts` |
| `src/main/<feature>-run.ts` | le déroulé pur d'une opération, testable sans Electron, avec ses dépendances en paramètre |
| `src/main/refusal.ts` | `refuseWith(code, "refusal.<feature>.<quoi>", values)` : un refus du main nomme une entrée du dictionnaire, il n'écrit aucune phrase |
| `src/preload/index.ts` | `window.pupitre`, typé `PupitreApi` ; `agentCall`, `agentPoll`, `agentStream` pour le protocole, une méthode nommée pour chaque canal dédié |
| `src/renderer/src/lib/agent-call.ts` | `agentCall<T>()` et `agentPoll<T>()`, l'appel typé par ce que l'écran attend |
| `src/renderer/src/stores/<feature>.ts` | un store Zustand par sujet, l'état en union discriminée par `status` |
| `src/renderer/src/stores/navigation.ts` | `VIEWS`, `Location`, l'historique de l'app |
| `src/renderer/src/i18n/strings/<feature>.ts` | les textes de l'écran, `en` et `fr`, dont les refus `refusal.<feature>.<quoi>` et leur `.fix` |
| `src/renderer/src/components/<feature>/` | l'écran et ses fichiers frères, `{feature}-{context}-{type}.tsx` |
| `src/renderer/src/components/ui/` | Base UI + shadcn sur les tokens : `screen`, `section`, `panel`, `fact`, `button`, `icon-button`, `confirm-button`, `dialog`, `menu`, `field`, `error-notice`, `waiting-notice`, `empty-state`, `skeleton`, `status-dot`, `tooltip`… |
| `src/renderer/src/lib/use-pending.ts` | `usePending` : le contrôle cliqué attend tant que la promesse du geste court |
| `src/renderer/src/components/shell/app-sidebar.tsx` · `src/renderer/src/app.tsx` | où une vue s'ouvre |
| `src/main/__tests__/` · `fixtures/` | tests du main ; `fake-agent.ts` rejoue des transcriptions `.jsonl` |
| `src/renderer/src/__tests__/stub-pupitre.ts` · `stores/__tests__/` | `stubPupitre(partial)` remplace `window.pupitre` pour un test de store |
| `e2e/` · `e2e/harness/` | Playwright pour Electron ; `launchPupitre()`, `ANSWERS`, `assertAccessible` |

Style propre au workspace : `apps/desktop/biome.jsonc` impose les **points-virgules** (le reste du monorepo les omet). Alias `@renderer` → `src/renderer/src`, `@shared` → `src/shared`. Un composant React par fichier hors `components/ui/`, pas de barrel file.

## Le chemin d'une donnée

```
composant ──► store ──► agentCall(serverId, cmd, params) ──► preload ──► agent:call ──► checkedCall ──► agentClient.request ──► pupitred
```

- **Le protocole passe par `agent:call`.** Une commande que l'écran lit ou déclenche s'ajoute à `BRIDGE_COMMANDS` ; le main vérifie qu'elle existe dans `COMMANDS`, que ses paramètres ont la forme du contrat, que le serveur est connu, et que le service nommé est un de ceux que l'agent vient de lister. `agentPoll` pour ce qu'un écran relit sur minuterie (canal `beat`), `agentStream` pour une commande longue dont les événements comptent.
- **Un canal dédié seulement quand le main ajoute ou retient quelque chose** : un secret, un jeton, un chemin local, un `ssh`, un fichier. Il vit dans `src/main/<feature>.ts`, son déroulé dans `<feature>-run.ts` avec ses dépendances injectées, et refuse par `refuseWith`. Jamais un `child_process` dans un handler, jamais un `ssh` par appel.
- **Le renderer nomme, le main valide.** Un identifiant de serveur, un nom de projet, un libellé, une action. Aucune chaîne libre venue de l'interface n'atteint un shell (`docs/security.md`).
- **Le résultat traverse tel quel.** `{ ok: true, result }` ou `{ ok: false, error: { code, message, fix?, phrase? } }`. Le store le garde tel quel et ne le complète pas : ce que l'agent n'a pas dit, l'écran ne le montre pas. `ErrorNotice` rend `message` puis `fix` ; `phrase` est un refus du main que le renderer traduit.
- **Aucun secret dans un store, un log ou une commande.** Un secret part par le flux secret (`onSecret`) et n'est jamais conservé après l'envoi.

## Ajouter un écran, dans l'ordre

1. **Le type du protocole.** La commande et son résultat existent dans `docs/contracts/agent-protocol.md` et dans `@pupitre/shared/agent-protocol`. Sinon, on s'arrête : le besoin se signale au propriétaire et le contrat est amendé d'abord.
2. **Le pont.** La commande entre dans `BRIDGE_COMMANDS` ; ou, si le main doit y mettre du sien, un handler dans `src/main/<feature>.ts` + une ligne typée dans `src/preload/index.ts` + son entrée dans `QUIET` de `stub-pupitre.ts` si une étape la déclenche seule. `ipc-surface.test.ts` refuse un canal que l'un appelle et que l'autre n'écoute pas, et un canal que le harnais Playwright ne répond pas.
3. **Le store**, `stores/<feature>.ts` : `state` en union discriminée par `status` — `idle` · `loading` · `read` · `failed` — jamais `loading` et `error` côte à côte ; un champ par geste en cours (`removing: string | null`) pour que seul le bouton cliqué attende ; `forget()` pour le test et le changement de serveur.
4. **Les textes**, `i18n/strings/<feature>.ts`, `en` puis `fr`, importé dans `i18n/en.ts` et `i18n/fr.ts`. Pluriels en `.one` / `.other`, refus en `refusal.<feature>.<quoi>` et `refusal.<feature>.<quoi>.fix`. Aucune phrase dans un composant.
5. **La vue**, si l'écran est une page : `VIEWS` dans `stores/navigation.ts`, son entrée dans `app-sidebar.tsx`, son rendu dans `app.tsx`, sa commande dans la palette si elle s'y attend.
6. **Les composants**, `components/<feature>/` : `<feature>-screen.tsx` compose les primitives ; les sous-composants sont des fichiers frères.
7. **Les tests** : le store sur `stubPupitre`, le déroulé du main sur ses dépendances ou sur une transcription de l'agent factice, l'écran par Playwright avec `assertAccessible`.

## Composants

- **Cherche la primitive avant d'écrire** : bouton, point d'état, libellé, avis d'attente, avis d'erreur, champ, liste, menu, infobulle. Si elle manque, elle naît dans `components/ui/` avec un `variant`, jamais dans le dossier de la feature.
- **Chaque contrôle est une primitive sur Base UI** : `Select` (groupes par `groups`), `NumberField`, `CheckBox` / `CheckLine`, `Switch` / `SwitchLine` pour une préférence, `RadioGroup` + `Radio` / `RadioLine`, `ModeCards` + `ModeCard` pour un choix en cartes, `Segmented`, `TabBar` + `Tab` (`orientation="vertical"` pour une colonne de panes), `Details` (plié, `open` + `onOpenChange` quand un refus doit l'ouvrir), `FoldingSection` (une `Section` qui se plie sous son titre, `open` pour celle qui commence ouverte — une page lue par morceaux, comme l'aide), `Dialog`, `ConfirmButton` (un `alertdialog`), `Menu`, `Tooltip`, `Hint`. Jamais un `<select>`, un `<details>`, une case native ni un `role="dialog"` à la main. Un formulaire est une suite de `Section` sur des `Panel inset="lg"`, ses champs en `gap-6`, son geste dans l'`ActionBar` au pied de la page.
- **Une page du shell commence par `Screen`** : `eyebrow` est le contexte (le nom du serveur sur ses pages, « Projet » ou « Service » sur une fiche, « Application » dans les réglages), `title` est la chose ou la page, `actions` porte les gestes sur la chose entière, `tabs` une `TabBar`, `fill` quand le corps tient sa propre hauteur. Une étape d'un parcours est un `Screen` en `column` avec `step` et `footer` ; dans l'onboarding elle ajoute `plain`. Aucune page ne pose son propre `max-w-*`, son `h1` ni son bandeau.
- **Chaque section est `Section`** : `title`, `aside` pour ce qui la qualifie, `actions` pour ses gestes sur la même ligne. **Chaque cadre est `Panel`** : `list` pour des lignes, `inset` pour l'air, `panelClass()` sur un `form`. **Chaque fait est `Fact`** dans une `FactList` : libellé, valeur en `font-data`, `detail` en dessous. Une page n'écrit pas deux fois la même donnée.
- **Chaque geste répond là où il a été fait.** `Button`, `IconButton` et `ConfirmButton` passent en `loading` d'eux-mêmes dès que le gestionnaire rend une promesse (`usePending`) : un gestionnaire asynchrone retourne toujours sa promesse. Un formulaire finit sur son bouton au pied, actif quand quelque chose a changé ; un refus se lit sous le champ, avec `aria-invalid` et `aria-describedby`.
- **Une confirmation est `ConfirmButton`** quand elle tient sur la ligne du geste, `ConfirmDialog` — la même question, sans le bouton — quand autre chose que ce bouton l'ouvre (un raccourci, la fermeture d'un onglet), `Dialog` quand elle porte une conséquence à lire ou plusieurs issues. Jamais un bloc rouge dessiné dans la carte.
- **Un bouton qui n'a qu'une icône porte une infobulle** (`IconButton` la pose, sur `ui/tooltip.tsx`) ; un bouton icône + libellé n'en porte aucune. Le `title` natif ne s'affiche pas dans Electron sur macOS.
- **Tokens seulement** : `bg-base`, `bg-surface`, `bg-sunken`, `bg-raised`, `text-ink` à `text-ink-4`, `border-line`, `border-line-strong`, `bg-inverse text-inverse-ink` pour le bouton principal, `text-ok`, `text-warn`, `text-danger` pour l'état seulement, `font-data` pour toute donnée, `rounded-sm` pour les contrôles, `rounded-md` pour les panneaux. `grep -rE "#[0-9a-f]{6}|hsl\(|rgb\(" src/renderer --include=*.tsx` reste vide.
- **L'état se lit à la forme d'abord** : point plein pour en ligne, cercle vide pour arrêté, point barré pour en échec, point qui respire pour en cours. La couleur confirme.
- **Chaque attente dit ce qui se passe** (`WaitingNotice`, `SkeletonRows`) : le module, l'étape, la durée. Jamais un spinner seul. **Chaque erreur dit le remède** (`ErrorNotice` avec `onRetry`).
- **Base UI + shadcn, prop `render`**, jamais `asChild`, jamais Radix. Lucide uniquement, trait 1,5 px, jamais coloré. Un bouton d'action porte son icône avant son libellé.
- Pas d'ombre, pas de dégradé, pas d'illustration, pas de description qui raconte l'écran.

## Exemple : la galerie, telle qu'elle est écrite

Extraits de `stores/shots.ts`, `components/shots/shots-screen.tsx` et de leurs tests — ouvre les fichiers pour le reste.

### Le store — `src/renderer/src/stores/shots.ts`

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

### L'écran — `src/renderer/src/components/shots/shots-screen.tsx`

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

Une page lit sur `useEffect` à l'arrivée. Une **étape de l'onboarding** ne le fait pas : c'est `stores/onboarding-machine.ts` qui dit ce qu'entrer dans une étape déclenche, et le store exécute l'effet.

### Le test du store — `stores/__tests__/shots.test.ts`

```ts
function agent(answers: Partial<Record<CommandName, unknown>>): void {
  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName) =>
      Promise.resolve(
        answers[cmd] === undefined
          ? { error: { code: "internal", message: "rien" }, ok: false }
          : { ok: true, result: answers[cmd] }
      ),
  });
}

it("liste les captures que le serveur a nommées", async () => {
  agent({ "shots.list": { shots: SHOTS } });

  await useShots.getState().read(SERVER);

  expect(useShots.getState().state).toMatchObject({ status: "read", shots: SHOTS });
});
```

### Un canal dédié et son déroulé — `src/main/shots.ts` · `shots-run.ts`

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

Le déroulé reçoit ses dépendances et se teste sans Electron (`__tests__/shots-save.test.ts`) ; ce qui parle à l'agent se teste sur une transcription (`fakeAgent("shots-read.jsonl")`, `__tests__/shots-read.test.ts`).

### Le scénario Playwright — `e2e/shots.spec.ts`

Le harnais lance l'app (`launchPupitre()`), remplace `agent:call` par `answer("agent:call", …)` sur les fixtures de `ANSWERS`, et le test lit l'écran comme un lecteur : `getByRole`, `getByText`, puis `assertAccessible(page, "shots")`.

## Avant de rendre la main

1. La commande et le type viennent de `@pupitre/shared/agent-protocol` ; rien n'est redéclaré dans `src/shared/`.
2. Le renderer n'envoie que des identifiants ; `BRIDGE_COMMANDS` ou le handler dédié les valide.
3. Le store garde l'enveloppe ; `fix` arrive à l'écran tel quel ; aucune phrase hors de `i18n/strings`.
4. `Screen` · `Section` · `Panel` · `Fact` ; aucune couleur en dur ; aucune primitive réinventée hors `components/ui/` ; un composant par fichier ; points-virgules.
5. Chaque geste asynchrone retourne sa promesse ; chaque attente dit ce qui se passe ; chaque erreur dit le remède ; chaque bouton sans libellé a son infobulle.
6. Tests : store sur `stubPupitre`, main sur ses dépendances ou une transcription, écran par Playwright avec `assertAccessible(page, "<écran>")`. Ce qui flotte (dialogue, liste d'un `Select`) se lit par `mount` et `optionsOf` de `__tests__/dom.tsx`, jamais par `renderToStaticMarkup`. Assertions dans `it()`, pas de `.only`.
7. `bun --cwd=apps/desktop run lint`, `check:types`, `test` verts ; `test:e2e` vert. Puis l'app réelle : `bun run dev:desktop` et l'écran ouvert, pas seulement les tests.
