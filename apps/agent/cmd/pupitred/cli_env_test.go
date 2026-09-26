package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/registry"
)

func environmentDocument(t *testing.T) []byte {
	t.Helper()

	raw, err := json.Marshal(registry.EnvironmentDocument{
		Machine: []string{"PUPITRE=1", "PUPITRE_PROJECTS_DIR=/home/dev/projects"},
		Places: []registry.EnvironmentPlace{
			{Path: "/home/dev/projects/blog", Env: []string{"PUPITRE=1", "PUPITRE_PROJECT=blog", "PUPITRE_PROJECTS_DIR=/home/dev/projects", "PUPITRE_URL=https://o'neil.dev"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	return raw
}

func TestEnvExportsTheFolderItStandsInQuotedForTheShell(t *testing.T) {
	got := shellEnvironment(environmentDocument(t), "/home/dev/projects/blog/src", "")
	want := "export PUPITRE='1'\n" +
		"export PUPITRE_PROJECT='blog'\n" +
		"export PUPITRE_PROJECTS_DIR='/home/dev/projects'\n" +
		"export PUPITRE_URL='https://o'\\''neil.dev'\n" +
		"export _PUPITRE_ENV_KEYS='PUPITRE PUPITRE_PROJECT PUPITRE_PROJECTS_DIR PUPITRE_URL'\n"

	if got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
}

func TestEnvUnsetsWhatTheNewFolderNoLongerGives(t *testing.T) {
	got := shellEnvironment(environmentDocument(t), "/home/dev", "PUPITRE PUPITRE_PROJECT PUPITRE_PROJECTS_DIR PUPITRE_URL")

	if !strings.HasPrefix(got, "unset PUPITRE_PROJECT PUPITRE_URL\n") {
		t.Fatalf("leaving the project must unset its variables:\n%s", got)
	}

	if !strings.Contains(got, "export PUPITRE='1'\n") {
		t.Fatalf("the machine's variables stay:\n%s", got)
	}
}

func TestEnvPrintsNothingForAnUnreadableDocument(t *testing.T) {
	if got := shellEnvironment([]byte("{"), "/home/dev", "PUPITRE"); got != "" {
		t.Fatalf("an unreadable document must leave the shell as it is, got %q", got)
	}
}

func TestEnvReadsTheDocumentUnderTheHomeOfWhoeverRunsIt(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("_PUPITRE_ENV_KEYS", "")

	path := filepath.Join(home, registry.EnvironmentFile)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, environmentDocument(t), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Chdir(home)

	code, stdout, _ := runCLI(t, "env")
	if code != 0 || !strings.Contains(stdout, "export PUPITRE_PROJECTS_DIR='/home/dev/projects'\n") {
		t.Fatalf("code = %d, stdout = %q", code, stdout)
	}
}
