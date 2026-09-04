---
name: desktop-screens
description: "Ajouter ou refondre un écran de l'app Electron `apps/desktop` — store Zustand dans `src/renderer/src/stores`, méthode IPC exposée dans `src/preload/index.ts` et gérée dans `src/main`, appel de l'agent par `src/main/agent-client.ts` avec les types de `@pupitre/shared/agent-protocol`, composants monochromes sur les tokens de `@pupitre/design`, état par la forme, `fix` affiché tel quel, test du store et du main avec l'agent factice, scénario Playwright. À utiliser pour toute tâche `APP` qui touche à un écran."
---

# Écrans de l'app desktop

L'app est un client de l'agent : elle affiche ce que `pupitred` renvoie et n'a pas de second modèle. Un écran nouveau commence par la commande du protocole qu'il lit, finit par un test Playwright, et ne touche jamais au système depuis le renderer.

## Fichiers gouvernés

| Fichier | Rôle |
| --- | --- |
| `apps/desktop/src/main/agent-client.ts` | le canal SSH par serveur qui lance `pupitred serve` ; `request(serverId, cmd, params)` typé par le protocole (APP-02) |
| `apps/desktop/src/main/<feature>.ts` | les handlers `ipcMain.handle` d'une feature ; validation des noms contre ce que l'agent a donné |
| `apps/desktop/src/main/index.ts` | enregistre les handlers, crée la fenêtre |
| `apps/desktop/src/preload/index.ts` | la surface IPC exposée au renderer, typée, et rien d'autre |
| `apps/desktop/src/renderer/src/stores/<store>.ts` | un store Zustand par domaine : `servers`, `snapshot`, `onboarding`, `theme`, `account` |
| `apps/desktop/src/renderer/src/components/<feature>/` | les écrans : `onboarding/`, `dashboard/`, `projects/`, `terminals/`, `agents/`, `services/`, `settings/`, `account/` |
| `apps/desktop/src/renderer/src/components/ui/` | les primitives Base UI + shadcn sur les tokens (APP-01) |
| `apps/desktop/src/renderer/src/styles.css` | importe `@pupitre/design/tailwind.css` ; aucune couleur ici |
| `apps/desktop/src/main/__tests__/` | tests du main ; `fixtures/` contient les transcriptions de l'agent factice |
| `apps/desktop/src/renderer/src/stores/__tests__/` | tests des stores |
| `apps/desktop/e2e/` | Playwright pour Electron |
| `packages/shared/src/agent-protocol/` | les types des commandes, résultats, événements, erreurs |
| `docs/contracts/agent-protocol.md` | le contrat du protocole |
| `docs/product/DESIGN.md` | le système de design |

## État du dépôt

Au 2026-09-04, `apps/desktop` est l'app d'origine déplacée par INF-03 : un seul store (`stores/state.ts`), des composants en PascalCase à la racine de `components/`, un canal `sh` à marqueurs dans `src/main/ssh.ts` qui parle à l'ancienne commande `dev`, une palette chaude dans `styles.css`. **APP-01** livre les tokens et `components/ui/`, **APP-02** livre `agent-client.ts` et l'agent factice, **INF-04** livre `@pupitre/shared/agent-protocol`. Ce skill décrit la cible ; un écran nouveau suit la cible, pas l'existant. Un écran existant migre vers la cible quand sa tâche le dit (APP-09), pas avant.

Style propre au workspace : `apps/desktop/biome.jsonc` impose les **points-virgules** (le reste du monorepo les omet). Alias `@renderer` → `src/renderer/src`, `@shared` → `src/shared`. Fichiers `{feature}-{context}-{type}.tsx`, un composant React par fichier hors `components/ui/`, pas de barrel file.

## Le chemin d'une donnée

```
composant ──► store Zustand ──► window.pupitre.<méthode>() ──► preload ──► ipcMain.handle ──► agent-client.request(serverId, cmd) ──► pupitred
```

- **Le renderer nomme, le main valide.** Le renderer envoie un identifiant de serveur, un nom de projet, une action. Le main vérifie le nom contre la liste que l'agent vient de donner avant d'en faire une commande. Aucune chaîne libre venue de l'interface n'atteint un shell (`docs/security.md`).
- **Un canal par serveur**, tenu par `agent-client.ts`. Jamais un `ssh` par appel, jamais un `child_process` dans un handler de feature.
- **Le résultat traverse tel quel.** `request` renvoie l'enveloppe du protocole, `{ ok: true, result }` ou `{ ok: false, error: { code, message, fix } }`, et le store la garde telle quelle. `fix` s'affiche tel quel dans le composant.
- **Aucun secret dans un store, un log ou une commande.** Un secret part par le flux secret (`secrets_stdin`) et n'est jamais conservé après l'envoi.
- **Le thème** est celui de `stores/theme` : `system`, `light`, `dark`, appliqué par `data-theme` sur `<html>` ; xterm bascule avec lui.

## Ajouter un écran, dans l'ordre

1. **Le type du protocole.** La commande et son résultat existent dans `docs/contracts/agent-protocol.md` et dans `@pupitre/shared/agent-protocol`. Sinon, la tâche s'arrête, écrit le besoin dans `docs/TRACKING.md`, et attend une tâche de contrat.
2. **Le handler du main**, dans `src/main/<feature>.ts`, enregistré depuis `src/main/index.ts`. Il valide l'entrée, appelle `agentClient.request`, renvoie l'enveloppe.
3. **La méthode du preload**, une ligne dans `src/preload/index.ts`, typée par le résultat du protocole. Le type `PupitreApi` en découle et le renderer le voit par `window.pupitre`.
4. **Le store**, dans `src/renderer/src/stores/<store>.ts`. L'état est une union discriminée par `status`, jamais des booléens `loading` et `error` côte à côte.
5. **Les composants**, dans `src/renderer/src/components/<feature>/`. L'écran compose des primitives de `components/ui/` ; les sous-composants vivent dans des fichiers frères.
6. **Les tests** : le main avec l'agent factice, le store avec `window.pupitre` remplacé, l'écran par Playwright.

## Composants

- **Cherche la primitive avant d'écrire** : bouton, point d'état, libellé, avis d'attente, avis d'erreur, champ, liste. Si elle manque, elle naît dans `components/ui/` avec un `variant`, jamais dans le dossier de la feature.
- **Tokens seulement** : `bg-base`, `bg-surface`, `bg-sunken`, `bg-raised`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-ink-4`, `border-line`, `border-line-strong`, `bg-inverse text-inverse-ink` pour le bouton principal, `text-ok`, `text-warn`, `text-danger` pour l'état seulement, `font-data` pour toute donnée (port, chemin, commande, durée, version, empreinte), `rounded-sm` pour les contrôles, `rounded-md` pour les panneaux. `grep -rE "#[0-9a-f]{6}|hsl\(|rgb\(" src/renderer --include=*.tsx` doit rester vide (critère d'APP-01).
- **L'état se lit à la forme d'abord** : point plein pour en ligne, cercle vide pour arrêté, point barré pour en échec, point qui respire pour en cours. La couleur confirme, l'écran reste lisible en gris.
- **Chaque attente dit ce qui se passe** : le module, l'étape, le compteur, la durée. Jamais un spinner seul.
- **Chaque erreur dit le remède** : `error.message` puis `error.fix` tel quel, dans une balise `<code>` s'il ressemble à une commande, avec le bouton qui rejoue.
- **Base UI + shadcn, prop `render`**, jamais `asChild`, jamais Radix. Lucide uniquement, trait 1,5 px, jamais coloré. Un bouton d'action porte son icône avant son libellé.
- Pas d'ombre, pas de dégradé, pas d'illustration, pas de spinner décoratif.

## Exemple complet : l'écran « Inspection » (APP-04)

L'écran envoie `probe` au serveur actif et rend le verdict : `bare`, `managed` (version, mise à jour disponible), `occupied` (ce qui serait touché), `incompatible` (raison, remède). Les boutons dépendent du verdict. Sur un serveur sans agent, `agent-client` joue `probe.sh` en mémoire et renvoie le même `ProbeResult` (AGT-02 garantit l'égalité des deux sondes) : l'écran ne fait pas la différence.

### Le handler du main — `src/main/inspection.ts`

```ts
import type { AgentResponse, ProbeResult } from "@pupitre/shared/agent-protocol";
import { ipcMain } from "electron";
import { agentClient } from "./agent-client";
import { knownServer } from "./servers";

export function registerInspection(): void {
  ipcMain.handle(
    "inspection:probe",
    (_event, serverId: unknown): Promise<AgentResponse<ProbeResult>> => {
      const server = knownServer(serverId);

      if (!server) {
        return Promise.resolve({
          ok: false,
          error: {
            code: "unknown_server",
            message: "Ce serveur n'est plus dans la liste.",
            fix: "Choisissez un serveur dans la barre latérale.",
          },
        });
      }

      return agentClient.request(server.id, "probe");
    }
  );
}
```

`knownServer` (dans `src/main/servers.ts`) renvoie le serveur seulement si l'identifiant est une chaîne connue de la configuration de l'app. Le handler ne construit aucune commande : `"probe"` est une commande du protocole, typée, sans paramètre.

### Le preload — `src/preload/index.ts`

```ts
inspect: (serverId: string): Promise<AgentResponse<ProbeResult>> =>
  ipcRenderer.invoke("inspection:probe", serverId),
```

Une ligne dans l'objet `api`, avec les autres. Le nom du canal IPC est `<feature>:<action>`.

### Le store — `src/renderer/src/stores/onboarding.ts`

```ts
import type { AgentError, ProbeResult } from "@pupitre/shared/agent-protocol";
import { create } from "zustand";

export type InspectionState =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; probe: ProbeResult }
  | { status: "failed"; serverId: string; error: AgentError };

type OnboardingStore = {
  inspection: InspectionState;
  inspect: (serverId: string) => Promise<void>;
  resetInspection: () => void;
};

export const useOnboarding = create<OnboardingStore>((set) => ({
  inspection: { status: "idle" },

  async inspect(serverId) {
    set({ inspection: { status: "running", serverId } });

    const response = await window.pupitre.inspect(serverId);

    set({
      inspection: response.ok
        ? { status: "done", serverId, probe: response.result }
        : { status: "failed", serverId, error: response.error },
    });
  },

  resetInspection() {
    set({ inspection: { status: "idle" } });
  },
}));
```

Le store ne transforme pas le résultat de l'agent et ne le complète pas : ce que l'agent n'a pas dit, l'écran ne le montre pas.

### L'écran — `src/renderer/src/components/onboarding/onboarding-inspection-screen.tsx`

```tsx
import { useEffect } from "react";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useOnboarding } from "@renderer/stores/onboarding";
import { useServers } from "@renderer/stores/servers";
import { OnboardingInspectionActions } from "./onboarding-inspection-actions";
import { OnboardingInspectionVerdict } from "./onboarding-inspection-verdict";

export function OnboardingInspectionScreen() {
  const serverId = useServers((s) => s.activeId);
  const inspection = useOnboarding((s) => s.inspection);
  const inspect = useOnboarding((s) => s.inspect);

  useEffect(() => {
    if (serverId) {
      void inspect(serverId);
    }
  }, [serverId, inspect]);

  if (inspection.status === "idle" || inspection.status === "running") {
    return (
      <WaitingNotice
        title="Inspection du serveur"
        detail="Système, mémoire, disque, ports, utilisateurs"
      />
    );
  }

  if (inspection.status === "failed") {
    return (
      <ErrorNotice
        error={inspection.error}
        onRetry={() => inspect(inspection.serverId)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <p className="text-ink-3 text-xs uppercase tracking-widest">Inspection</p>
        <h1 className="font-data text-ink">
          {inspection.probe.os} {inspection.probe.version} · {inspection.probe.arch} ·{" "}
          {inspection.probe.ram_mb} Mo
        </h1>
      </header>

      <OnboardingInspectionVerdict probe={inspection.probe} />
      <OnboardingInspectionActions probe={inspection.probe} />
    </section>
  );
}
```

`WaitingNotice` et `ErrorNotice` sont des primitives de `components/ui/` : la première affiche le titre et le détail de ce qui se passe avec le point qui respire, la seconde affiche `message`, `fix` tel quel et le bouton de rejeu. Les noms sont ceux qu'APP-01 livre ; s'ils diffèrent, ce skill se met à jour.

### Le verdict — `onboarding-inspection-verdict.tsx`

```tsx
import type { ProbeResult } from "@pupitre/shared/agent-protocol";
import { StatusDot } from "@renderer/components/ui/status-dot";

type Verdict = ProbeResult["verdict"];

type VerdictLook = {
  shape: "filled" | "empty" | "struck";
  tone: "neutral" | "ok" | "warn" | "danger";
  title: string;
};

const VERDICTS: Record<Verdict, VerdictLook> = {
  bare: { shape: "empty", tone: "neutral", title: "Serveur nu" },
  managed: { shape: "filled", tone: "ok", title: "Déjà géré par Pupitre" },
  occupied: { shape: "filled", tone: "warn", title: "Serveur occupé" },
  incompatible: { shape: "struck", tone: "danger", title: "Serveur incompatible" },
};

type Props = {
  probe: ProbeResult;
};

export function OnboardingInspectionVerdict({ probe }: Props) {
  const verdict = VERDICTS[probe.verdict];

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <StatusDot shape={verdict.shape} tone={verdict.tone} />
        <h2 className="text-ink font-semibold">{verdict.title}</h2>
        {probe.agent_version ? (
          <span className="font-data text-ink-3">pupitred {probe.agent_version}</span>
        ) : null}
      </div>

      {probe.reasons.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {probe.reasons.map((reason, index) => (
            <li key={reason} className="flex flex-col gap-0.5 border-line border-l pl-3">
              <span className="text-ink-2">{reason}</span>
              {probe.fixes[index] ? (
                <code className="font-data text-ink-3">{probe.fixes[index]}</code>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

Les raisons et les remèdes sont ceux que la sonde renvoie, dans l'ordre, sans reformulation.

### Les actions — `onboarding-inspection-actions.tsx`

```tsx
import type { ProbeResult } from "@pupitre/shared/agent-protocol";
import { Button } from "@renderer/components/ui/button";
import { useOnboarding } from "@renderer/stores/onboarding";
import { useServers } from "@renderer/stores/servers";

type Props = {
  probe: ProbeResult;
};

export function OnboardingInspectionActions({ probe }: Props) {
  const goTo = useOnboarding((s) => s.goTo);
  const pickAnother = useServers((s) => s.clearActive);

  const install = <Button variant="primary" onClick={() => goTo("catalog")}>Installer</Button>;
  const installAnyway = <Button onClick={() => goTo("catalog")}>Installer quand même</Button>;
  const upgrade = <Button variant="primary" onClick={() => goTo("upgrade")}>Mettre à jour</Button>;
  const another = <Button variant="ghost" onClick={pickAnother}>Choisir un autre serveur</Button>;

  return (
    <div className="flex gap-2">
      {probe.verdict === "bare" ? install : null}
      {probe.verdict === "managed" ? upgrade : null}
      {probe.verdict === "occupied" ? installAnyway : null}
      {another}
    </div>
  );
}
```

`goTo` navigue dans l'onboarding (store `onboarding`) ; `clearActive` désélectionne le serveur (store `servers`). Aucun des deux ne parle au main.

### Test du main — `src/main/__tests__/inspection.test.ts`

L'agent factice (APP-02) rejoue une transcription : une ligne de requête attendue, une ligne de réponse rendue. Il tourne dans un `child_process` local à la place de `ssh`, ce qui teste `agent-client` sans réseau.

`src/main/__tests__/fixtures/probe-bare.jsonl` :

```jsonl
{"id":1,"cmd":"hello","params":{"app_version":"0.1.0","protocol":1}}
{"id":1,"ok":true,"result":{"agent_version":"0.1.0","protocol":1,"entitlement":"dev","capabilities":["probe"]}}
{"id":2,"cmd":"probe"}
{"id":2,"ok":true,"result":{"os":"ubuntu","version":"24.04","arch":"amd64","ram_mb":4096,"disk_free_gb":38,"sudo":true,"ports":[],"docker":false,"panel":null,"agent_version":null,"installed_modules":[],"verdict":"bare","reasons":[],"fixes":[]}}
```

```ts
import { describe, expect, it } from "bun:test";
import { createAgentClient } from "../agent-client";
import { fakeAgent } from "./fixtures/fake-agent";

describe("probe", () => {
  it("renvoie le verdict de la transcription", async () => {
    const client = createAgentClient({ spawn: fakeAgent("probe-bare.jsonl") });

    const response = await client.request("staging", "probe");

    expect(response).toMatchObject({ ok: true, result: { verdict: "bare" } });
  });

  it("transmet l'erreur et son remède sans les toucher", async () => {
    const client = createAgentClient({ spawn: fakeAgent("probe-incompatible.jsonl") });

    const response = await client.request("staging", "probe");

    expect(response).toMatchObject({
      ok: true,
      result: {
        verdict: "incompatible",
        reasons: ["Debian 12 n'est pas pris en charge"],
        fixes: ["Réinstallez le serveur en Ubuntu 24.04"],
      },
    });
  });
});
```

### Test du store — `src/renderer/src/stores/__tests__/onboarding.test.ts`

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useOnboarding } from "../onboarding";

describe("inspect", () => {
  beforeEach(() => {
    useOnboarding.getState().resetInspection();
  });

  it("garde le verdict tel que l'agent le renvoie", async () => {
    stubPupitre({
      inspect: async () => ({ ok: true, result: { verdict: "occupied", reasons: ["Docker"], fixes: [] } }),
    });

    await useOnboarding.getState().inspect("srv-1");

    expect(useOnboarding.getState().inspection).toMatchObject({
      status: "done",
      probe: { verdict: "occupied", reasons: ["Docker"] },
    });
  });

  it("garde le remède de l'agent en cas d'échec", async () => {
    stubPupitre({
      inspect: async () => ({
        ok: false,
        error: { code: "ssh_unreachable", message: "Connexion refusée.", fix: "Vérifiez le port 22." },
      }),
    });

    await useOnboarding.getState().inspect("srv-1");

    expect(useOnboarding.getState().inspection).toMatchObject({
      status: "failed",
      error: { fix: "Vérifiez le port 22." },
    });
  });
});
```

`stubPupitre` (`src/renderer/src/__tests__/stub-pupitre.ts`) pose un `window.pupitre` partiel pour la durée du test ; les stores ne sont jamais testés contre un vrai agent.

### Scénario Playwright — `e2e/onboarding-inspection.spec.ts`

```ts
import { _electron as electron, expect, test } from "@playwright/test";

test("un serveur nu propose l'installation", async () => {
  const app = await electron.launch({ args: ["out/main/index.js"] });
  const page = await app.firstWindow();

  await page.getByRole("button", { name: "Ajouter un serveur" }).click();
  await page.getByLabel("Adresse").fill(process.env.PUPITRE_STAGING_HOST ?? "");
  await page.getByRole("button", { name: "Inspecter" }).click();

  await expect(page.getByRole("heading", { name: "Serveur nu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Installer" })).toBeVisible();

  await app.close();
});
```

Le scénario tourne contre le staging réinstallé (`bun --cwd=apps/agent run staging:reset`), jamais contre une machine du propriétaire. `bun run test:e2e` le lance après `bun run build`. Un écran a au moins un scénario par verdict ou par état terminal ; les états d'attente sont couverts par les tests de store.

## Avant de passer la tâche en « en revue »

1. La commande et le type viennent de `@pupitre/shared/agent-protocol` ; rien n'est redéclaré dans `src/shared/`.
2. Le renderer n'envoie que des identifiants ; le main les valide contre ce que l'agent a donné.
3. Le store garde l'enveloppe du protocole ; `fix` arrive à l'écran tel quel.
4. Aucune couleur en dur, aucun composant hors `components/ui/` qui réinvente une primitive, un composant par fichier, points-virgules.
5. Chaque attente dit ce qui se passe, chaque erreur dit le remède, chaque état se distingue par sa forme.
6. Tests : main sur une transcription, store sur `stubPupitre`, Playwright sur le staging. Assertions dans `it()`, pas de `.only`.
7. `bun --cwd=apps/desktop run lint`, `check:types`, `test` verts ; `test:e2e` vert quand le staging est disponible.
