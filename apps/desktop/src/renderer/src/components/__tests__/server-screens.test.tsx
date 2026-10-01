import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { HelloResult } from "@pupitre/shared/agent-protocol/session";
import type { AccountIdentity } from "@shared/account";
import type { Server, ServerReach } from "@shared/servers";
import { Trash2 } from "lucide-react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, waitUntil } from "../../__tests__/dom";
import { BARE, MANAGED } from "../../__tests__/probe-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useChannel } from "../../stores/channel";
import { useInspection } from "../../stores/inspection";
import { useOnboarding } from "../../stores/onboarding";
import { OnboardingEntry } from "../onboarding/onboarding-entry";
import { OnboardingOrganizationNote } from "../onboarding/onboarding-organization-note";
import { OnboardingServerChoice } from "../onboarding/onboarding-server-choice";
import { serverStage } from "../onboarding/onboarding-server-screen";
import { ServerReachNotice } from "../servers/server-reach-notice";
import { ServerRow } from "../servers/server-row";
import { Button } from "../ui/button";
import { WaitingNotice } from "../ui/waiting-notice";

const NOOP = () => undefined;

const SERVER: Server = {
  host: "203.0.113.10",
  hostFingerprint: "SHA256:atelier",
  id: "srv-1",
  keyPath: "/keys/srv-1",
  name: "atelier",
  origin: "app",
  port: 22,
  user: "root",
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("le test d'une adresse", () => {
  const notice = (reach: ServerReach): string =>
    renderToStaticMarkup(<ServerReachNotice reach={reach} />);

  it("distingue une adresse qui répond d'une qui refuse, par la forme", () => {
    const answered = notice({
      access: { access: "opens" },
      ms: 42,
      reached: true,
      software: "OpenSSH_9.6",
    });
    const refused = notice({
      code: "refused",
      phrase: {
        id: "refusal.reach.refused",
        values: { host: "203.0.113.10", port: 22 },
      },
      reached: false,
    });

    expect(answered).toContain('data-shape="filled"');
    expect(refused).toContain('data-shape="struck"');
  });

  it("nomme le logiciel qui a répondu et le temps qu'il a mis", () => {
    const html = notice({
      access: { access: "opens" },
      ms: 42,
      reached: true,
      software: "OpenSSH_9.6",
    });

    expect(text(html)).toContain("OpenSSH_9.6 a répondu en 42 ms");
  });

  it("dit ce qui ouvrira le compte, par la forme et par la phrase", () => {
    const answered = (access: ServerReach & { reached: true }) =>
      notice(access);
    const opens = answered({
      access: { access: "opens" },
      ms: 42,
      reached: true,
      software: "OpenSSH_9.6",
    });
    const password = answered({
      access: { access: "password" },
      ms: 42,
      reached: true,
      software: "OpenSSH_9.6",
    });
    const manual = answered({
      access: {
        access: "manual",
        phrase: { id: "refusal.keyInstall.keysOnly" },
      },
      ms: 42,
      reached: true,
      software: "OpenSSH_9.6",
    });

    expect(opens).toContain('data-access="opens"');
    expect(text(opens)).toContain("rien à taper");
    expect(password).toContain('data-access="password"');
    expect(text(password)).toContain("demande son mot de passe");
    expect(manual).toContain('data-shape="empty"');
    expect(text(manual)).toContain("n'accepte que des clés");
    expect(text(manual)).toContain("peut quand même être ajouté");
  });

  it("rend le refus et son remède tels que le processus principal les a dits", () => {
    const html = notice({
      code: "not-ssh",
      phrase: {
        id: "refusal.reach.wrongPort",
        values: { host: "203.0.113.10", port: 80 },
      },
      reached: false,
    });

    expect(text(html)).toContain("ce n'est pas un accès SSH");
    expect(text(html)).toContain("c'est en général 22");
    expect(html).toContain('data-reach="not-ssh"');
  });
});

describe("la suppression d'un serveur", () => {
  const row = (): string =>
    renderToStaticMarkup(
      <ServerRow
        active={false}
        onActivate={NOOP}
        onForget={NOOP}
        onRemove={NOOP}
        onRename={NOOP}
        server={SERVER}
      />
    );

  it("ne montre rien de destructeur tant qu'on n'a pas demandé", () => {
    expect(text(row())).not.toContain("Supprimer définitivement");
  });

  it("offre la corbeille sur chaque ligne", () => {
    expect(row()).toContain('aria-label="Supprimer atelier"');
  });
});

describe("le bouton d'un geste irréversible", () => {
  it("se peint en plein plutôt que de se contenter d'un contour", () => {
    const html = renderToStaticMarkup(
      <Button variant="destructive">Supprimer définitivement</Button>
    );

    expect(html).toContain("bg-danger");
    expect(html).toContain("text-base");
  });

  it("laisse le contour au bouton qui ne fait qu'ouvrir la question", () => {
    const html = renderToStaticMarkup(
      <Button variant="danger">Supprimer</Button>
    );

    expect(html).not.toContain("bg-danger");
  });
});

describe("un bouton qui travaille", () => {
  const working = (): string =>
    renderToStaticMarkup(
      <Button icon={Trash2} loading variant="destructive">
        Supprimer définitivement
      </Button>
    );

  it("tourne à la place de son icône, donc à gauche du libellé", () => {
    const html = working();

    expect(html).toContain('data-spinner="true"');
    expect(html).not.toContain("lucide-trash");
    expect(html.indexOf("data-spinner")).toBeLessThan(
      html.indexOf("Supprimer")
    );
  });

  it("ne prend pas un second clic, et le dit à qui lit à voix haute", () => {
    const html = working();

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("garde son encre : une attente n'est pas un bouton éteint", () => {
    expect(working()).not.toContain("opacity-40");
    expect(renderToStaticMarkup(<Button disabled>Supprimer</Button>)).toContain(
      "opacity-40"
    );
  });
});

describe("une attente en plusieurs étapes", () => {
  const notice = (): string =>
    renderToStaticMarkup(
      <WaitingNotice
        detail="L'app pose la clé elle-même."
        phases={[
          { id: "reaching", label: "On frappe avec la clé", state: "done" },
          {
            id: "authorizing",
            label: "On l'écrit dans authorized_keys",
            state: "running",
          },
          {
            id: "verifying",
            label: "On se connecte avec elle seule",
            state: "ahead",
          },
        ]}
        title="Installation de la clé"
      />
    );

  it("dit où elle en est par la forme, pas par la couleur", () => {
    const html = notice();

    expect(html).toContain('data-state="done"');
    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-state="running"');
    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('data-state="ahead"');
    expect(html).toContain('data-shape="empty"');
  });

  it("nomme l'étape en cours pour ce qui lit à voix haute", () => {
    expect(notice()).toContain('aria-current="step"');
    expect(text(notice())).toContain("On l'écrit dans authorized_keys");
  });

  it("reste une attente quand aucune étape n'est nommée", () => {
    const html = renderToStaticMarkup(
      <WaitingNotice detail="Ports, utilisateurs" title="Inspection" />
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("data-phase");
  });
});

describe("le choix d'une machine dans l'assistant", () => {
  const choice = (server: Server): string =>
    renderToStaticMarkup(
      <OnboardingServerChoice onPick={NOOP} server={server} />
    );

  it("fait de la carte entière le bouton, pour n'avoir rien à viser", () => {
    const html = choice(SERVER);

    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('data-server="srv-1"');
  });

  it("dit l'adresse et à qui appartient la configuration", () => {
    expect(text(choice(SERVER))).toContain(
      "root@203.0.113.10:22 · écrite par l'app"
    );
  });

  it("nomme un hôte du système par son alias, sans compte ni port", () => {
    const html = choice({
      host: "atelier",
      id: "srv-2",
      name: "Atelier",
      origin: "system",
      port: 22,
      user: "",
    });

    expect(text(html)).toContain("atelier · votre ~/.ssh/config");
  });
});

describe("l'étape que l'assistant ouvre", () => {
  it("attend d'avoir lu la liste avant de montrer quoi que ce soit", () => {
    expect(serverStage(null, "loading", 0)).toBeNull();
  });

  it("ouvre le formulaire quand cet ordinateur ne connaît aucune machine", () => {
    expect(serverStage(null, "ready", 0)).toBe("add");
  });

  it("propose de choisir dès qu'il en connaît une", () => {
    expect(serverStage(null, "ready", 1)).toBe("pick");
  });

  it("respecte l'étape qu'on a demandée", () => {
    expect(serverStage("add", "ready", 3)).toBe("add");
    expect(serverStage("pick", "ready", 0)).toBe("pick");
  });
});

describe("l'organisation de l'enrôlement", () => {
  const identity: AccountIdentity = {
    email: "ada@pupitre.studio",
    license: "valid",
    licenseGrant: null,
    name: "Ada Lovelace",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "admin", slug: "ada" },
      { id: "org-2", name: "Fonderie", role: "member", slug: "fonderie" },
    ],
    role: "admin",
    servers: { limit: 3, used: 1 },
  };

  const note = (given: AccountIdentity): string =>
    renderToStaticMarkup(
      <OnboardingOrganizationNote
        identity={given}
        onSwitch={() => Promise.resolve()}
      />
    );

  it("dit pour quelle organisation le serveur sera enrôlé, et le rôle en français", () => {
    const html = note(identity);

    expect(html).toContain('data-enrolling-for="org-1"');
    expect(text(html)).toContain("Rattaché à Atelier Ada");
    expect(text(html)).toContain("Administrateur");
    expect(text(html)).not.toContain("admin");
  });

  it("offre la bascule seulement quand il y a le choix", () => {
    const several = note(identity);
    const one = note({
      ...identity,
      organizations: identity.organizations.slice(0, 1),
    });

    expect(several).toContain('role="combobox"');
    expect(several).toContain('value="org-1"');
    expect(text(several)).toContain("Atelier Ada · Admin");
    expect(one).not.toContain('role="combobox"');
  });

  it("prévient quand aucune organisation n'est active", () => {
    const html = note({ ...identity, organization: null, role: null });

    expect(text(html)).toContain("Aucune organisation active");
  });
});

describe("l'offre d'installer sur la fiche d'un serveur", () => {
  const HELLO: HelloResult = {
    agent_version: "1.0.0",
    capabilities: [],
    license: "valid",
    protocol: 3,
  };

  const offered = () =>
    document.querySelector("[data-onboarding-entry]") !== null;

  function agentGreets(session: HelloResult | null): void {
    stubPupitre({ agentSession: () => Promise.resolve(session) });
  }

  async function noteChannel(state: "open" | "lost"): Promise<void> {
    await act(() => {
      useChannel.getState().note(SERVER.id, state);
    });
  }

  beforeEach(() => {
    useOnboarding.getState().reset();
    useChannel.setState({ states: {} });
    useInspection.getState().forget();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("se retire quand l'agent répond après l'ouverture de la fiche, comme au relancement", async () => {
    agentGreets(null);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await waitUntil(offered);

    await noteChannel("open");

    expect(offered()).toBe(false);
    expect(view.text()).not.toContain("Installer Pupitre");
    view.unmount();
  });

  it("ne revient pas quand le canal d'un agent qui a répondu se coupe", async () => {
    agentGreets(null);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await noteChannel("open");
    await noteChannel("lost");

    expect(offered()).toBe(false);
    view.unmount();
  });

  it("se retire quand une inspection trouve l'agent", async () => {
    agentGreets(null);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await waitUntil(offered);

    await act(() => {
      useInspection.setState({ probes: { [SERVER.id]: MANAGED } });
    });

    expect(offered()).toBe(false);
    view.unmount();
  });

  it("n'offre rien sur un serveur dont l'agent a déjà répondu", async () => {
    agentGreets(HELLO);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    expect(offered()).toBe(false);
    view.unmount();
  });

  it("offre d'installer sur un serveur nu", async () => {
    agentGreets(null);
    useInspection.setState({ probes: { [SERVER.id]: BARE } });

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await waitUntil(offered);

    expect(view.text()).toContain("Pas encore installé.");
    expect(view.text()).toContain("Installer Pupitre");
    view.unmount();
  });
});
