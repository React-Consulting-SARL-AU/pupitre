import { describe, expect, it } from "bun:test";
import type { AccountDevice, AccountState } from "@shared/account";
import { CONNECTION_KINDS } from "@shared/connections";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BRANCHES,
  GIT_STATUS,
  PROCESSES,
  SNAPSHOT,
  WORKING_TREE,
} from "../../__tests__/snapshot-fixtures";
import { translator } from "../../i18n/i18n";
import { hardenAction } from "../../lib/harden-action";
import { AccountDeviceList } from "../account/account-device-list";
import { AccountIdentityCard } from "../account/account-identity-card";
import { AccountUsageNotice } from "../account/account-usage-notice";
import { ActivityProcesses } from "../activity/activity-processes";
import { ActivitySessions } from "../activity/activity-sessions";
import { ConnectionAccountChoice } from "../connections/connection-account-choice";
import { ConnectionCard } from "../connections/connection-card";
import {
  ConnectionConnected,
  forgetQuestion,
} from "../connections/connection-connected";
import { CONNECTIONS } from "../connections/connection-descriptors";
import { ConnectionHealthLine } from "../connections/connection-health-line";
import { OnboardingHardenFailed } from "../onboarding/onboarding-harden-failed";
import { OnboardingRail } from "../onboarding/onboarding-rail";
import { newBranchProblem } from "../projects/project-branch-create";
import { ProjectBranches } from "../projects/project-branches";
import {
  drawnOrder,
  ProjectDiffFiles,
  pathAfterKey,
} from "../projects/project-diff-files";
import { ProjectEnv } from "../projects/project-env";
import { ProjectGitState } from "../projects/project-git-state";
import { matchingLines } from "../projects/project-logs";
import { portOf, ServerAddForm } from "../servers/server-add-form";
import { grantStatusLabel } from "../servers/server-grant-detail";

/**
 * The screens of the seventh phase, rendered from the same fixtures as the
 * rest: what each one says, and the gesture each one puts where it belongs.
 */

const NOOP = () => undefined;

const RESOLVED = () => Promise.resolve();

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("le fichier d'environnement d'un projet", () => {
  it("liste les clés, jamais une valeur, et offre de régénérer", () => {
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys: ["DATABASE_URL", "AUTH_SECRET"],
            path: "/home/dev/projects/flymate/.env.local",
            written: false,
          },
          status: "read",
        }}
      />
    );

    expect(html).toContain("DATABASE_URL");
    expect(html).toContain("AUTH_SECRET");
    expect(html).toContain('data-env-keys="2"');
    expect(text(html)).toContain("Régénérer");
    expect(text(html)).not.toContain("écrit");
  });

  it("résume un long fichier à ses premières clés et offre de tout afficher", () => {
    const keys = ["A_KEY", "B_KEY", "C_KEY", "D_KEY", "E_KEY", "F_KEY"];
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys,
            path: "/home/dev/projects/flymate/.env.local",
            written: false,
          },
          status: "read",
        }}
      />
    );

    expect(html).toContain('data-env-keys="6"');
    expect(html).toContain('data-env-expanded="false"');
    expect(text(html)).toContain("6 clés");
    expect(html).toContain("D_KEY");
    expect(html).not.toContain("E_KEY");
    expect(text(html)).toContain("+2");
    expect(text(html)).toContain("Tout afficher");
  });

  it("montre un court fichier en entier, sans rien à déplier", () => {
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys: ["DATABASE_URL", "AUTH_SECRET"],
            path: "/home/dev/projects/flymate/.env.local",
            written: false,
          },
          status: "read",
        }}
      />
    );

    expect(html).not.toContain("data-env-expanded");
    expect(text(html)).not.toContain("Tout afficher");
  });

  it("dit le refus de l'agent avec son remède et un nouvel essai", () => {
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          error: {
            code: "bad_request",
            fix: "Ajoutez un .env.example",
            message: "aucun modele",
          },
          status: "failed",
        }}
      />
    );

    expect(text(html)).toContain("aucun modele");
    expect(text(html)).toContain("Ajoutez un .env.example");
    expect(text(html)).toContain("Réessayer");
  });
});

describe("le changement de branche", () => {
  it("ne change rien tant qu'un bouton n'a pas été pressé", () => {
    const html = renderToStaticMarkup(
      <ProjectBranches
        folder="/home/dev/projects/flymate"
        onCheckout={NOOP}
        state={{ branches: { ...BRANCHES, dirty: true }, status: "read" }}
        switching={false}
      />
    );

    expect(html).toContain("<select");
    expect(text(html)).not.toContain("Changer ");
    expect(text(html)).toContain("changement de branche sera refusé");
  });

  it("sépare les branches locales des distantes pas encore prises, et offre d'en créer une", () => {
    const html = renderToStaticMarkup(
      <ProjectBranches
        folder="/home/dev/projects/flymate"
        onCheckout={NOOP}
        state={{ branches: { ...BRANCHES, dirty: false }, status: "read" }}
        switching={false}
      />
    );

    expect(html).toContain('<optgroup label="Locales">');
    expect(html).toContain('<optgroup label="Distantes">');
    expect(html.match(/<option/g)).toHaveLength(3);
    expect(html).toContain('value="release"');
    expect(text(html)).toContain("Nouvelle branche");
    expect(text(html)).toContain("1 distante pas encore prise");
  });

  it("refuse avant l'agent un nom que git refuserait, ou qui existe déjà", () => {
    expect(newBranchProblem("feat/tarifs", BRANCHES)).toBe("exists");
    expect(newBranchProblem("release", BRANCHES)).toBe("exists");
    expect(newBranchProblem("-force", BRANCHES)).toBe("invalid");
    expect(newBranchProblem("feat/prix v2", BRANCHES)).toBe("invalid");
    expect(newBranchProblem("feat/prix-v2", BRANCHES)).toBeNull();
  });
});

describe("l'écart avec le dépôt distant", () => {
  it("offre de tirer quand il y a des commits à récupérer, en disant ce que ça fait", () => {
    const html = renderToStaticMarkup(
      <ProjectGitState
        onCheck={NOOP}
        onPull={NOOP}
        state={{ at: Date.now(), git: GIT_STATUS, status: "read" }}
      />
    );

    expect(text(html)).toContain("Tirer et réinstaller");
    expect(html).toContain("git pull puis réinstallation");
  });

  it("ne l'offre pas quand tout est à jour", () => {
    const html = renderToStaticMarkup(
      <ProjectGitState
        onCheck={NOOP}
        onPull={NOOP}
        state={{
          at: Date.now(),
          git: { ...GIT_STATUS, behind: 0 },
          status: "read",
        }}
      />
    );

    expect(text(html)).not.toContain("Tirer");
  });
});

describe("le journal", () => {
  it("garde les lignes qui portent le terme, majuscules à part", () => {
    const lines = [
      { id: 1, text: "Listening on :3000" },
      { id: 2, text: "error: boom" },
      { id: 3, text: "ERROR again" },
    ];

    expect(matchingLines(lines, "error").map((line) => line.id)).toEqual([
      2, 3,
    ]);
    expect(matchingLines(lines, "  ")).toBe(lines);
  });
});

describe("la liste des fichiers du diff", () => {
  it("se parcourt au clavier dans l'ordre dessiné", () => {
    const order = drawnOrder(WORKING_TREE.files);

    expect(order.length).toBe(WORKING_TREE.files.length);
    expect(pathAfterKey("ArrowDown", order, null)).toBe(order[0]);
    expect(pathAfterKey("j", order, order[0] ?? null)).toBe(order[1]);
    expect(pathAfterKey("k", order, order[0] ?? null)).toBe(order[0]);
    expect(pathAfterKey("ArrowUp", order, null)).toBe(order.at(-1) ?? null);
    expect(pathAfterKey("Enter", order, order[0] ?? null)).toBeNull();
  });

  it("se présente comme une liste, chaque fichier comme une option", () => {
    const html = renderToStaticMarkup(
      <ProjectDiffFiles
        files={WORKING_TREE.files}
        onSelect={NOOP}
        selected={WORKING_TREE.files[0]?.path ?? null}
      />
    );

    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="true"');
  });
});

describe("le formulaire d'ajout d'un serveur", () => {
  it("est un vrai formulaire", () => {
    const html = renderToStaticMarkup(
      <ServerAddForm busy={false} error={null} onSubmit={NOOP} />
    );

    expect(html).toContain("<form");
    expect(html).toContain("noValidate");
  });

  it("ne lit un port que comme un nombre entier entre 1 et 65535", () => {
    expect(portOf("22")).toBe(22);
    expect(portOf(" 2222 ")).toBe(2222);
    expect(portOf("22abc")).toBeNull();
    expect(portOf("")).toBeNull();
    expect(portOf("0")).toBeNull();
    expect(portOf("70000")).toBeNull();
    expect(portOf("2.5")).toBeNull();
  });
});

describe("un compte tiers connecté", () => {
  const github = CONNECTIONS.find((one) => one.kind === "github");

  if (!github) {
    throw new Error("the descriptors name no GitHub account");
  }

  it("demande avant d'oublier, en nommant ce que ça emporte", () => {
    const html = renderToStaticMarkup(
      <ConnectionConnected
        busy={false}
        connection={github}
        health={undefined}
        onForget={RESOLVED}
        onVerify={RESOLVED}
        scope={{ known: true, modules: ["tool.github"] }}
        serverName="atelier"
        state={{
          account: { id: "42", name: "ada" },
          sealed: true,
          status: "connected",
        }}
      />
    );

    expect(text(html)).toContain("Connecté en tant que ada");
    expect(text(html)).toContain("Vérifier");
    expect(text(html)).toContain("Déconnecter");
  });

  it("décrit chaque connexion que le contrat nomme, et aucune autre", () => {
    expect(CONNECTIONS.map((one) => one.kind).sort()).toEqual(
      [...CONNECTION_KINDS].sort()
    );
  });

  /** Two tokens of one account, because only one of them goes to the server. */
  it("sépare le jeton du tunnel, qui reste ici, de celui de Wrangler, qui part", () => {
    const t = translator("fr");
    const [tunnel, wrangler] = CONNECTIONS.filter((one) =>
      ["cloudflare", "wrangler"].includes(one.kind)
    ).map((connection) => ({
      card: text(
        renderToStaticMarkup(<ConnectionCard connection={connection} />)
      ),
      hint: t(connection.hint),
    }));

    expect(tunnel?.card).toContain("n'atteint jamais le serveur");
    expect(tunnel?.hint).toContain("Cloudflare Tunnel · Edit");
    expect(tunnel?.hint).not.toContain("Workers Scripts");
    expect(wrangler?.card).toContain("part sur le serveur");
    expect(wrangler?.hint).toContain("Workers Scripts · Edit");
    expect(wrangler?.hint).toContain("Aucune permission Tunnel ni DNS");
  });

  /** Several accounts is a question the reader answers, never the first the provider listed. */
  it("fait choisir le compte quand le jeton en ouvre plusieurs", () => {
    const html = renderToStaticMarkup(
      <ConnectionAccountChoice
        accounts={[
          { id: "acc-1", name: "Flymate" },
          { id: "acc-2", name: "Atelier" },
        ]}
        chosen="acc-2"
        kind="wrangler"
        onChoose={NOOP}
      />
    );

    expect(text(html)).toContain("Ce jeton ouvre plusieurs comptes");
    expect(text(html)).toContain("Flymate");
    expect(text(html)).toContain("Atelier");
    expect(html).toContain('data-account-option="acc-1"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('checked="" value="acc-2"');
  });

  it("nomme ce que l'oubli emporte, ou dit qu'il ne le sait pas", () => {
    const t = translator("fr");

    expect(
      forgetQuestion(t, { known: true, modules: ["tool.github"] }, "atelier")
    ).toContain("Sur atelier, tool.github l'utilisent");
    expect(
      forgetQuestion(t, { known: true, modules: [] }, "atelier")
    ).toContain("Aucun service installé sur atelier");
    expect(
      forgetQuestion(t, { known: false, modules: [] }, "atelier")
    ).toContain("chaque serveur qui a besoin");
  });

  it("dit ce que le fournisseur a répondu", () => {
    const answered = renderToStaticMarkup(
      <ConnectionHealthLine
        health={{ account: "ada", at: Date.now(), status: "answered" }}
      />
    );
    const refused = renderToStaticMarkup(
      <ConnectionHealthLine
        health={{
          error: {
            code: "bad_request",
            message: "refusal.connection.revoked",
            phrase: {
              id: "refusal.connection.revoked",
              values: { kind: "github", reason: "Bad credentials" },
            },
          },
          status: "refused",
        }}
      />
    );

    expect(text(answered)).toContain("répond comme ada");
    expect(text(refused)).toContain("ne répond plus à ce jeton");
    expect(text(refused)).toContain("Créez un nouveau jeton");
  });
});

describe("le rail de l'assistant", () => {
  it("compte les étapes qu'on lui donne, pas les huit", () => {
    const html = renderToStaticMarkup(
      <OnboardingRail
        serverName="atelier"
        step="catalog"
        steps={[
          "server",
          "inspection",
          "catalog",
          "config",
          "install",
          "harden",
          "done",
        ]}
      />
    );

    expect(text(html)).toContain("Étape 3 sur 7");
    expect(html).not.toContain('data-step="agent"');
  });
});

describe("un durcissement qui a échoué", () => {
  it("dit que la machine reste utilisable, à côté du nouvel essai", () => {
    const html = renderToStaticMarkup(
      <OnboardingHardenFailed
        error={{ code: "disconnected", message: "canal tombe" }}
        onRetry={NOOP}
      />
    );

    expect(text(html)).toContain("canal tombe");
    expect(text(html)).toContain("Réessayer");
    expect(text(html)).toContain("root");
  });

  it("ouvre la sortie sur la barre de l'étape, et seulement quand l'agent a fini", () => {
    expect(
      hardenAction({
        error: { code: "disconnected", message: "canal tombe" },
        serverId: "srv-1",
        status: "failed",
      })
    ).toMatchObject({
      enabled: true,
      label: "onboarding.harden.continueOpen",
    });
    expect(
      hardenAction({ serverId: "srv-1", status: "running" })
    ).toMatchObject({ enabled: false, note: "onboarding.harden.runningTitle" });
  });
});

describe("l'état d'un serveur attribué", () => {
  it("se dit dans la langue du lecteur, et tel quel quand il est inconnu", () => {
    const t = translator("fr");

    expect(grantStatusLabel(t, "active")).toBe("actif");
    expect(grantStatusLabel(t, "grace")).toBe("en tolérance");
    expect(grantStatusLabel(t, "weird")).toBe("weird");
  });
});

describe("les processus", () => {
  it("forcent l'arrêt d'un processus qui a survécu au premier", () => {
    const first = PROCESSES[0];
    const html = renderToStaticMarkup(
      <ActivityProcesses
        lingering={first ? [first.pid] : []}
        onStop={NOOP}
        processes={PROCESSES}
      />
    );

    expect(text(html)).toContain("Forcer l'arrêt");
    expect(text(html)).toContain("Arrêter");
  });

  it("disent qu'une lecture a échoué plutôt que de figer la table", () => {
    const html = renderToStaticMarkup(
      <ActivityProcesses
        onRetry={NOOP}
        onStop={NOOP}
        problem={{ code: "timeout", message: "trop long", fix: "Réessayez" }}
        processes={PROCESSES}
      />
    );

    expect(html).toContain('data-processes="failed"');
    expect(text(html)).toContain("trop long");
    expect(text(html)).toContain("Réessayer");
  });
});

describe("les sessions", () => {
  it("offrent de rattacher un agent orphelin, pas un agent déjà ouvert", () => {
    const orphan = renderToStaticMarkup(
      <ActivitySessions
        attached={[]}
        onClean={NOOP}
        onReattach={NOOP}
        onStop={NOOP}
        sessions={SNAPSHOT.sessions}
      />
    );
    const attached = renderToStaticMarkup(
      <ActivitySessions
        attached={["claude:flymate-api"]}
        onClean={NOOP}
        onReattach={NOOP}
        onStop={NOOP}
        sessions={SNAPSHOT.sessions.filter(
          (session) => session.kind === "claude"
        )}
      />
    );

    expect(text(orphan)).toContain("Rattacher");
    expect(text(attached)).not.toContain("Rattacher");
  });
});

const DEVICE: AccountDevice = {
  fingerprint: "SHA256:mac",
  id: "device-1",
  name: "MacBook d'Ada",
  publicKey: "ssh-ed25519 AAAA",
};

const SIGNED_IN: AccountState = {
  build: "production",
  checkedAt: new Date().toISOString(),
  consoleUrl: "https://app.pupitre.test/dashboard",
  device: DEVICE,
  identity: {
    email: "ada@pupitre.studio",
    entitlement: "valid",
    name: "Ada Lovelace",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
    ],
    role: "owner",
    subscription: null,
  },
  refusal: null,
  sealed: true,
  usage: {
    entitlement: "valid",
    source: "platform",
    status: "granted",
    validUntil: "2026-09-11T10:00:00.000Z",
  },
};

describe("le compte", () => {
  it("rend le bouton vers la console sur un droit refusé", () => {
    const suspended = renderToStaticMarkup(
      <AccountUsageNotice
        checkedAt={null}
        onOpenConsole={NOOP}
        usage={{ consoleUrl: "https://app.pupitre.test", status: "suspended" }}
      />
    );
    const granted = renderToStaticMarkup(
      <AccountUsageNotice
        checkedAt={SIGNED_IN.checkedAt}
        onOpenConsole={NOOP}
        usage={SIGNED_IN.usage}
      />
    );

    expect(text(suspended)).toContain("Gérer l'abonnement");
    expect(text(granted)).not.toContain("console");
  });

  it("demande avant de se déconnecter, en disant que les terminaux se ferment", () => {
    const html = renderToStaticMarkup(
      <AccountIdentityCard
        account={SIGNED_IN}
        onDisconnect={NOOP}
        onRefresh={NOOP}
      />
    );

    expect(text(html)).toContain("Se déconnecter");
    expect(html).not.toContain("terminal ouvert");
  });

  it("liste les appareils, et ne laisse pas cet ordinateur se révoquer", () => {
    const html = renderToStaticMarkup(
      <AccountDeviceList
        current={DEVICE}
        devices={[
          DEVICE,
          { ...DEVICE, id: "device-2", name: "Vieux portable" },
        ]}
        onRevoke={RESOLVED}
        revoking={null}
      />
    );

    expect(html).toContain('data-device="device-1"');
    expect(html).toContain('data-device="device-2"');
    expect(text(html)).toContain("cet ordinateur");
    expect(text(html)).toContain("Vieux portable");
    expect((text(html).match(/Révoquer/g) ?? []).length).toBe(1);
  });
});
