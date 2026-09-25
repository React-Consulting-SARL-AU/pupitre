package archive

import (
	"archive/tar"
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func write(t *testing.T, root, rel, content string) {
	t.Helper()

	full := filepath.Join(root, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(full, []byte(content), 0o640); err != nil {
		t.Fatal(err)
	}
}

func project(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	write(t, root, "src/main.go", "package main")
	write(t, root, ".git/HEAD", "ref: refs/heads/feature")
	write(t, root, ".env.local", "SECRET=1")
	write(t, root, "node_modules/left/index.js", "left out")
	write(t, root, "client/node_modules/deep/index.js", "left out too")
	write(t, root, "client/dist/app.js", "built")

	if err := os.Symlink("src/main.go", filepath.Join(root, "inside")); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink("/etc/passwd", filepath.Join(root, "outside")); err != nil {
		t.Fatal(err)
	}

	return root
}

func TestAProjectComesBackAsItWasWithoutWhatABuildRestores(t *testing.T) {
	root := project(t)
	source := Source{Root: root, Entries: []string{Whole}, Skip: ExcludingDirs([]string{"node_modules", "dist"})}

	var archived bytes.Buffer
	if err := Write(&archived, source); err != nil {
		t.Fatal(err)
	}

	target := t.TempDir()
	if err := Extract(bytes.NewReader(archived.Bytes()), target, Unchanged); err != nil {
		t.Fatal(err)
	}

	for _, rel := range []string{"src/main.go", ".git/HEAD", ".env.local"} {
		if _, err := os.Stat(filepath.Join(target, rel)); err != nil {
			t.Fatalf("%s must come back: %v", rel, err)
		}
	}

	for _, rel := range []string{"node_modules", "client/node_modules", "client/dist", "outside"} {
		if _, err := os.Lstat(filepath.Join(target, rel)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("%s must be left out: %v", rel, err)
		}
	}

	link, err := os.Readlink(filepath.Join(target, "inside"))
	if err != nil || link != "src/main.go" {
		t.Fatalf("an inside link must stay a link: %q, %v", link, err)
	}

	info, err := os.Stat(filepath.Join(target, "src/main.go"))
	if err != nil || info.Mode().Perm() != 0o640 {
		t.Fatalf("the mode must come back: %v, %v", info.Mode(), err)
	}
}

func TestTheFingerprintMovesWithTheTreeAndOnlyWithIt(t *testing.T) {
	root := project(t)
	source := Source{Root: root, Entries: []string{Whole}, Skip: ExcludingDirs([]string{"node_modules"})}

	first, err := Fingerprint(source, "project:full")
	if err != nil {
		t.Fatal(err)
	}

	again, _ := Fingerprint(source, "project:full")
	other, _ := Fingerprint(source, "project:env")
	if first != again || first == other {
		t.Fatal("the same tree fingerprints the same, another flavor differently")
	}

	write(t, root, "node_modules/left/index.js", "changed but excluded")
	if unchanged, _ := Fingerprint(source, "project:full"); unchanged != first {
		t.Fatal("an excluded folder must not move the fingerprint")
	}

	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(filepath.Join(root, "src/main.go"), later, later); err != nil {
		t.Fatal(err)
	}
	if touched, _ := Fingerprint(source, "project:full"); touched == first {
		t.Fatal("a touched file must move the fingerprint")
	}
}

func hostile(t *testing.T, header *tar.Header, content string) []byte {
	t.Helper()

	var archived bytes.Buffer
	writer := tar.NewWriter(&archived)
	header.Size = int64(len(content))

	if err := writer.WriteHeader(header); err != nil {
		t.Fatal(err)
	}
	if _, err := writer.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	return archived.Bytes()
}

func TestAnEntryThatClimbsOutIsRefused(t *testing.T) {
	cases := []*tar.Header{
		{Name: "../escape", Typeflag: tar.TypeReg, Mode: 0o644},
		{Name: "/etc/owned", Typeflag: tar.TypeReg, Mode: 0o644},
		{Name: "link", Typeflag: tar.TypeSymlink, Linkname: "../../etc"},
		{Name: "abs", Typeflag: tar.TypeSymlink, Linkname: "/etc"},
	}

	for _, header := range cases {
		target := t.TempDir()

		err := Extract(bytes.NewReader(hostile(t, header, "")), target, Unchanged)
		var unsafe *UnsafeError
		if !errors.As(err, &unsafe) {
			t.Fatalf("%s: got %v, want a refusal", header.Name, err)
		}
	}
}

// Each link looks inside on its own: sub/up names the root, and escape names sub/up/../.., which reads as the root again. Followed on the disk, escape leads above it.
func TestAChainOfLinksThatLeadsOutIsRemovedAndRefused(t *testing.T) {
	var archived bytes.Buffer
	writer := tar.NewWriter(&archived)

	for _, header := range []*tar.Header{
		{Name: "sub/", Typeflag: tar.TypeDir, Mode: 0o755},
		{Name: "sub/up", Typeflag: tar.TypeSymlink, Linkname: ".."},
		{Name: "escape", Typeflag: tar.TypeSymlink, Linkname: "sub/up/../.."},
	} {
		if err := writer.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	target := t.TempDir()
	err := Extract(bytes.NewReader(archived.Bytes()), target, Unchanged)

	var unsafe *UnsafeError
	if !errors.As(err, &unsafe) || unsafe.Name != "escape" {
		t.Fatalf("got %v, want the escaping link refused", err)
	}

	if _, err := os.Lstat(filepath.Join(target, "escape")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a link leading out must not stay on the disk")
	}

	if _, err := os.Lstat(filepath.Join(target, "sub", "up")); err != nil {
		t.Fatalf("a link that ends inside stays: %v", err)
	}
}

func TestALinkPlantedInTheTreeIsNeverWrittenThrough(t *testing.T) {
	target := t.TempDir()
	outside := t.TempDir()

	if err := os.Symlink(outside, filepath.Join(target, "trap")); err != nil {
		t.Fatal(err)
	}

	if err := Extract(bytes.NewReader(hostile(t, &tar.Header{Name: "trap/payload", Typeflag: tar.TypeReg, Mode: 0o644}, "x")), target, Unchanged); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(outside, "payload")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("nothing may land outside the root")
	}

	if info, err := os.Lstat(filepath.Join(target, "trap")); err != nil || !info.IsDir() {
		t.Fatalf("the link must give way to a folder of the root: %v", err)
	}
}

func TestSwapReplacesAFolderWhole(t *testing.T) {
	parent := t.TempDir()
	target := filepath.Join(parent, "intranet")
	write(t, target, "stale.txt", "gone after the swap")
	scoped := openRoot(t, parent)

	staged, err := Staging(scoped, ".", "intranet", Unchanged)
	if err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(parent, staged), "fresh.txt", "restored")

	if err := Swap(scoped, staged, "intranet"); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(target, "stale.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("the folder must be replaced whole")
	}

	entries, _ := os.ReadDir(parent)
	if len(entries) != 1 {
		t.Fatalf("nothing but the project may be left beside it: %v", entries)
	}
}

func TestSmallFilesRoundTripInMemory(t *testing.T) {
	var archived bytes.Buffer
	err := WriteFiles(&archived, []File{{Name: "etc/pupitre/install.json", Content: []byte("{}"), Mode: 0o600, ModTime: time.Unix(0, 0)}})
	if err != nil {
		t.Fatal(err)
	}

	files, err := ReadFiles(&archived, 1<<20)
	if err != nil || string(files["etc/pupitre/install.json"]) != "{}" {
		t.Fatalf("files = %v, %v", files, err)
	}

	if _, err := ReadFiles(bytes.NewReader(hostile(t, &tar.Header{Name: "../x", Typeflag: tar.TypeReg}, "")), 10); err == nil {
		t.Fatal("a climbing name must be refused")
	}
}

// A running binary refuses to be written into (ETXTBSY): the restored file takes its place, and whoever holds the old one keeps it.
func TestAFileInUseIsReplacedNotWrittenInto(t *testing.T) {
	target := t.TempDir()
	write(t, target, "bin/tool", "old binary")

	held, err := os.Open(filepath.Join(target, "bin/tool"))
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()

	archived := hostile(t, &tar.Header{Name: "bin/tool", Typeflag: tar.TypeReg, Mode: 0o755, ModTime: time.Unix(1_700_000_000, 0)}, "new binary")
	if err := Extract(bytes.NewReader(archived), target, Unchanged); err != nil {
		t.Fatal(err)
	}

	kept, err := io.ReadAll(held)
	if err != nil || string(kept) != "old binary" {
		t.Fatalf("the holder reads %q, %v", kept, err)
	}

	restored, err := os.ReadFile(filepath.Join(target, "bin/tool"))
	if err != nil || string(restored) != "new binary" {
		t.Fatalf("the path reads %q, %v", restored, err)
	}

	info, err := os.Stat(filepath.Join(target, "bin/tool"))
	if err != nil || info.Mode().Perm() != 0o755 || !info.ModTime().Equal(time.Unix(1_700_000_000, 0)) {
		t.Fatalf("mode and date = %v", info)
	}

	entries, _ := os.ReadDir(filepath.Join(target, "bin"))
	if len(entries) != 1 {
		t.Fatalf("nothing staged may stay behind: %v", entries)
	}
}
