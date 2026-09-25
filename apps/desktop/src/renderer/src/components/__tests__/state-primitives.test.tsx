import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "../../__tests__/dom";
import { Callout } from "../ui/callout";
import { ConfirmButton, ConfirmDialog } from "../ui/confirm-button";
import { ErrorNotice } from "../ui/error-notice";
import { SkeletonCards, SkeletonRows } from "../ui/skeleton";
import { WaitingLine } from "../ui/waiting-line";

const NOOP = () => undefined;

describe("un squelette", () => {
  it("dessine autant de lignes qu'annoncé et le dit à voix haute", () => {
    const html = renderToStaticMarkup(<SkeletonRows rows={4} />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement…");
    expect(html.match(/animate-breathe/g)?.length).toBe(12);
  });

  it("garde ses blocs hors de l'arbre d'accessibilité", () => {
    const html = renderToStaticMarkup(<SkeletonCards cards={1} />);

    expect(html.match(/aria-hidden="true"/g)?.length).toBe(4);
  });

  it("se passe de cadre quand le panneau a déjà le sien", () => {
    const html = renderToStaticMarkup(<SkeletonRows framed={false} />);

    expect(html).not.toContain("elevation-raised");
  });
});

describe("une ligne d'attente", () => {
  it("respire à côté de ce qu'elle attend", () => {
    const html = renderToStaticMarkup(<WaitingLine>lecture…</WaitingLine>);

    expect(html).toContain('data-shape="breathing"');
    expect(html).toContain('role="status"');
    expect(html).toContain("lecture…");
  });
});

describe("un avis", () => {
  it("porte la couleur sur son glyphe, jamais sur le texte", () => {
    const html = renderToStaticMarkup(
      <Callout tone="danger">Le serveur a refusé.</Callout>
    );

    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("text-danger");
    expect(html).not.toContain("bg-danger");
  });

  it("montre une commande comme une ligne à taper", () => {
    const html = renderToStaticMarkup(
      <Callout fix="sudo systemctl restart pupitred" tone="danger">
        L'agent ne répond pas.
      </Callout>
    );

    expect(html).toContain("<code");
    expect(html).toContain("sudo systemctl restart pupitred");
  });

  it("montre une phrase comme une phrase", () => {
    const html = renderToStaticMarkup(
      <Callout fix="Vérifiez le port 22." tone="danger">
        Connexion refusée.
      </Callout>
    );

    expect(html).not.toContain("<code");
    expect(html).toContain("Vérifiez le port 22.");
  });

  it("se laisse ranger quand on lui donne le geste", () => {
    const html = renderToStaticMarkup(
      <Callout onDismiss={NOOP} tone="ok">
        CLÉ enregistrée.
      </Callout>
    );

    expect(html).toContain('aria-label="Masquer"');
    expect(html).toContain('data-tone="ok"');
  });

  it("posé dans un panneau, il perd son cadre et garde son glyphe", () => {
    const html = renderToStaticMarkup(
      <Callout bare tone="danger">
        Le serveur a refusé.
      </Callout>
    );

    expect(html).not.toContain("elevation-raised");
    expect(html).not.toContain("border-line");
    expect(html).toContain('role="alert"');
    expect(html).toContain("text-danger");
  });
});

describe("un refus de l'agent", () => {
  it("dit le message, le remède tel quel et le geste qui rejoue", () => {
    const html = renderToStaticMarkup(
      <ErrorNotice
        error={{
          code: "disconnected",
          fix: "Vérifiez le port 22.",
          message: "Connexion refusée.",
        }}
        onRetry={NOOP}
      />
    );

    expect(html).toContain("Connexion refusée.");
    expect(html).toContain("Vérifiez le port 22.");
    expect(html).toContain("Réessayer");
    expect(html).toContain('data-callout="disconnected"');
  });
});

describe("une confirmation", () => {
  it("pose sa question dans un dialogue, sans toucher au bouton", async () => {
    const closed = renderToStaticMarkup(
      <ConfirmButton
        confirmLabel="Retirer"
        onConfirm={() => Promise.resolve()}
        question="Le projet quitte le registre ; son dossier reste sur le serveur."
      >
        Retirer du registre
      </ConfirmButton>
    );

    expect(closed).toContain("Retirer du registre");
    expect(closed).not.toContain('role="dialog"');
    expect(closed).not.toContain("son dossier reste");

    const view = await mount(
      <ConfirmDialog
        confirmLabel="Retirer"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        open
        question="Le projet quitte le registre ; son dossier reste sur le serveur."
        title="Retirer du registre"
      />
    );
    const asked = view.html();

    expect(asked).toContain('role="alertdialog"');
    expect(asked).toContain('data-dialog="confirm"');
    expect(asked).toContain("son dossier reste sur le serveur");
    expect(asked).toContain(">Retirer<");
    expect(asked).toContain("Annuler");

    view.unmount();
  });
});
