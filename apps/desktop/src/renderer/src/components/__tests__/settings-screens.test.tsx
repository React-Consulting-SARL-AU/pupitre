import { describe, expect, it } from "bun:test";
import type { AppUpdateState } from "@shared/app-update";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsAboutBuild } from "../settings/settings-about-build";
import { SettingsAboutUpdate } from "../settings/settings-about-update";
import { CheckLine } from "../ui/check-line";

// Sections that read a store are covered by the Playwright scenario, where the bridge answers for real.
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

function update(state: AppUpdateState): string {
  return renderToStaticMarkup(
    <SettingsAboutUpdate
      onCheck={RESOLVED}
      onInstall={RESOLVED}
      state={state}
    />
  );
}

describe("l'état de la mise à jour de l'app", () => {
  it("offre de rechercher quand rien n'est en cours, et dit quand ça l'a été", () => {
    const html = update({
      checkedAt: new Date().toISOString(),
      status: "idle",
      updates: true,
    });

    expect(text(html)).toContain("Rechercher une mise à jour");
    expect(text(html)).toContain("vérifié");
    expect(html).toContain('data-app-update="idle"');
  });

  it("demande de redémarrer quand une version est prête, et dit ce que ça coûte", () => {
    const html = update({ status: "ready", updates: true, version: "0.5.0" });

    expect(text(html)).toContain("La version 0.5.0 est prête");
    expect(text(html)).toContain("Redémarrer maintenant");
    expect(text(html)).toContain("les sessions continuent sur les serveurs");
    expect(html).toContain('data-tone="ok"');
  });

  it("dit l'échec avec son remède, et laisse rechercher à nouveau", () => {
    const html = update({ failure: "failed", status: "error", updates: true });

    expect(text(html)).toContain("La mise à jour n'a pas pu être téléchargée");
    expect(text(html)).toContain("Vérifiez la connexion");
    expect(text(html)).toContain("Rechercher une mise à jour");
    expect(html).toContain('data-tone="danger"');
  });

  it("dit qu'une version refusée par la clé de release n'est pas installée, et quoi faire", () => {
    const refused = update({
      failure: "refused",
      status: "error",
      updates: true,
      version: "0.5.0",
    });
    const changed = update({
      failure: "changed",
      status: "error",
      updates: true,
      version: "0.5.0",
    });

    expect(text(refused)).toContain("La version 0.5.0");
    expect(text(refused)).toContain("pas été installée");
    expect(text(refused)).toContain("pupitre.studio");
    expect(text(changed)).toContain("pas été installée");
    expect(text(changed)).toContain("Rechercher une mise à jour");
  });

  it("attend la vérification de la signature avant d'offrir le redémarrage", () => {
    const html = update({
      status: "verifying",
      updates: true,
      version: "0.5.0",
    });

    expect(text(html)).toContain(
      "Vérification de la signature de la version 0.5.0"
    );
    expect(text(html)).not.toContain("Redémarrer maintenant");
    expect(html).toContain('aria-busy="true"');
  });

  it("montre l'avancée d'un téléchargement", () => {
    const html = update({
      percent: 42,
      status: "downloading",
      updates: true,
      version: "0.5.0",
    });

    expect(text(html)).toContain("Téléchargement de la version 0.5.0 — 42 %");
    expect(html).toContain('aria-busy="true"');
  });

  it("n'offre aucun bouton à une copie qui ne se met pas à jour", () => {
    const html = update({ status: "idle", updates: false });

    expect(text(html)).toContain("ne se met pas à jour d'elle-même");
    expect(text(html)).not.toContain("Rechercher");
  });
});

describe("la section À propos", () => {
  it("dit la version en chiffres et le canal en mots", () => {
    const html = renderToStaticMarkup(
      <SettingsAboutBuild about={{ channel: "beta", version: "0.4.2" }} />
    );

    expect(html).toContain('data-app-version="0.4.2"');
    expect(text(html)).toContain("Versions bêta");
  });

  it("nomme une copie qu'aucun canal ne suit", () => {
    const html = renderToStaticMarkup(
      <SettingsAboutBuild about={{ channel: null, version: "0.1.0" }} />
    );

    expect(text(html)).toContain("Pas mise à jour par l'app");
  });
});

describe("une ligne à cocher", () => {
  it("porte son mot cliquable et l'état lu", () => {
    const html = renderToStaticMarkup(
      <CheckLine
        checked={true}
        label="Ouvrir Pupitre à la connexion"
        name="settings.startup"
        onChange={() => undefined}
      />
    );

    expect(html).toContain('name="settings.startup"');
    expect(html).toContain('checked=""');
    expect(html).toContain('aria-label="Ouvrir Pupitre à la connexion"');
    expect(text(html)).toContain("Ouvrir Pupitre à la connexion");
  });
});
