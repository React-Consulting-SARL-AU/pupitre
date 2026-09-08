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

	if !strings.Contains(exit.Error(), "exit 3") || !strings.Contains(exit.Error(), "err") {
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

// A dump weighs more than the machine's memory: it reaches the client through the file, never through a buffer.
func TestRealRunStreamsStdinFromAFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "dump.sql")
	if err := os.WriteFile(path, []byte("-- des lignes de dump\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, err := Real{}.Run(Command{Argv: []string{"cat"}, StdinPath: path})
	if err != nil {
		t.Fatal(err)
	}

	if strings.TrimSpace(out.Stdout) != "-- des lignes de dump" {
		t.Fatalf("unexpected output %q", out.Stdout)
	}

	if _, err := (Real{}).Run(Command{Argv: []string{"cat"}, StdinPath: path + ".absent"}); err == nil {
		t.Fatal("a missing file must fail before the command runs")
	}
}

func TestDescribeShowsTheRedirectedFile(t *testing.T) {
	got := Describe(Command{User: "dev", Argv: []string{"mysql", "shop"}, StdinPath: "/home/dev/dumps/shop.sql"})
	if got != "(dev) mysql shop < /home/dev/dumps/shop.sql" {
		t.Fatalf("Describe = %q", got)
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

func TestRealReadDirNamesFoldersAndLeavesSymlinksAlone(t *testing.T) {
	dir := t.TempDir()

	if err := os.Mkdir(filepath.Join(dir, "api"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(dir, filepath.Join(dir, "loop")); err != nil {
		t.Fatal(err)
	}

	entries, err := Real{}.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	got := map[string]bool{}
	for _, entry := range entries {
		got[entry.Name] = entry.Dir
	}

	if len(got) != 3 || !got["api"] || got["README.md"] || got["loop"] {
		t.Fatalf("unexpected entries: %+v", entries)
	}

	if _, err := (Real{}).ReadDir(filepath.Join(dir, "absent")); err == nil {
		t.Fatal("a missing folder must fail")
	}
}
