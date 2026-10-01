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

describe("the app update state", () => {
  it("offers to check when nothing is in progress, and says when it last was", () => {
    const html = update({
      checkedAt: new Date().toISOString(),
      status: "idle",
      updates: true,
    });

    expect(text(html)).toContain("Rechercher une mise à jour");
    expect(text(html)).toContain("vérifié");
    expect(html).toContain('data-app-update="idle"');
  });

  it("asks to restart when a version is ready, and says what it costs", () => {
    const html = update({ status: "ready", updates: true, version: "0.5.0" });

    expect(text(html)).toContain("La version 0.5.0 est prête");
    expect(text(html)).toContain("Redémarrer maintenant");
    expect(text(html)).toContain("les sessions continuent sur les serveurs");
    expect(html).toContain('data-tone="ok"');
  });

  it("states the failure with its fix, and lets the user check again", () => {
    const html = update({ failure: "failed", status: "error", updates: true });

    expect(text(html)).toContain("La mise à jour n'a pas pu être téléchargée");
    expect(text(html)).toContain("Vérifiez la connexion");
    expect(text(html)).toContain("Rechercher une mise à jour");
    expect(html).toContain('data-tone="danger"');
  });

  it("says a version rejected by the release key is not installed, and what to do", () => {
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

  it("waits for the signature check before offering the restart", () => {
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

  it("shows the progress of a download", () => {
    const html = update({
      percent: 42,
      status: "downloading",
      updates: true,
      version: "0.5.0",
    });

    expect(text(html)).toContain("Téléchargement de la version 0.5.0 — 42 %");
    expect(html).toContain('aria-busy="true"');
  });

  it("offers no button to a copy that does not update itself", () => {
    const html = update({ status: "idle", updates: false });

    expect(text(html)).toContain("ne se met pas à jour d'elle-même");
    expect(text(html)).not.toContain("Rechercher");
  });
});

describe("the About section", () => {
  it("states the version in digits and the channel in words", () => {
    const html = renderToStaticMarkup(
      <SettingsAboutBuild about={{ channel: "beta", version: "0.4.2" }} />
    );

    expect(html).toContain('data-app-version="0.4.2"');
    expect(text(html)).toContain("Versions bêta");
  });

  it("names a copy that no channel follows", () => {
    const html = renderToStaticMarkup(
      <SettingsAboutBuild about={{ channel: null, version: "0.1.0" }} />
    );

    expect(text(html)).toContain("Pas mise à jour par l'app");
  });
});

describe("a check line", () => {
  it("carries its clickable label and the state read", () => {
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
