package main

import (
	"reflect"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/registry"
)

func TestDevDrivesTheProjectsFromATerminal(t *testing.T) {
	fake, _ := setupCLI(t)
	fake.Files[registry.DefaultConf] = []byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev --port 3000\n")
	fake.Dirs["/home/dev/projects/web"] = true

	code, stdout, stderr := runCLI(t, "dev", "status")
	if code != 0 || !strings.Contains(stdout, "web") {
		t.Fatalf("code = %d, stdout = %q, stderr = %q", code, stdout, stderr)
	}

	code, _, stderr = runCLI(t, "dev")
	if code != 2 || !strings.Contains(stderr, "usage: pupitred dev") {
		t.Fatalf("code = %d, stderr = %q", code, stderr)
	}
}

func TestDevAnswersThroughItsLink(t *testing.T) {
	if got := arguments([]string{"/usr/local/bin/dev", "status"}); !reflect.DeepEqual(got, []string{"dev", "status"}) {
		t.Fatalf("a call through the link is a dev command: %v", got)
	}
}
