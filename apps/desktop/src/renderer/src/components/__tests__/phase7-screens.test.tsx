import { describe, expect, it } from "bun:test";
import type { AccountDevice, AccountState } from "@shared/account";
import { CONNECTION_KINDS } from "@shared/connections";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, optionsOf } from "../../__tests__/dom";
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
import { portOf, ServerAddForm } from "../servers/server-add-form";
import { grantStatusLabel } from "../servers/server-grant-detail";

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

describe("a project's environment file", () => {
  it("lists the keys, never a value, and offers to regenerate", () => {
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys: ["DATABASE_URL", "AUTH_SECRET"],
            path: "/home/dev/projects/flyleaf/.env.local",
            template: true,
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

  it("summarizes a long file to its first keys and offers to show everything", () => {
    const keys = ["A_KEY", "B_KEY", "C_KEY", "D_KEY", "E_KEY", "F_KEY"];
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys,
            path: "/home/dev/projects/flyleaf/.env.local",
            template: true,
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

  it("shows a short file in full, with nothing to unfold", () => {
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys: ["DATABASE_URL", "AUTH_SECRET"],
            path: "/home/dev/projects/flyleaf/.env.local",
            template: true,
            written: false,
          },
          status: "read",
        }}
      />
    );

    expect(html).not.toContain("data-env-expanded");
    expect(text(html)).not.toContain("Tout afficher");
  });

  it("states the agent's refusal with its fix and a retry", () => {
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
    expect(html).not.toContain("elevation-raised");
  });

  it("calmly says that a project without a template has no environment", () => {
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys: [],
            path: "/home/dev/projects/intranet/.env.local",
            template: false,
            written: false,
          },
          status: "read",
        }}
      />
    );

    expect(html).toContain('data-env="none"');
    expect(text(html)).toContain("Pas de fichier d'environnement");
    expect(text(html)).toContain("/home/dev/projects/intranet");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("text-danger");
    expect(text(html)).not.toContain("Réessayer");
    expect(text(html)).not.toContain("Régénérer");
    expect(text(html)).not.toContain("aucune clé");
  });

  it("reads a hand-written file without offering to regenerate it", () => {
    const html = renderToStaticMarkup(
      <ProjectEnv
        onRead={NOOP}
        onRegenerate={RESOLVED}
        state={{
          env: {
            keys: ["PORT"],
            path: "/home/dev/projects/intranet/.env.local",
            template: false,
            written: false,
          },
          status: "read",
        }}
      />
    );

    expect(html).toContain("PORT");
    expect(text(html)).not.toContain("Régénérer");
  });
});

describe("the branch switch", () => {
  it("changes nothing until a button has been pressed", () => {
    const html = renderToStaticMarkup(
      <ProjectBranches
        folder="/home/dev/projects/flyleaf"
        onCheckout={RESOLVED}
        state={{ branches: { ...BRANCHES, dirty: true }, status: "read" }}
        switching={false}
      />
    );

    expect(html).toContain('role="combobox"');
    expect(text(html)).not.toContain("Changer ");
    expect(text(html)).toContain("changer de branche sera refusé");
  });

  it("separates local branches from remote ones not yet taken, and offers to create one", async () => {
    const view = await mount(
      <ProjectBranches
        folder="/home/dev/projects/flyleaf"
        onCheckout={RESOLVED}
        state={{ branches: { ...BRANCHES, dirty: false }, status: "read" }}
        switching={false}
      />
    );

    expect(view.text()).toContain("Nouvelle branche");
    expect(view.text()).toContain("1 distante pas encore prise");

    const listed = await optionsOf(
      view,
      document.querySelector("#project-branch")
    );

    expect(listed.options).toEqual(["main", "feat/tarifs", "release"]);
    expect(listed.groups).toEqual(["Locales", "Distantes"]);

    view.unmount();
  });

  it("refuses, before the agent, a name git would refuse or that already exists", () => {
    expect(newBranchProblem("feat/tarifs", BRANCHES)).toBe("exists");
    expect(newBranchProblem("release", BRANCHES)).toBe("exists");
    expect(newBranchProblem("-force", BRANCHES)).toBe("invalid");
    expect(newBranchProblem("feat/prix v2", BRANCHES)).toBe("invalid");
    expect(newBranchProblem("feat/prix-v2", BRANCHES)).toBeNull();
  });
});

describe("the gap with the remote repository", () => {
  it("offers to pull when there are commits to fetch, saying what it does", () => {
    const html = renderToStaticMarkup(
      <ProjectGitState
        onCheck={NOOP}
        onPull={NOOP}
        state={{ at: Date.now(), git: GIT_STATUS, status: "read" }}
      />
    );

    expect(text(html)).toContain("Pull et réinstaller");
  });

  it("does not offer it when everything is up to date", () => {
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

    expect(text(html)).not.toContain("Pull et réinstaller");
  });
});

describe("the diff file list", () => {
  it("is walked by keyboard in the drawn order", () => {
    const order = drawnOrder(WORKING_TREE.files);

    expect(order.length).toBe(WORKING_TREE.files.length);
    expect(pathAfterKey("ArrowDown", order, null)).toBe(order[0]);
    expect(pathAfterKey("j", order, order[0] ?? null)).toBe(order[1]);
    expect(pathAfterKey("k", order, order[0] ?? null)).toBe(order[0]);
    expect(pathAfterKey("ArrowUp", order, null)).toBe(order.at(-1) ?? null);
    expect(pathAfterKey("Enter", order, order[0] ?? null)).toBeNull();
  });

  it("presents itself as a list, each file as an option", () => {
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

describe("the add-server form", () => {
  it("is a real form", () => {
    const html = renderToStaticMarkup(
      <ServerAddForm busy={false} error={null} onSubmit={NOOP} />
    );

    expect(html).toContain("<form");
    expect(html).toContain("noValidate");
  });

  it("asks for an SSH name next to the name", () => {
    const html = renderToStaticMarkup(
      <ServerAddForm busy={false} error={null} onSubmit={NOOP} />
    );

    expect(text(html)).toContain("Nom SSH");
  });

  it("reads a port only as a whole number between 1 and 65535", () => {
    expect(portOf("22")).toBe(22);
    expect(portOf(" 2222 ")).toBe(2222);
    expect(portOf("22abc")).toBeNull();
    expect(portOf("")).toBeNull();
    expect(portOf("0")).toBeNull();
    expect(portOf("70000")).toBeNull();
    expect(portOf("2.5")).toBeNull();
  });
});

describe("a connected third-party account", () => {
  const github = CONNECTIONS.find((one) => one.kind === "github");

  if (!github) {
    throw new Error("the descriptors name no GitHub account");
  }

  it("asks before forgetting, naming what it takes away", () => {
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

  it("describes each connection the contract names, and no other", () => {
    expect(CONNECTIONS.map((one) => one.kind).sort()).toEqual(
      [...CONNECTION_KINDS].sort()
    );
  });

  it("separates the tunnel token, which stays here, from Wrangler's, which leaves", () => {
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

  // Never default to the first account the provider lists.
  it("makes the reader choose the account when the token opens several", () => {
    const html = renderToStaticMarkup(
      <ConnectionAccountChoice
        accounts={[
          { id: "acc-1", name: "Flyleaf" },
          { id: "acc-2", name: "Atelier" },
        ]}
        chosen="acc-2"
        kind="wrangler"
        onChoose={NOOP}
      />
    );

    expect(text(html)).toContain("Ce token ouvre plusieurs comptes");
    expect(text(html)).toContain("Flyleaf");
    expect(text(html)).toContain("Atelier");
    expect(html).toContain('data-account-option="acc-1"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).toMatch(
      /data-account-option="acc-2"[^>]*>[^!]*?data-checked=""[^>]*role="radio"/
    );
  });

  it("names what forgetting takes away, or says it does not know", () => {
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

  it("says what the provider answered", () => {
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
    expect(text(refused)).toContain("ne répond plus à ce token");
    expect(text(refused)).toContain("Créez un nouveau token");
  });
});

describe("the wizard rail", () => {
  it("counts the steps it is given, not the eight", () => {
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

describe("a hardening that failed", () => {
  it("says the machine remains usable, next to the retry", () => {
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

  it("opens the output on the step bar, and only when the agent has finished", () => {
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

describe("an assigned server's state", () => {
  it("is stated in the reader's language, and as is when unknown", () => {
    const t = translator("fr");

    expect(grantStatusLabel(t, "active")).toBe("actif");
    expect(grantStatusLabel(t, "grace")).toBe("en tolérance");
    expect(grantStatusLabel(t, "weird")).toBe("weird");
  });
});

describe("processes", () => {
  it("force the stop of a process that survived the first one", () => {
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

  it("say a read failed rather than freezing the table", () => {
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

describe("sessions", () => {
  it("offer to reattach an orphaned agent, not an already open one", () => {
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
        attached={["claude:flyleaf-api"]}
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
    license: "valid",
    licenseGrant: null,
    name: "Ada Lovelace",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
    ],
    role: "owner",
    servers: { limit: 3, used: 1 },
  },
  refusal: null,
  sealed: true,
  usage: {
    license: "valid",
    source: "platform",
    status: "granted",
    validUntil: "2026-09-11T10:00:00.000Z",
  },
};

describe("the account", () => {
  it("renders the button to the console on a denied right", () => {
    const suspended = renderToStaticMarkup(
      <AccountUsageNotice
        checkedAt={null}
        onOpenConsole={NOOP}
        usage={{ consoleUrl: "https://app.pupitre.test", status: "absent" }}
      />
    );
    const granted = renderToStaticMarkup(
      <AccountUsageNotice
        checkedAt={SIGNED_IN.checkedAt}
        onOpenConsole={NOOP}
        usage={SIGNED_IN.usage}
      />
    );

    expect(text(suspended)).toContain("Ouvrir la console");
    expect(text(granted)).not.toContain("console");
  });

  it("asks before signing out, saying the terminals close", () => {
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

  it("lists the devices, and does not let this computer revoke itself", () => {
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
