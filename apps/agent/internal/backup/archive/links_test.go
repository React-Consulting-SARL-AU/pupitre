package archive

import (
	"archive/tar"
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func link(t *testing.T, target, at string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(at), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(target, at); err != nil {
		t.Fatal(err)
	}
}

func entries(t *testing.T, archived []byte) []string {
	t.Helper()

	var names []string
	reader := tar.NewReader(bytes.NewReader(archived))

	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return names
		}

		if err != nil {
			t.Fatal(err)
		}

		names = append(names, header.Name)
	}
}

func TestAProjectWhoseFolderIsALinkIsCarriedFromWhereItLeads(t *testing.T) {
	home := t.TempDir()
	write(t, home, "work/intranet/src/main.go", "package main")
	write(t, home, "work/intranet/.env", "SECRET=1")
	link(t, "../work/intranet", filepath.Join(home, "projects/intranet"))

	source := Source{Root: filepath.Join(home, "projects/intranet"), Entries: []string{Whole}, Area: home}

	var archived bytes.Buffer
	if err := Write(&archived, source); err != nil {
		t.Fatal(err)
	}

	names := entries(t, archived.Bytes())
	if !slices.Contains(names, "src/main.go") || !slices.Contains(names, ".env") {
		t.Fatalf("the folder the link leads to must be carried: %v", names)
	}

	if _, err := Fingerprint(source, "project:full"); err != nil {
		t.Fatalf("Fingerprint: %v", err)
	}
}

func TestAnExtraPathThatIsALinkIsCarriedUnderItsOwnName(t *testing.T) {
	home := t.TempDir()
	write(t, home, "archive/notes/todo.md", "- restore everything")
	link(t, "archive/notes", filepath.Join(home, "notes"))

	var archived bytes.Buffer
	if err := Write(&archived, Source{Root: home, Entries: []string{"notes"}, Area: home}); err != nil {
		t.Fatal(err)
	}

	names := entries(t, archived.Bytes())
	if !slices.Equal(names, []string{"notes/", "notes/todo.md"}) {
		t.Fatalf("names = %v", names)
	}

	target := t.TempDir()
	if err := Extract(bytes.NewReader(archived.Bytes()), target, Unchanged); err != nil {
		t.Fatal(err)
	}

	if got, err := os.ReadFile(filepath.Join(target, "notes/todo.md")); err != nil || string(got) != "- restore everything" {
		t.Fatalf("notes/todo.md = %q, %v", got, err)
	}
}

func TestALinkThatLeadsOutOfTheAreaIsRefusedNotEmptied(t *testing.T) {
	home := t.TempDir()
	elsewhere := t.TempDir()
	write(t, elsewhere, "secret", "root only")
	link(t, elsewhere, filepath.Join(home, "projects/intranet"))
	link(t, elsewhere, filepath.Join(home, "notes"))

	for _, source := range []Source{
		{Root: filepath.Join(home, "projects/intranet"), Entries: []string{Whole}, Area: home},
		{Root: home, Entries: []string{"notes"}, Area: home},
	} {
		var outside *OutsideError

		if err := Write(io.Discard, source); !errors.As(err, &outside) {
			t.Fatalf("Write(%+v) = %v, want an OutsideError", source, err)
		}

		if _, err := Fingerprint(source, "project:full"); !errors.As(err, &outside) {
			t.Fatalf("Fingerprint(%+v) = %v, want an OutsideError", source, err)
		}
	}
}

func TestResolveSaysWhereALinkEnds(t *testing.T) {
	home := t.TempDir()
	write(t, home, "work/intranet/README", "hello")
	link(t, "../work/intranet", filepath.Join(home, "projects/intranet"))
	link(t, "../work/gone", filepath.Join(home, "projects/gone"))

	resolved, err := Resolve(filepath.Join(home, "projects/intranet"), home)
	if err != nil {
		t.Fatal(err)
	}

	real, _ := filepath.EvalSymlinks(filepath.Join(home, "work/intranet"))
	if resolved != real {
		t.Fatalf("resolved = %s, want %s", resolved, real)
	}

	if _, err := Resolve(filepath.Join(home, "projects/gone"), home); err == nil {
		t.Fatal("a link that leads nowhere cannot be followed")
	}
}

func TestWithoutAnAreaALinkIsNeverFollowed(t *testing.T) {
	home := t.TempDir()
	write(t, home, "archive/notes/todo.md", "- restore everything")
	link(t, "archive/notes", filepath.Join(home, "notes"))

	var archived bytes.Buffer
	if err := Write(&archived, Source{Root: home, Entries: []string{"notes"}}); err != nil {
		t.Fatal(err)
	}

	if names := entries(t, archived.Bytes()); !slices.Equal(names, []string{"notes"}) {
		t.Fatalf("the link alone must be kept: %v", names)
	}
}
