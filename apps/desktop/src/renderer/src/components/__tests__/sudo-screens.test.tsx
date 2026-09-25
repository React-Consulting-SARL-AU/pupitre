import { afterEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { mount, typeInto, waitUntil } from "../../__tests__/dom";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useSudoPassword } from "../../stores/sudo-password";
import { OnboardingHardenSudo } from "../onboarding/onboarding-harden-sudo";
import { ServerSudoFact } from "../servers/server-sudo-fact";

const PASSWORD = "k7mp-q2xw-9hdt-3vzc-u8fa-6rne";

// The store is read before mounting, as the preceding screens would have done.
async function holding(kept: boolean, copied: string[] = []): Promise<void> {
  stubPupitre({
    copySudoPassword: (serverId: string) => {
      copied.push(serverId);

      return Promise.resolve(true);
    },
    revealSudoPassword: () => Promise.resolve(PASSWORD),
    sudoPasswordState: () => Promise.resolve({ held: true, kept }),
  });

  await useSudoPassword.getState().read("srv-1");
}

// The button waits on its promise, so the click must settle inside act.
async function press(selector: string): Promise<void> {
  await act(async () => {
    document.querySelector<HTMLElement>(selector)?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function keep(): Promise<void> {
  await act(async () => {
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-dialog="sudo-enter"] button'
      ),
    ]
      .find((button) => button.textContent === "Garder sur cet ordinateur")
      ?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  useSudoPassword.getState().forget();
  document.body.innerHTML = "";
});

describe("le mot de passe sudo sur la fiche du serveur", () => {
  it("reste masqué jusqu'à ce qu'on le demande, et se copie sans passer par l'écran", async () => {
    const copied: string[] = [];

    await holding(true, copied);

    const view = await mount(<ServerSudoFact serverId="srv-1" />);

    await waitUntil(() => view.text().includes("Mot de passe sudo de dev"));

    expect(view.text()).not.toContain(PASSWORD);
    expect(view.text()).toContain("Dans le trousseau de cet ordinateur");

    await press('[aria-label="Afficher le mot de passe sudo de dev"]');

    expect(view.text()).toContain(PASSWORD);

    await press('[aria-label="Copier le mot de passe sudo de dev"]');

    expect(copied).toEqual(["srv-1"]);
    view.unmount();
  });

  it("tient une ligne entière de la fiche et se lit en entier une fois montré", async () => {
    await holding(true);

    const view = await mount(<ServerSudoFact serverId="srv-1" />);

    await waitUntil(() => view.text().includes("Mot de passe sudo de dev"));
    await press('[aria-label="Afficher le mot de passe sudo de dev"]');

    const fact = document.querySelector('[data-sudo-password="revealed"]');
    const value = [...(fact?.querySelectorAll("span") ?? [])].find(
      (span) => span.textContent === PASSWORD
    );

    expect(fact?.getAttribute("data-wide")).toBe("true");
    expect(value?.className).not.toContain("truncate");
    view.unmount();
  });

  // Securing is itself a privileged gesture, so the only way in is the password typed here.
  it("sur un ordinateur qui ne le tient pas, le fait saisir et le garde une fois accepté", async () => {
    const entered: string[] = [];
    let held = false;

    stubPupitre({
      enterSudoPassword: (_serverId: string, password: string) => {
        entered.push(password);
        held = true;

        return Promise.resolve({ kept: true, ok: true });
      },
      sudoPasswordState: () => Promise.resolve({ held, kept: held }),
    });
    await useSudoPassword.getState().read("srv-1");

    const view = await mount(<ServerSudoFact serverId="srv-1" />);

    expect(view.text()).toContain("Pas sur cet ordinateur");
    expect(view.text()).not.toContain("•");

    await press('[aria-label="Saisir le mot de passe sudo de dev"]');
    await waitUntil(
      () => document.querySelector('input[type="password"]') !== null
    );
    await typeInto(document.querySelector('input[type="password"]'), PASSWORD);
    await keep();

    await waitUntil(() => view.text().includes("Dans le trousseau"));

    expect(entered).toEqual([PASSWORD]);
    expect(JSON.stringify(useSudoPassword.getState())).not.toContain("k7mp");
    view.unmount();
  });

  it("dit sous le champ pourquoi sudo a refusé ce mot de passe", async () => {
    stubPupitre({
      enterSudoPassword: () =>
        Promise.resolve({
          error: {
            code: "privilege_required",
            message: "refusal.sudo.refused",
            phrase: { id: "refusal.sudo.refused" },
          },
          ok: false,
        }),
      sudoPasswordState: () => Promise.resolve({ held: false, kept: false }),
    });
    await useSudoPassword.getState().read("srv-1");

    const view = await mount(<ServerSudoFact serverId="srv-1" />);

    await press('[aria-label="Saisir le mot de passe sudo de dev"]');
    await waitUntil(
      () => document.querySelector('input[type="password"]') !== null
    );
    await typeInto(
      document.querySelector('input[type="password"]'),
      "pas-le-bon"
    );
    await keep();

    await waitUntil(() =>
      (document.body.textContent ?? "").includes(
        "sudo a refusé le mot de passe sudo de dev"
      )
    );

    expect(
      document
        .querySelector('input[type="password"]')
        ?.getAttribute("aria-invalid")
    ).toBe("true");
    view.unmount();
  });
});

describe("la fin de la sécurisation", () => {
  it("dit que sudo demande désormais le mot de passe, et le montre à la demande", async () => {
    await holding(true);

    const view = await mount(
      <OnboardingHardenSudo serverId="srv-1" sudo={{ kept: true, ok: true }} />
    );
    await waitUntil(() => view.text().includes("Mot de passe sudo de dev"));

    expect(view.text()).toContain("Sudo demande un mot de passe à dev");
    expect(view.text()).not.toContain("Notez-le maintenant");
    view.unmount();
  });

  it("demande de le noter quand l'ordinateur n'a pas de trousseau", async () => {
    await holding(false);

    const view = await mount(
      <OnboardingHardenSudo serverId="srv-1" sudo={{ kept: false, ok: true }} />
    );
    await waitUntil(() => view.text().includes("Mot de passe sudo de dev"));

    expect(view.text()).toContain("Notez-le maintenant");
    expect(view.text()).toContain(
      "Oublié à la fermeture de l'app : cet ordinateur n'a pas de trousseau"
    );
    view.unmount();
  });

  it("rend le refus de l'agent tel quel, avec de quoi réessayer", async () => {
    await holding(true);

    const view = await mount(
      <OnboardingHardenSudo
        onRetry={() => undefined}
        serverId="srv-1"
        sudo={{
          error: {
            code: "bad_request",
            fix: "Relancez la sécurisation depuis l'app.",
            message:
              "le serveur SSH accepte encore les mots de passe pour dev (passwordauthentication)",
          },
          ok: false,
        }}
      />
    );

    expect(view.text()).toContain(
      "le serveur SSH accepte encore les mots de passe pour dev"
    );
    expect(view.text()).toContain("Réessayer");
    view.unmount();
  });
});
