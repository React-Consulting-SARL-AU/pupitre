import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import type { SshShareState } from "@shared/ssh-names";
import { type Mounted, mount } from "../../__tests__/dom";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useSshShare } from "../../stores/ssh-share";
import { HelpScreen } from "../help/help-screen";

const noop = () => undefined;

const SHARED: SshShareState = {
  line: "Include /data/ssh/config",
  servers: [
    {
      host: "203.0.113.10",
      id: "srv-a",
      identityFile: "/Users/ada/.pupitre/desktop/keys/srv-a",
      name: "Atelier",
      port: 2222,
      ssh: "atelier",
      user: "dev",
    },
  ],
  shared: true,
  userConfigPath: "/Users/ada/.ssh/config",
};

const CLAUDE: Service = {
  configured: true,
  id: "ai.claude",
  name: "Claude Code",
  runs: true,
  state: "running",
};

const PROJECT = {
  name: "api",
  path: "/home/dev/projects/api",
} as Project;

let view: Mounted | null = null;

async function page(
  state: SshShareState,
  services: Service[] = [CLAUDE],
  projects: Project[] = [PROJECT]
): Promise<Mounted> {
  stubPupitre({ sshShareState: () => Promise.resolve(state) });

  view = await mount(
    <HelpScreen
      activeId="srv-a"
      onServices={noop}
      onSettings={noop}
      projects={projects}
      services={services}
    />
  );

  return view;
}

beforeEach(() => {
  useSshShare.setState({ state: null });
});

afterEach(() => {
  view?.unmount();
  view = null;
});

describe("the help", () => {
  it("gives the driven server its alias, its account and its key, as ssh reads them", async () => {
    const { html, text } = await page(SHARED);

    expect(html()).toContain('data-callout="help-shared"');
    expect(text()).toContain("ssh atelier");
    expect(text()).toContain("dev@203.0.113.10:2222");
    expect(text()).toContain("/Users/ada/.pupitre/desktop/keys/srv-a");
  });

  it("fills the Claude app form and the three lines of a terminal", async () => {
    const { text } = await page(SHARED);

    expect(text()).toContain("SSH Hostatelier");
    expect(text()).toContain("SSH Port2222");
    expect(text()).toContain("tmux new -A -s claude");
    expect(text()).toContain("cd /home/dev/projects/api && claude");
    expect(text()).toContain("zed://ssh/atelier/home/dev/projects/api");
  });

  it("says which tool is missing on the machine, and which is there", async () => {
    const { html, text } = await page(SHARED);

    expect(html()).toContain(
      'data-callout="help-module-ai.claude" data-tone="ok"'
    );
    expect(html()).toContain(
      'data-callout="help-module-ai.codex" data-tone="warn"'
    );
    expect(text()).toContain("ai.codex n'est pas installé sur Atelier");
  });

  it("gives the address and the account when the system file does not include the app's", async () => {
    const { html, text } = await page({ ...SHARED, shared: false });

    expect(html()).toContain('data-callout="help-unshared"');
    expect(text()).toContain("Activer dans Réglages › SSH");
    expect(text()).toContain("ssh dev@203.0.113.10");
    expect(text()).toContain("Remote-SSH › dev@203.0.113.10");
  });

  it("opens the examples on a placeholder folder without a project", async () => {
    const { text } = await page(SHARED, [CLAUDE], []);

    expect(text()).toContain("cd ~/projects/mon-projet && claude");
  });

  it("stops at the file when the app has no server", async () => {
    const { html, text } = await page({ ...SHARED, servers: [] });

    expect(text()).toContain("Aucun serveur ajouté par l'app");
    expect(html()).not.toContain('data-section="help-claude"');
  });
});
