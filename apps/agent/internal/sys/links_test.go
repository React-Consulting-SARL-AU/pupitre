package sys

import (
	"io"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"testing"
)

// Skipped under root: root's own links are the trusted ones, so the test must plant them as another account.
func plantable(t *testing.T) *user.User {
	t.Helper()

	if os.Geteuid() == 0 {
		t.Skip("a link planted by root is one root may follow")
	}

	me, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}

	return me
}

func plant(t *testing.T, target, link string) {
	t.Helper()

	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}

func seed(t *testing.T, path, content string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func unchanged(t *testing.T, path, want string) {
	t.Helper()

	got, err := os.ReadFile(path)
	if err != nil || string(got) != want {
		t.Fatalf("%s = %q, %v; it must be left alone", path, got, err)
	}
}

func TestRealWritesRefuseAFolderLinkPlantedOnTheWay(t *testing.T) {
	me := plantable(t)
	home := t.TempDir()
	outside := t.TempDir()
	seed(t, filepath.Join(outside, "shadow"), "root:secret")
	plant(t, outside, filepath.Join(home, ".ssh"))

	through := func(name string) string { return filepath.Join(home, ".ssh", name) }

	if err := (Real{}).WriteFile(through("authorized_keys"), []byte("ssh-ed25519 AAAA"), 0o600); err == nil {
		t.Fatal("WriteFile must not go through a link another account planted")
	}

	if err := (Real{}).AppendFile(through("web.log"), []byte("line\n"), me.Username); err == nil {
		t.Fatal("AppendFile must not go through a link another account planted")
	}

	if err := (Real{}).Chown(through("shadow"), me.Username, ""); err == nil {
		t.Fatal("Chown must not go through a link another account planted")
	}

	if err := (Real{}).MkdirAll(through("sub/deeper"), 0o755); err == nil {
		t.Fatal("MkdirAll must not go through a link another account planted")
	}

	if err := (Real{}).Remove(through("shadow")); err == nil {
		t.Fatal("Remove must not go through a link another account planted")
	}

	unchanged(t, filepath.Join(outside, "shadow"), "root:secret")

	entries, _ := os.ReadDir(outside)
	if len(entries) != 1 {
		t.Fatalf("nothing may land where the link leads: %v", entries)
	}
}

func TestRealAppendFileRefusesALinkOrAFolderAtThePath(t *testing.T) {
	me := plantable(t)
	dir := t.TempDir()
	secret := filepath.Join(t.TempDir(), "shadow")
	seed(t, secret, "root:secret")
	plant(t, secret, filepath.Join(dir, "web.log"))

	if err := (Real{}).AppendFile(filepath.Join(dir, "web.log"), []byte("line\n"), me.Username); err == nil {
		t.Fatal("a link at the path must be refused, never appended through")
	}

	unchanged(t, secret, "root:secret")

	if err := os.Mkdir(filepath.Join(dir, "folder.log"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).AppendFile(filepath.Join(dir, "folder.log"), []byte("line\n"), ""); err == nil {
		t.Fatal("a folder at the path must be refused")
	}
}

func TestRealReadsOfAUsersFileRefuseALinkAtThePath(t *testing.T) {
	plantable(t)
	dir := t.TempDir()
	secret := filepath.Join(t.TempDir(), "shadow")
	seed(t, secret, "root:secret")
	link := filepath.Join(dir, "dump.sql")
	plant(t, secret, link)

	if out, err := (Real{}).Run(Command{Argv: []string{"cat"}, StdinPath: link}); err == nil || strings.Contains(out.Stdout, "secret") {
		t.Fatalf("a standard input must not be opened through a link: %q, %v", out.Stdout, err)
	}

	if tail, err := (Real{}).ReadTail(link, 64); err == nil || strings.Contains(string(tail), "secret") {
		t.Fatalf("ReadTail must not read through a link: %q, %v", tail, err)
	}

	if rest, err := (Real{}).ReadFrom(link, 0); err == nil || strings.Contains(string(rest), "secret") {
		t.Fatalf("ReadFrom must not read through a link: %q, %v", rest, err)
	}

	plant(t, filepath.Dir(secret), filepath.Join(dir, "logs"))
	if tail, err := (Real{}).ReadTail(filepath.Join(dir, "logs", "shadow"), 64); err == nil || strings.Contains(string(tail), "secret") {
		t.Fatalf("ReadTail must not read through a folder link: %q, %v", tail, err)
	}
}

func TestRealWriteFileReplacesALinkAtThePathAndLeavesItsTarget(t *testing.T) {
	plantable(t)
	dir := t.TempDir()
	secret := filepath.Join(t.TempDir(), "shadow")
	seed(t, secret, "root:secret")
	plant(t, secret, filepath.Join(dir, ".zshrc"))

	if err := (Real{}).WriteFile(filepath.Join(dir, ".zshrc"), []byte("export A=1\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	unchanged(t, secret, "root:secret")
	unchanged(t, filepath.Join(dir, ".zshrc"), "export A=1\n")
}

func TestRealCreateInStreamsANewFileForItsOwnerInsideTheRoot(t *testing.T) {
	me := plantable(t)
	home := t.TempDir()
	if err := os.Mkdir(filepath.Join(home, "dumps"), 0o755); err != nil {
		t.Fatal(err)
	}

	seed(t, filepath.Join(home, "dumps", "shop.sql"), "an older dump")

	out, err := (Real{}).CreateIn(home, "dumps/shop.sql", me.Username)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := io.WriteString(out, "CREATE TABLE t;\n"); err != nil {
		t.Fatal(err)
	}

	if err := out.Close(); err != nil {
		t.Fatal(err)
	}

	unchanged(t, filepath.Join(home, "dumps", "shop.sql"), "CREATE TABLE t;\n")

	info, err := os.Lstat(filepath.Join(home, "dumps", "shop.sql"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("a dump is its owner's alone: %v, %v", info, err)
	}
}

func TestRealCreateInNeverWritesThroughALink(t *testing.T) {
	me := plantable(t)
	home := t.TempDir()
	outside := t.TempDir()
	secret := filepath.Join(outside, "cron")
	seed(t, secret, "root:secret")

	if err := os.Mkdir(filepath.Join(home, "dumps"), 0o755); err != nil {
		t.Fatal(err)
	}

	plant(t, secret, filepath.Join(home, "dumps", "shop.sql"))

	out, err := (Real{}).CreateIn(home, "dumps/shop.sql", me.Username)
	if err != nil {
		t.Fatal(err)
	}

	io.WriteString(out, "dump")
	out.Close()

	unchanged(t, secret, "root:secret")
	unchanged(t, filepath.Join(home, "dumps", "shop.sql"), "dump")

	moved := t.TempDir()
	plant(t, outside, filepath.Join(moved, "dumps"))

	if _, err := (Real{}).CreateIn(moved, "dumps/other.sql", me.Username); err == nil {
		t.Fatal("a folder that leads out of the root must be refused")
	}

	if entries, _ := os.ReadDir(outside); len(entries) != 1 {
		t.Fatalf("nothing may land where the folder link leads: %v", entries)
	}
}
