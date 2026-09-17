//go:build staging

package staging

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

var editorInstall = request{Cmd: "install", Params: map[string]any{
	"secrets_stdin": false,
	"modules":       []string{"editor.jetbrains", "editor.vscode", "editor.zed"},
	"config": map[string]any{
		"core.system":      map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"editor.jetbrains": map[string]any{"ide": "idea", "version": "latest"},
		"editor.vscode":    map[string]any{"extensions": []string{"esbenp.prettier-vscode"}, "tunnel": false},
		"editor.zed":       map[string]any{"version": "latest"},
	},
}}

func installEditors(t *testing.T, host string) response {
	t.Helper()

	first := agent(t, host, editorInstall)[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	return first
}

func TestGatewayFindsTheBackendWithoutDownloadingIt(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	installEditors(t, host)

	dist := ssh(t, dev, "ls", "-1", "/home/dev/.cache/JetBrains/RemoteDev/dist")
	if !strings.Contains(dist, "idea-latest") {
		t.Fatalf("Gateway inspects that folder and must find a backend there:\n%s", dist)
	}

	launcher := ssh(t, dev, "test", "-x", "/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest/bin/remote-dev-server.sh", "&&", "echo", "ok")
	if !strings.Contains(launcher, "ok") {
		t.Fatalf("the backend launcher must be executable:\n%s", launcher)
	}

	options := ssh(t, dev, "cat", "/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest/bin/idea64.vmoptions")
	if !strings.Contains(options, "-Xmx") {
		t.Fatalf("the JVM must be sized for this machine:\n%s", options)
	}
}

func TestTheVSCodeServerIsThereBeforeTheFirstConnection(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	installEditors(t, host)

	if out := ssh(t, dev, "/usr/local/bin/code", "--version"); strings.TrimSpace(out) == "" {
		t.Fatal("the code CLI must answer")
	}

	servers := ssh(t, dev, "ls", "-1", "/home/dev/.vscode-server/bin")
	if strings.TrimSpace(servers) == "" {
		t.Fatalf("a server of the current commit must already be extracted:\n%s", servers)
	}

	commit := strings.Fields(strings.TrimSpace(servers))[0]
	if out := ssh(t, dev, "test", "-x", "/home/dev/.vscode-server/bin/"+commit+"/bin/code-server", "&&", "echo", "ok"); !strings.Contains(out, "ok") {
		t.Fatalf("the server CLI must be executable:\n%s", out)
	}

	extensions := ssh(t, dev, "/home/dev/.vscode-server/bin/"+commit+"/bin/code-server", "--list-extensions")
	if !strings.Contains(extensions, "esbenp.prettier-vscode") {
		t.Fatalf("the listed extensions must already be installed:\n%s", extensions)
	}

	// systemctl exits 1 when nothing is listed, which is the answer wanted here.
	out, _ := sshCommand(host, "systemctl", "list-unit-files", "pupitre-code-tunnel.service").CombinedOutput()
	if strings.Contains(string(out), "pupitre-code-tunnel.service") {
		t.Fatalf("without the tunnel there is no service:\n%s", out)
	}
}

func TestTheZedRemoteServerIsExecutable(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	installEditors(t, host)

	listed := ssh(t, dev, "ls", "-1", "/home/dev/.zed_server")
	if !strings.Contains(listed, "zed-remote-server-stable-") {
		t.Fatalf("Zed looks for its server there:\n%s", listed)
	}

	recorded := strings.TrimSpace(ssh(t, dev, "cat", "/home/dev/.zed_server/pupitre-release.txt"))
	if out := ssh(t, dev, "test", "-x", "/home/dev/.zed_server/zed-remote-server-stable-"+recorded, "&&", "echo", "ok"); !strings.Contains(out, "ok") {
		t.Fatalf("the recorded server must be executable:\n%s", out)
	}
}

func TestReplayingTheEditorsInstallChangesNothing(t *testing.T) {
	host := stagingHost(t)

	installEditors(t, host)
	second := installEditors(t, host)

	if changed := steps(second, contract.StepOK); len(changed) != 0 {
		t.Fatalf("a replay must only skip, these ran again: %v", changed)
	}
}
