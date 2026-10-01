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

describe("an address test", () => {
  const notice = (reach: ServerReach): string =>
    renderToStaticMarkup(<ServerReachNotice reach={reach} />);

  it("tells an address that answers from one that refuses, by shape", () => {
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

  it("names the software that answered and the time it took", () => {
    const html = notice({
      access: { access: "opens" },
      ms: 42,
      reached: true,
      software: "OpenSSH_9.6",
    });

    expect(text(html)).toContain("OpenSSH_9.6 a répondu en 42 ms");
  });

  it("says what will open the account, by shape and by sentence", () => {
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

  it("renders the refusal and its fix as the main process said them", () => {
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

describe("deleting a server", () => {
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

  it("shows nothing destructive until asked", () => {
    expect(text(row())).not.toContain("Supprimer définitivement");
  });

  it("offers the trash on each row", () => {
    expect(row()).toContain('aria-label="Supprimer atelier"');
  });
});

describe("an irreversible gesture button", () => {
  it("is painted solid rather than settling for an outline", () => {
    const html = renderToStaticMarkup(
      <Button variant="destructive">Supprimer définitivement</Button>
    );

    expect(html).toContain("bg-danger");
    expect(html).toContain("text-base");
  });

  it("leaves the outline to the button that only opens the question", () => {
    const html = renderToStaticMarkup(
      <Button variant="danger">Supprimer</Button>
    );

    expect(html).not.toContain("bg-danger");
  });
});

describe("a working button", () => {
  const working = (): string =>
    renderToStaticMarkup(
      <Button icon={Trash2} loading variant="destructive">
        Supprimer définitivement
      </Button>
    );

  it("spins in place of its icon, so to the left of the label", () => {
    const html = working();

    expect(html).toContain('data-spinner="true"');
    expect(html).not.toContain("lucide-trash");
    expect(html.indexOf("data-spinner")).toBeLessThan(
      html.indexOf("Supprimer")
    );
  });

  it("takes no second click, and says so to whoever reads aloud", () => {
    const html = working();

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("keeps its ink: a wait is not a switched-off button", () => {
    expect(working()).not.toContain("opacity-40");
    expect(renderToStaticMarkup(<Button disabled>Supprimer</Button>)).toContain(
      "opacity-40"
    );
  });
});

describe("a multi-step wait", () => {
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

  it("says where it stands by shape, not by colour", () => {
    const html = notice();

    expect(html).toContain('data-state="done"');
    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-state="running"');
    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('data-state="ahead"');
    expect(html).toContain('data-shape="empty"');
  });

  it("names the current step for whatever reads aloud", () => {
    expect(notice()).toContain('aria-current="step"');
    expect(text(notice())).toContain("On l'écrit dans authorized_keys");
  });

  it("stays a wait when no step is named", () => {
    const html = renderToStaticMarkup(
      <WaitingNotice detail="Ports, utilisateurs" title="Inspection" />
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("data-phase");
  });
});

describe("choosing a machine in the wizard", () => {
  const choice = (server: Server): string =>
    renderToStaticMarkup(
      <OnboardingServerChoice onPick={NOOP} server={server} />
    );

  it("makes the whole card the button, so there is nothing to aim at", () => {
    const html = choice(SERVER);

    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('data-server="srv-1"');
  });

  it("says the address and who owns the configuration", () => {
    expect(text(choice(SERVER))).toContain(
      "root@203.0.113.10:22 · écrite par l'app"
    );
  });

  it("names a system host by its alias, without account or port", () => {
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

describe("the step the wizard opens", () => {
  it("waits to have read the list before showing anything", () => {
    expect(serverStage(null, "loading", 0)).toBeNull();
  });

  it("opens the form when this computer knows no machine", () => {
    expect(serverStage(null, "ready", 0)).toBe("add");
  });

  it("offers to choose as soon as it knows one", () => {
    expect(serverStage(null, "ready", 1)).toBe("pick");
  });

  it("respects the step that was asked for", () => {
    expect(serverStage("add", "ready", 3)).toBe("add");
    expect(serverStage("pick", "ready", 0)).toBe("pick");
  });
});

describe("the enrolment organization", () => {
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

  it("says which organization the server will be enrolled in, and the role in French", () => {
    const html = note(identity);

    expect(html).toContain('data-enrolling-for="org-1"');
    expect(text(html)).toContain("Rattaché à Atelier Ada");
    expect(text(html)).toContain("Administrateur");
    expect(text(html)).not.toContain("admin");
  });

  it("offers the switch only when there is a choice", () => {
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

  it("warns when no organization is active", () => {
    const html = note({ ...identity, organization: null, role: null });

    expect(text(html)).toContain("Aucune organisation active");
  });
});

describe("the offer to install on a server page", () => {
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

  it("withdraws when the agent answers after the page opens, as on relaunch", async () => {
    agentGreets(null);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await waitUntil(offered);

    await noteChannel("open");

    expect(offered()).toBe(false);
    expect(view.text()).not.toContain("Installer Pupitre");
    view.unmount();
  });

  it("does not come back when the channel of an agent that answered drops", async () => {
    agentGreets(null);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await noteChannel("open");
    await noteChannel("lost");

    expect(offered()).toBe(false);
    view.unmount();
  });

  it("withdraws when an inspection finds the agent", async () => {
    agentGreets(null);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await waitUntil(offered);

    await act(() => {
      useInspection.setState({ probes: { [SERVER.id]: MANAGED } });
    });

    expect(offered()).toBe(false);
    view.unmount();
  });

  it("offers nothing on a server whose agent already answered", async () => {
    agentGreets(HELLO);

    const view = await mount(<OnboardingEntry server={SERVER} />);

    expect(offered()).toBe(false);
    view.unmount();
  });

  it("offers to install on a bare server", async () => {
    agentGreets(null);
    useInspection.setState({ probes: { [SERVER.id]: BARE } });

    const view = await mount(<OnboardingEntry server={SERVER} />);

    await waitUntil(offered);

    expect(view.text()).toContain("Pas encore installé.");
    expect(view.text()).toContain("Installer Pupitre");
    view.unmount();
  });
});
