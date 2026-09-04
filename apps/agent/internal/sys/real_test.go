package sys

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRealRunCapturesOutputAndExitCode(t *testing.T) {
	out, err := Real{}.Run(Command{Argv: []string{"sh", "-c", "echo out; echo err >&2; exit 3"}})
	if err == nil {
		t.Fatal("expected an error for exit code 3")
	}

	var exit *ExitError
	if !errors.As(err, &exit) || exit.Code != 3 || exit.Program != "sh" {
		t.Fatalf("unexpected error %v", err)
	}

	if strings.TrimSpace(out.Stdout) != "out" || strings.TrimSpace(out.Stderr) != "err" || out.Code != 3 {
		t.Fatalf("unexpected output %+v", out)
	}

	if !strings.Contains(exit.Error(), "code 3") || !strings.Contains(exit.Error(), "err") {
		t.Fatalf("error message must carry the code and stderr: %s", exit)
	}
}

func TestRealRunPassesEnvDirAndStdin(t *testing.T) {
	dir := t.TempDir()

	out, err := Real{}.Run(Command{
		Argv:  []string{"sh", "-c", "printf '%s|%s|' \"$PUPITRE_PROBE\" \"$(pwd)\"; cat"},
		Env:   []string{"PUPITRE_PROBE=yes"},
		Dir:   dir,
		Stdin: []byte("from-stdin"),
	})
	if err != nil {
		t.Fatal(err)
	}

	resolved, _ := filepath.EvalSymlinks(dir)
	if !strings.HasPrefix(out.Stdout, "yes|") || !strings.Contains(out.Stdout, resolved) || !strings.HasSuffix(out.Stdout, "|from-stdin") {
		t.Fatalf("unexpected output %q", out.Stdout)
	}
}

func TestRealWriteFileIsAtomicAndKeepsMode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "env")

	if err := (Real{}).WriteFile(path, []byte("A=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %o, want 600", info.Mode().Perm())
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("temporary file left behind: %d entries", len(entries))
	}

	exists, err := (Real{}).Exists(path)
	if err != nil || !exists {
		t.Fatalf("Exists(%s) = %v, %v", path, exists, err)
	}

	if err := (Real{}).Remove(path); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).Remove(path); err != nil {
		t.Fatalf("removing an absent file must be a no-op, got %v", err)
	}

	exists, _ = (Real{}).Exists(path)
	if exists {
		t.Fatal("file still exists after Remove")
	}
}

func TestRealWriteFileFailsWithoutDirectory(t *testing.T) {
	err := (Real{}).WriteFile(filepath.Join(t.TempDir(), "missing", "env"), []byte("x"), 0o600)
	if err == nil {
		t.Fatal("expected an error when the directory is missing")
	}
}
