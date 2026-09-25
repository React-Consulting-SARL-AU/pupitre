import { afterEach, describe, expect, it } from "bun:test";
import { useServers } from "@renderer/stores/servers";
import type { Server } from "@shared/servers";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "../../__tests__/dom";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { refusedField } from "../../lib/server-add-refusal";
import { ServerAddForm } from "../servers/server-add-form";
import { ServerAddKeyFileField } from "../servers/server-add-key-file-field";
import { ServerAddPasswordField } from "../servers/server-add-password-field";
import { ServerKeyInstall } from "../servers/server-key-install";

const NOOP = () => undefined;

const SERVER: Server = {
  host: "203.0.113.10",
  id: "srv-1",
  keyPath: "/data/keys/srv-1",
  name: "atelier",
  origin: "app",
  port: 22,
  user: "root",
};

function parsed(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

function labelled(doc: Document): string[] {
  return [...doc.querySelectorAll("input:not([aria-hidden])")].map((input) => {
    const label = doc.querySelector(`label[for="${input.id}"]`);

    return input.id && label ? "bound" : `unbound:${input.outerHTML}`;
  });
}

afterEach(() => {
  useServers.setState({ keyInstall: { status: "idle" } });
});

describe("le premier formulaire, lu sans la vue", () => {
  it("lie chaque champ à son libellé", () => {
    const doc = parsed(
      renderToStaticMarkup(
        <ServerAddForm busy={false} error={null} onSubmit={NOOP} />
      )
    );

    expect(labelled(doc).every((one) => one === "bound")).toBe(true);
    expect(doc.querySelector("#servers\\.add\\.address")).not.toBeNull();
    expect(
      doc
        .querySelector("#servers\\.add\\.address")
        ?.getAttribute("aria-required")
    ).toBe("true");
  });

  it("pose le refus d'un mot de passe sous son champ, pas au pied du formulaire", () => {
    const doc = parsed(
      renderToStaticMarkup(
        <ServerAddPasswordField
          onChange={NOOP}
          problem="root@203.0.113.10 a refusé ce mot de passe."
          value=""
        />
      )
    );
    const input = doc.querySelector("input[type=password]");

    expect(input?.id).toBe("servers.add.password");
    expect(doc.querySelector(`label[for="${input?.id}"]`)).not.toBeNull();
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toContain(
      "servers.add.password-problem"
    );
    expect(
      doc.getElementById("servers.add.password-problem")?.textContent
    ).toBe("root@203.0.113.10 a refusé ce mot de passe.");
  });

  it("nomme le groupe du fichier de clé et y attache son refus", () => {
    const doc = parsed(
      renderToStaticMarkup(
        <ServerAddKeyFileField
          file="/Users/me/.ssh/id_rsa.pub"
          onPick={NOOP}
          problem="Ce fichier n'est pas une clé privée."
        />
      )
    );
    const group = doc.querySelector("fieldset");

    expect(group?.querySelector("legend")?.textContent).toBe(
      "Fichier de la clé privée"
    );
    expect(group?.getAttribute("aria-describedby")).toContain(
      "servers.add.keyFile-problem"
    );
    expect(doc.body.textContent).toContain(
      "Ce fichier n'est pas une clé privée."
    );
  });

  it("rattache chaque refus du main au champ qui le porte, et garde les autres au pied", () => {
    const refusal = (id: string) => ({
      code: "bad_request" as const,
      message: id,
      phrase: { id },
    });

    const password = refusal("refusal.setup.password");
    const key = refusal("refusal.key.public");

    expect(refusedField(password, "generate", true)).toBe("password");
    expect(refusedField(password, "generate", false)).toBeNull();
    expect(refusedField(key, "import", false)).toBe("keyFile");
    expect(refusedField(key, "generate", false)).toBeNull();
    expect(
      refusedField(refusal("refusal.server.added"), "import", false)
    ).toBeNull();
    expect(refusedField(null, "generate", true)).toBeNull();
  });
});

describe("le mot de passe demandé pour poser la clé", () => {
  it("dit sous le champ que le serveur a refusé le mot de passe", async () => {
    stubPupitre({});
    useServers.setState({ keyInstall: { retry: true, status: "password" } });

    const view = await mount(
      <ServerKeyInstall
        copyId={null}
        onDone={NOOP}
        publicKey="ssh-ed25519 AAAA"
        server={SERVER}
      />
    );
    const input = view.container.querySelector("input[type=password]");

    expect(
      view.container.querySelector(`label[for="${input?.id}"]`)
    ).not.toBeNull();
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(
      view.container.querySelector(`[id="${input?.id}-problem"]`)?.textContent
    ).toBeTruthy();

    view.unmount();
  });
});
